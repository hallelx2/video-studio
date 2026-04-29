import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { isFatalAppError } from "./approval-cache.js";

/**
 * Generic single-scene TTS runner extracted from generate-video.ts so
 * the standalone narration tool and the legacy macro task share one
 * spawn implementation. Behavior identical to the original; just
 * parameterized on the emit callback so callers control event scope.
 *
 * Two-phase invocation strategy: try shell:true with quoted args first
 * (works on every Linux/macOS shell + most Windows cmd.exe setups),
 * fall back to direct spawn without shell (bypasses cmd.exe quoting
 * entirely; reliable for args with embedded punctuation).
 *
 * Bails immediately on application-level errors (kokoro-onnx missing,
 * etc.) via isFatalAppError so the user sees the actionable cause
 * instead of layers of "trying next strategy" noise.
 */
export interface RunTtsArgs {
  text: string;
  voice: string;
  outputPath: string;
  sceneId: string;
  emit: (msg: unknown) => void;
  signal?: AbortSignal;
}

export async function runTtsCommand(args: RunTtsArgs): Promise<void> {
  const isWin = process.platform === "win32";

  // Normalize unicode that cmd.exe + the OEM codepage routinely mangle.
  // Smart quotes, em-dashes, ellipsis, non-breaking spaces — all get
  // re-encoded to ASCII equivalents before the text leaves Node.
  const normalized = args.text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim();

  if (!normalized) {
    throw new Error(
      `[${args.sceneId}] narration is empty after normalization — script.json scene has no text`
    );
  }

  await fs.mkdir(dirname(args.outputPath), { recursive: true });

  type Attempt = {
    label: string;
    file: string;
    spawnArgs: string[];
    options: {
      shell: boolean | string;
      windowsHide: boolean;
      stdio: ["ignore" | "pipe", "pipe", "pipe"];
    };
  };

  const quoteForCmd = (s: string): string =>
    `"${s.replace(/%/g, "").replace(/"/g, '\\"')}"`;

  const argList = [
    "hyperframes",
    "tts",
    normalized,
    "--voice",
    args.voice,
    "--output",
    args.outputPath,
  ];

  const attempts: Attempt[] = [
    {
      label: isWin ? "npx (cmd.exe + quoted args)" : "npx (posix shell)",
      file: isWin ? "npx.cmd" : "npx",
      spawnArgs: isWin ? argList.map(quoteForCmd) : argList,
      options: { shell: isWin, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    },
    {
      label: "npx (no shell)",
      file: isWin ? "npx.cmd" : "npx",
      spawnArgs: argList,
      options: { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    },
  ];

  let lastErr: Error | null = null;

  for (const attempt of attempts) {
    if (args.signal?.aborted) {
      throw new Error(`[${args.sceneId}] cancelled before spawn`);
    }
    try {
      await runOneAttempt(attempt, args);
      args.emit({
        type: "agent_log",
        level: "tts",
        text: `[${args.sceneId}] wrote ${args.outputPath}`,
      });
      return;
    } catch (err) {
      lastErr = err as Error;
      const fatal = isFatalAppError((err as Error).message ?? "");
      if (fatal.fatal) {
        args.emit({
          type: "agent_log",
          level: "tts-err",
          text: `[${args.sceneId}] fatal: ${fatal.hint ?? "non-recoverable error"}`,
        });
        throw new Error(`${fatal.hint}\n\nUnderlying error:\n${(err as Error).message}`);
      }
      args.emit({
        type: "agent_log",
        level: "tts-warn",
        text: `[${args.sceneId}] attempt failed (${attempt.label}) — trying next strategy`,
      });
    }
  }

  throw lastErr ?? new Error(`[${args.sceneId}] hyperframes tts failed (no attempts attempted)`);
}

function runOneAttempt(
  attempt: {
    label: string;
    file: string;
    spawnArgs: string[];
    options: {
      shell: boolean | string;
      windowsHide: boolean;
      stdio: ["ignore" | "pipe", "pipe", "pipe"];
    };
  },
  args: RunTtsArgs
): Promise<void> {
  return new Promise((resolveCmd, rejectCmd) => {
    const previewCommand = `${attempt.file} ${attempt.spawnArgs.join(" ")}`;
    args.emit({
      type: "agent_log",
      level: "tts",
      text: `[${args.sceneId}] spawn (${attempt.label}): ${previewCommand}`,
    });

    const proc = spawn(attempt.file, attempt.spawnArgs, attempt.options);
    let stdoutBuf = "";
    let stderrBuf = "";

    const onAbort = () => {
      try {
        proc.kill("SIGTERM");
      } catch {
        // already gone
      }
    };
    args.signal?.addEventListener?.("abort", onAbort);

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutBuf += text;
      for (const line of cleanProgressLines(text)) {
        args.emit({ type: "agent_log", level: "tts", text: `[${args.sceneId}] ${line}` });
      }
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrBuf += text;
      for (const line of cleanProgressLines(text)) {
        args.emit({ type: "agent_log", level: "tts-err", text: `[${args.sceneId}] ${line}` });
      }
    });

    proc.on("error", (err) => {
      args.signal?.removeEventListener?.("abort", onAbort);
      rejectCmd(
        new Error(`[${args.sceneId}] failed to spawn (${attempt.label}): ${err.message}`)
      );
    });
    proc.on("exit", (code) => {
      args.signal?.removeEventListener?.("abort", onAbort);
      if (code === 0) {
        resolveCmd();
        return;
      }
      const stderrFull = stderrBuf.trim();
      const stdoutTail = stdoutBuf.trim().split(/\r?\n/).slice(-5).join("\n");
      rejectCmd(
        new Error(
          [
            `[${args.sceneId}] hyperframes tts exited with code ${code} (${attempt.label})`,
            `command: ${previewCommand}`,
            stderrFull ? `stderr:\n${stderrFull}` : "stderr: (empty)",
            stdoutTail ? `stdout-tail:\n${stdoutTail}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        )
      );
    });
  });
}

/**
 * Strip ANSI escape codes + carriage-return-only progress lines so the
 * activity stream stays readable. Matches the original generate-video
 * version verbatim.
 */
function cleanProgressLines(chunk: string): string[] {
  return chunk
    .split(/\r?\n/)
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
    .filter(Boolean);
}
