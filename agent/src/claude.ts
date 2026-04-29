import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { emit, emitActivity } from "./index.js";

export interface RunAgentOptions {
  /** The user-facing prompt describing the task in plain English */
  prompt: string;
  /** The system prompt — loaded from agent/prompts/system.md */
  systemPrompt: string;
  /** Working directory the agent operates inside (the studio workspace) */
  cwd: string;
  /** Environment overrides passed to child processes spawned by the agent */
  env?: Record<string, string>;
  /** Model id to drive this run. Falls through to whatever the SDK / CLI default is. */
  model?: string;
}

/**
 * Find the user's `claude` CLI executable on the system.
 *
 * The Bun-compiled agent binary doesn't include the Claude Code native CLI
 * (it ships as an optional npm dep that gets stripped at compile time), so
 * we have to point the Agent SDK at the user's system-installed claude CLI.
 *
 * Tries `where claude` (Windows) / `which claude` (Unix), prefers .cmd/.exe
 * files on Windows, and falls back to a few common install locations.
 */
function findClaudeCli(): string | undefined {
  // 1. Try `where`/`which` (uses the user's PATH)
  try {
    const cmd = process.platform === "win32" ? "where claude" : "which claude";
    const result = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    const lines = result.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length > 0) {
      // On Windows prefer .cmd or .exe (skip bare "claude" which is a shell script)
      if (process.platform === "win32") {
        const win = lines.find((l) => /\.(cmd|exe|bat)$/i.test(l));
        if (win) return win.trim();
      }
      return lines[0].trim();
    }
  } catch {
    // fall through to fallback paths
  }

  // 2. Common install locations
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const fallbacks: string[] = process.platform === "win32"
    ? [
        `${home}\\.local\\bin\\claude.exe`,
        `${home}\\AppData\\Roaming\\npm\\claude.cmd`,
        `${home}\\scoop\\apps\\nodejs\\current\\bin\\claude.cmd`,
        `${home}\\scoop\\shims\\claude.cmd`,
      ]
    : [
        `${home}/.local/bin/claude`,
        `/usr/local/bin/claude`,
        `/opt/homebrew/bin/claude`,
      ];

  for (const candidate of fallbacks) {
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

/**
 * Patterns we treat as transient SDK / network failures — anything that's
 * worth a backoff retry instead of failing the run. Stream idle timeouts,
 * partial responses, socket resets, fetch failures, generic 5xx envelopes.
 *
 * The list is conservative: anything that doesn't match falls through and
 * the run aborts (auth errors, permission errors, malformed model ids etc.
 * are NOT retryable — there's no point waiting and trying again).
 */
const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /idle timeout/i,
  /partial response/i,
  /stream.*timeout/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EPIPE/i,
  /socket hang up/i,
  /fetch failed/i,
  /network.*error/i,
  /503/,
  /504/,
];

function isTransientSdkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_PATTERNS.some((re) => re.test(msg));
}

/**
 * Run a Claude Agent SDK query with streaming, with retry-with-backoff on
 * transient stream/network errors.
 *
 * Uses the user's local ~/.claude/ credentials via the SDK's auto-detection.
 * Do NOT set ANTHROPIC_API_KEY in env — that would opt into per-token billing.
 *
 * Streams every assistant message, tool use, and tool result to stdout as JSONL
 * progress events that the renderer can show live.
 *
 * Retries: up to 2 attempts after the initial call (3 total) on transient
 * errors only. Exponential backoff: 5s → 15s. Auth/permission/model errors
 * are NOT retried — they need user action, not a wait.
 *
 * Note: a retry restarts the whole agent query from the top of the prompt.
 * The SDK doesn't expose mid-stream resume, so partial work from a failed
 * attempt is redone. For idempotent stages (file writes) that's fine; for
 * anything that costs Opus tokens it's the price of resilience. The
 * detectResume() pass at the start of generate-video skips entire stages
 * whose artifacts are already on disk, which absorbs most of the waste.
 */
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [5000, 15000] as const;

export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const claudePath = process.env.CLAUDE_CLI_PATH || findClaudeCli();

  if (claudePath) {
    emit({ type: "agent_log", text: `Using Claude CLI at: ${claudePath}` });
  } else {
    emit({
      type: "error",
      scope: "startup",
      message:
        "Claude Code CLI not found. Install with `npm i -g @anthropic-ai/claude-code` and run `claude login`. " +
        "Or set CLAUDE_CLI_PATH env var to the absolute path of your claude executable.",
      recoverable: false,
    });
    return;
  }

  let attempt = 0;
  while (true) {
    try {
      const result = query({
        prompt: opts.prompt,
        options: {
          cwd: opts.cwd,
          systemPrompt: { type: "preset", preset: "claude_code", append: opts.systemPrompt },
          permissionMode: "bypassPermissions",
          env: opts.env,
          includePartialMessages: false,
          pathToClaudeCodeExecutable: claudePath,
          // Per-run model override. The SDK passes this through to /v1/messages.
          ...(opts.model ? { model: opts.model } : {}),
        },
      });

      for await (const msg of result) {
        // Per-turn heartbeat: lets the renderer rotate "considering /
        // pondering / synthesizing" verbs while the model is mid-flight.
        // emitActivity throttles internally so this is at most one event
        // per 1.2s regardless of how chatty the SDK iterator is.
        emitActivity("considering");
        streamMessage(msg);
      }
      return; // clean run — done.
    } catch (err) {
      const transient = isTransientSdkError(err);
      const errMsg = err instanceof Error ? err.message : String(err);

      if (!transient || attempt >= MAX_RETRIES) {
        // Either non-retryable (auth, perms, etc) or we've exhausted
        // retries — surface and let the catch in main() turn it into a
        // fatal error event.
        throw err;
      }

      const backoffMs = RETRY_BACKOFF_MS[attempt];
      attempt += 1;
      emit({
        type: "agent_log",
        level: "retry",
        text: `Transient SDK error (attempt ${attempt}/${MAX_RETRIES + 1}): ${errMsg} — retrying in ${Math.round(backoffMs / 1000)}s`,
      });
      emit({
        type: "progress",
        phase: "retrying",
        message: `Stream interrupted — retry ${attempt}/${MAX_RETRIES + 1} in ${Math.round(backoffMs / 1000)}s`,
      });
      emitActivity("retrying", { force: true });
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

function streamMessage(msg: unknown) {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;

  switch (m.type) {
    case "assistant":
      emitAssistantBlocks(m);
      break;
    case "tool_use":
      emit({
        type: "agent_tool_use",
        id: typeof m.id === "string" ? m.id : `tu_${Date.now()}`,
        tool: m.name,
        input: m.input,
      });
      break;
    case "tool_result":
      emit({
        type: "agent_tool_result",
        id: typeof m.tool_use_id === "string" ? m.tool_use_id : "unknown",
        text: extractToolResultText(m.content),
        isError: Boolean(m.is_error),
      });
      break;
    case "result":
      emit({
        type: "agent_result",
        subtype: typeof m.subtype === "string" ? m.subtype : undefined,
        usage: m.usage ?? null,
        costUsd: typeof m.total_cost_usd === "number" ? m.total_cost_usd : undefined,
        durationMs: typeof m.duration_ms === "number" ? m.duration_ms : undefined,
      });
      break;
  }
}

/**
 * Walk every block of an assistant message and emit text/tool_use events.
 * Each assistant message may interleave text and tool_use blocks; we surface
 * them as separate events keyed by message id + block index so the UI can
 * pair tool_use → tool_result and group consecutive text blocks visually.
 */
function emitAssistantBlocks(assistantMsg: Record<string, unknown>) {
  const message = assistantMsg.message as
    | {
        id?: string;
        content?: Array<Record<string, unknown>>;
      }
    | undefined;
  if (!message?.content) return;

  const messageId = message.id ?? `msg_${Date.now()}`;

  for (const block of message.content) {
    if (block.type === "text" && typeof block.text === "string") {
      emit({ type: "agent_text", messageId, text: block.text });
      continue;
    }
    if (block.type === "tool_use") {
      emit({
        type: "agent_tool_use",
        id: typeof block.id === "string" ? block.id : `tu_${Date.now()}`,
        // Propagate the parent assistant message id so the UI can group
        // consecutive text + tool_use blocks from the same response together.
        messageId,
        tool: block.name,
        input: block.input,
      });
      continue;
    }
  }
}

/**
 * Tool results arrive as either a plain string or an array of content blocks
 * ([{type: "text", text: "..."}]). Normalise to a single string for the UI.
 */
function extractToolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (block && typeof block === "object" && "text" in block && typeof (block as Record<string, unknown>).text === "string") {
        return (block as { text: string }).text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
