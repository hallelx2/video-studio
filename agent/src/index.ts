import { runGenerateVideo } from "./tasks/generate-video.js";
import { SYSTEM_PROMPT } from "./system-prompt.generated.js";

type AgentCommand =
  | {
      type: "generate-video";
      projectId: string;
      videoType: string;
      formats: string[];
      brief: string;
      model?: string;
      persona?: string;
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

// ─── Keep-alive while awaiting user input ─────────────────────────────────
// On Windows + ELECTRON_RUN_AS_NODE, after the Claude CLI subprocess exits
// the event loop can drain even with `process.stdin.on("data")` registered,
// causing the agent process to exit cleanly mid-approval. The result is the
// host sees `proc === null` when the user finally responds and emits
// "agent had already exited when this response arrived". A no-op interval
// keeps at least one ref'd handle alive while a prompt is in flight, then
// gets cleared as soon as everything resolves so we still exit cleanly
// after a normal run.
let keepalive: NodeJS.Timeout | null = null;
function ensureKeepalive(): void {
  if (keepalive) return;
  keepalive = setInterval(() => {
    /* heartbeat — pin the event loop while a prompt is parked */
  }, 30_000);
}
function releaseKeepaliveIfIdle(): void {
  if (pending.size === 0 && keepalive) {
    clearInterval(keepalive);
    keepalive = null;
  }
}

/** Emit a prompt event to the host and resolve when the user responds. */
export function askUser(
  question: string,
  options: string[],
  payload?: Record<string, unknown>
): Promise<string> {
  const id = `prompt-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  emit({ type: "prompt", id, question, options, payload: payload ?? {} });
  ensureKeepalive();
  return new Promise<string>((resolve) => {
    pending.set(id, resolve);
  });
}

// ─── Stdin reader ─────────────────────────────────────────────────────────
// Read NDJSON from stdin. Each line is one PromptResponseMessage.
function setupStdin(): void {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  // Force flowing mode + keep the stream ref'd. Belt-and-suspenders against
  // the Windows event-loop drain that causes mid-approval exits.
  process.stdin.resume();
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
            releaseKeepaliveIfIdle();
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
          model: command.model,
          persona: command.persona,
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
      const model =
        typeof parsed.model === "string" && parsed.model.length > 0 ? parsed.model : undefined;
      const persona =
        typeof parsed.persona === "string" && parsed.persona.length > 0
          ? parsed.persona
          : undefined;
      if (!projectId) return null;
      return {
        type: "generate-video",
        projectId,
        videoType,
        formats,
        brief,
        model,
        persona,
      };
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

/**
 * Activity-state names mirror the union in electron/types.ts. Duplicated
 * (not imported) because the agent runs as a separate compiled bundle and
 * we don't want a build-time dependency on the electron tsconfig.
 */
export type ActivityState =
  | "reading"
  | "considering"
  | "drafting"
  | "revising"
  | "narrating"
  | "composing"
  | "rendering"
  | "polishing"
  | "stitching"
  | "waiting"
  | "retrying";

/**
 * Throttle map — last-emit timestamp keyed by `${state}:${sceneId ?? ""}`.
 * The activity channel is high-frequency (every SDK turn boundary, every
 * scene's TTS spawn, etc.) so we collapse adjacent same-state events to
 * at most one per `MIN_INTERVAL_MS` to avoid flooding the renderer with
 * redundant verb refreshes.
 */
const ACTIVITY_THROTTLE = new Map<string, number>();
const ACTIVITY_THROTTLE_MS = 1200;

export function emitActivity(
  state: ActivityState,
  opts: { sceneId?: string; subject?: string; force?: boolean } = {}
): void {
  const key = `${state}:${opts.sceneId ?? ""}`;
  const now = Date.now();
  if (!opts.force) {
    const last = ACTIVITY_THROTTLE.get(key) ?? 0;
    if (now - last < ACTIVITY_THROTTLE_MS) return;
  }
  ACTIVITY_THROTTLE.set(key, now);
  emit({
    type: "activity",
    state,
    ...(opts.sceneId ? { sceneId: opts.sceneId } : {}),
    ...(opts.subject ? { subject: opts.subject } : {}),
  });
}

main();
