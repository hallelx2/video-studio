import { runGenerateVideo } from "./tasks/generate-video.js";
import { SYSTEM_PROMPT } from "./system-prompt.generated.js";

type AgentCommand =
  | {
      type: "generate-video";
      projectId: string;
      videoType: string;
      formats: string[];
      brief: string;
    }
  | { type: "list-projects" };

interface PromptResponseMessage {
  type: "prompt-response";
  id: string;
  response: string;
}

// ─── Pending-prompt registry ──────────────────────────────────────────────
// askUser() emits a prompt event and parks a Promise here, keyed by id.
// The stdin reader resolves it when a matching {type:"prompt-response"} arrives.
const pending = new Map<string, (response: string) => void>();

/** Emit a prompt event to the host and resolve when the user responds. */
export function askUser(
  question: string,
  options: string[],
  payload?: Record<string, unknown>
): Promise<string> {
  const id = `prompt-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  emit({ type: "prompt", id, question, options, payload: payload ?? {} });
  return new Promise<string>((resolve) => {
    pending.set(id, resolve);
  });
}

// ─── Stdin reader ─────────────────────────────────────────────────────────
// Read NDJSON from stdin. Each line is one PromptResponseMessage.
function setupStdin(): void {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as PromptResponseMessage;
        if (msg.type === "prompt-response") {
          const resolver = pending.get(msg.id);
          if (resolver) {
            pending.delete(msg.id);
            resolver(msg.response);
          }
        }
      } catch {
        // ignore malformed lines
      }
    }
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  setupStdin();

  const args = process.argv.slice(2);
  if (args.length === 0) {
    emit({
      type: "error",
      scope: "startup",
      message: "no command provided",
      recoverable: false,
    });
    process.exit(1);
  }

  const command = parseCommand(args);
  if (!command) {
    emit({
      type: "error",
      scope: "startup",
      message: `unknown or malformed command: ${args[0]}`,
      recoverable: false,
    });
    process.exit(1);
  }

  try {
    switch (command.type) {
      case "generate-video":
        await runGenerateVideo({
          projectId: command.projectId,
          videoType: command.videoType,
          formats: command.formats,
          brief: command.brief,
          systemPrompt: SYSTEM_PROMPT,
          askUser,
        });
        break;
      case "list-projects":
        // The Electron host owns the project listing now (electron/projects.ts).
        // This branch only stays for symmetry / future remote-agent use.
        emit({
          type: "error",
          scope: "command",
          message: "list-projects is owned by the Electron host, not the agent",
          recoverable: true,
        });
        process.exit(0);
    }
  } catch (err) {
    emit({
      type: "error",
      scope: "runtime",
      message: err instanceof Error ? err.message : String(err),
      recoverable: false,
    });
    process.exit(1);
  }

  // Done — the host can detect EOF on stdout to know we exited cleanly.
  process.exit(0);
}

function parseCommand(args: string[]): AgentCommand | null {
  const [cmd, payload] = args;
  if (cmd === "generate-video" && payload) {
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      const projectId = String(parsed.projectId ?? "").trim();
      const videoType = String(parsed.videoType ?? "product-launch");
      const formats = Array.isArray(parsed.formats)
        ? (parsed.formats as string[])
        : ["linkedin"];
      const brief = String(parsed.brief ?? "");
      if (!projectId) return null;
      return { type: "generate-video", projectId, videoType, formats, brief };
    } catch {
      return null;
    }
  }
  if (cmd === "list-projects") {
    return { type: "list-projects" };
  }
  return null;
}

export function emit(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

main();
