import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { emit } from "./index.js";

export interface RunAgentOptions {
  /** The user-facing prompt describing the task in plain English */
  prompt: string;
  /** The system prompt — loaded from agent/prompts/system.md */
  systemPrompt: string;
  /** Working directory the agent operates inside (the studio workspace) */
  cwd: string;
  /** Environment overrides passed to child processes spawned by the agent */
  env?: Record<string, string>;
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
 * Run a Claude Agent SDK query with streaming.
 *
 * Uses the user's local ~/.claude/ credentials via the SDK's auto-detection.
 * Do NOT set ANTHROPIC_API_KEY in env — that would opt into per-token billing.
 *
 * Streams every assistant message, tool use, and tool result to stdout as JSONL
 * progress events that the Tauri frontend can render live.
 */
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

  const result = query({
    prompt: opts.prompt,
    options: {
      cwd: opts.cwd,
      systemPrompt: { type: "preset", preset: "claude_code", append: opts.systemPrompt },
      permissionMode: "bypassPermissions",
      env: opts.env,
      includePartialMessages: false,
      pathToClaudeCodeExecutable: claudePath,
    },
  });

  for await (const msg of result) {
    streamMessage(msg);
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
