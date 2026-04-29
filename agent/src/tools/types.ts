/**
 * Shared contract for the per-stage tools that replace the monolithic
 * generate-video.ts task. Each tool is independently invocable by the
 * renderer via the `studio.agent.runTool` IPC, and composable by the
 * macro `full-pipeline.ts` orchestrator.
 *
 * A tool is responsible for:
 *   - Knowing whether its outputs are already cached (idempotent runs)
 *   - Producing well-defined artifacts on disk
 *   - Emitting `tool_started` / `tool_finished` events at its boundaries
 *   - Cleaning up downstream artifacts when its inputs change (cascade)
 *
 * The tool DOES NOT own:
 *   - Pipeline ordering — that's the macro's job
 *   - Full workspace lifecycle — only its own slice
 *   - User interaction beyond an optional approval prompt
 */

export type ToolStatus =
  | "ok"
  | "skipped"
  | "cancelled"
  | "needs-approval"
  | "error";

export interface ToolContext {
  projectId: string;
  sessionId: string;
  /** Per-session workspace dir: <workspaceRoot>/<projectId>/<sessionId>. */
  workspaceDir: string;
  orgRoot: string;
  /** Already persona-applied. Threaded into every runAgent call inside
   *  the tool — tools never re-apply the persona themselves. */
  systemPrompt: string;
  model?: string;
  persona?: string;
  ttsVoice: string;
  /** NDJSON emitter that forwards through to the parent process stdout. */
  emit: (msg: unknown) => void;
  /** Approval gate — set by the macro orchestrator. When undefined, the
   *  tool short-circuits any approval to "ok" (used for direct
   *  renderer-driven invocations where the user is already deciding via
   *  button clicks). */
  askUser?: (
    question: string,
    options: string[],
    payload?: Record<string, unknown>
  ) => Promise<string>;
  /** Cancellation signal propagated from the parent process when the
   *  user cancels the run. Tools should listen and abort their own
   *  subprocess spawns / SDK iterators. */
  signal?: AbortSignal;
}

export interface ToolResult<O = unknown> {
  status: ToolStatus;
  output?: O;
  /** Absolute paths of files this run produced (or refreshed). Empty
   *  array on skipped/cached runs. */
  artifacts?: string[];
  /** Hash of the inputs+outputs for downstream cache decisions. */
  cacheHash?: string;
  /** Human-readable message for non-ok statuses. */
  message?: string;
}

export interface Tool<I = unknown, O = unknown> {
  /** Stable id used by the IPC dispatcher (e.g. "narration.generate"). */
  name: string;
  /** Cheap predicate — should return without doing real work. */
  isCached(ctx: ToolContext, input: I): Promise<{ hit: boolean; hash?: string }>;
  /** The actual operation. Must emit tool_started/tool_finished events. */
  run(ctx: ToolContext, input: I): Promise<ToolResult<O>>;
}

/**
 * Tool dispatcher event shape — keyed off the existing AgentEvent union
 * in electron/types.ts. The bridge's generic forwarder passes these
 * through to the renderer untouched.
 */
export interface ToolStartedEvent {
  type: "tool_started";
  name: string;
  toolCallId: string;
  input?: unknown;
}

export interface ToolFinishedEvent {
  type: "tool_finished";
  name: string;
  toolCallId: string;
  status: ToolStatus;
  message?: string;
}

let __toolCallSeq = 0;
export function nextToolCallId(): string {
  __toolCallSeq += 1;
  return `tc_${Date.now()}_${__toolCallSeq}`;
}
