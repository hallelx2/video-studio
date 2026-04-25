/**
 * Project the chronological list of raw AgentEvents into a structured AgentRunState
 * the UI can render directly. Inspired by AG-UI's lifecycle / start-content-end /
 * snapshot-delta patterns, adapted for our concrete event shape.
 *
 * This is a pure reducer — no side effects, deterministic output for a given event log.
 * Wrap with useMemo in components.
 */
import type { AgentEvent, UsageInfo } from "../../electron/types.js";

// ─── Canonical stage taxonomy ─────────────────────────────────────────────
// The agent's progress events carry free-form `phase` strings; we collapse them
// into a fixed pipeline so the UI can show a stable timeline that doesn't shift
// as new phases are added.

export type StageId = "read" | "script" | "narration" | "compose" | "render" | "done";

export interface Stage {
  id: StageId;
  label: string;
  /** Idle until the first matching phase event arrives. */
  status: "pending" | "active" | "complete" | "error";
  startedAt: number | null;
  endedAt: number | null;
  /** Last message we saw for this stage (the agent's most recent line). */
  message: string | null;
  /** 0-1 if available — pulled from the most recent progress event for this stage. */
  progress: number | null;
}

const STAGE_ORDER: StageId[] = ["read", "script", "narration", "compose", "render", "done"];

const PHASE_TO_STAGE: Record<string, StageId> = {
  reading_source: "read",
  design_resolved: "read",
  drafting_script: "script",
  revising_script: "script",
  narration: "narration",
  composing: "compose",
  rendering: "render",
};

const STAGE_LABELS: Record<StageId, string> = {
  read: "Read source",
  script: "Draft script",
  narration: "Narration",
  compose: "Compose",
  render: "Render",
  done: "Complete",
};

// ─── Activity stream items ────────────────────────────────────────────────
// A unified type the UI iterates over to render cards. Each event becomes
// one Activity (or merges with a prior one — see ToolCallActivity).

export type Activity =
  | TextActivity
  | ToolCallActivity
  | ProgressActivity
  | LogActivity
  | ErrorActivity
  | RawActivity;

export interface TextActivity {
  kind: "text";
  id: string;
  ts: number;
  /** Concatenated text from all blocks in the same assistant message. */
  text: string;
  messageId?: string;
}

export interface ToolCallActivity {
  kind: "tool";
  id: string;
  ts: number;
  toolName: string;
  input: unknown;
  status: "running" | "complete" | "error";
  output: string | null;
  endedAt: number | null;
}

export interface ProgressActivity {
  kind: "progress";
  id: string;
  ts: number;
  phase: string;
  message: string;
  progress: number | null;
  stageId: StageId | null;
}

export interface LogActivity {
  kind: "log";
  id: string;
  ts: number;
  level: string;
  text: string;
}

export interface ErrorActivity {
  kind: "error";
  id: string;
  ts: number;
  scope: string | null;
  message: string;
  recoverable: boolean;
}

export interface RawActivity {
  kind: "raw";
  id: string;
  ts: number;
  text: string;
}

// ─── Pending HITL prompt ──────────────────────────────────────────────────

export interface PendingPrompt {
  id: string;
  question: string;
  options: string[];
  payload: Record<string, unknown>;
}

// ─── Run metrics ──────────────────────────────────────────────────────────

export interface RunMetrics {
  /** Wall-clock start of the run (first event we saw). */
  startedAt: number | null;
  /** End of the run (when result/error arrived). */
  endedAt: number | null;
  /** Aggregated usage from all agent_result events in this run. */
  usage: UsageInfo;
  costUsd: number;
  /** Tool calls that have completed, count + total time. */
  toolCallCount: number;
  toolCallErrors: number;
  /** Assistant text blocks emitted. */
  assistantBlocks: number;
}

// ─── The full state ───────────────────────────────────────────────────────

export type RunStatus = "idle" | "running" | "awaiting_input" | "complete" | "error";

export interface AgentRunState {
  status: RunStatus;
  stages: Stage[];
  currentStageId: StageId | null;
  activities: Activity[];
  pendingPrompt: PendingPrompt | null;
  result: {
    status: "success" | "needs_input" | "failed";
    message: string | null;
    artifacts?: {
      compositionPath?: string;
      outputs?: Array<{ format: string; path: string }>;
      warnings?: string[];
    };
  } | null;
  fatalError: { scope: string | null; message: string } | null;
  metrics: RunMetrics;
}

// ─── Reducer ──────────────────────────────────────────────────────────────

/**
 * Project the entire event log into a single AgentRunState.
 *
 * Note: this is O(n) per call. For long runs this is fine — we re-derive on each
 * event arrival inside Workbench. If a run grows past a few thousand events
 * we'd switch to incremental reducer + useReducer; not needed yet.
 */
export function deriveAgentState(events: AgentEvent[]): AgentRunState {
  const state: AgentRunState = {
    status: "idle",
    stages: STAGE_ORDER.map((id) => ({
      id,
      label: STAGE_LABELS[id],
      status: "pending",
      startedAt: null,
      endedAt: null,
      message: null,
      progress: null,
    })),
    currentStageId: null,
    activities: [],
    pendingPrompt: null,
    result: null,
    fatalError: null,
    metrics: {
      startedAt: null,
      endedAt: null,
      usage: {},
      costUsd: 0,
      toolCallCount: 0,
      toolCallErrors: 0,
      assistantBlocks: 0,
    },
  };

  // We synthesize a timestamp per event from its insertion order so the UI
  // can show relative times even though we don't ship real timestamps over IPC.
  const baseTs = Date.now() - events.length;

  // Track tool calls by id so tool_result can patch the matching tool_use Activity.
  const toolCallIndex = new Map<string, number>();

  // Track text accumulation per message id so we collapse multiple text blocks
  // from one assistant message into one TextActivity.
  const textActivityByMessageId = new Map<string, number>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const ts = baseTs + i;
    if (state.metrics.startedAt === null) state.metrics.startedAt = ts;

    if (state.status === "idle") state.status = "running";

    switch (event.type) {
      case "progress": {
        const stageId = PHASE_TO_STAGE[event.phase] ?? null;
        if (stageId) {
          // Mark the matched stage active and bump prior stages to complete.
          for (const stage of state.stages) {
            if (STAGE_ORDER.indexOf(stage.id) < STAGE_ORDER.indexOf(stageId)) {
              if (stage.status === "active" || stage.status === "pending") {
                stage.status = "complete";
                if (stage.endedAt === null) stage.endedAt = ts;
              }
            } else if (stage.id === stageId) {
              if (stage.status === "pending") {
                stage.status = "active";
                stage.startedAt = ts;
              }
              stage.message = event.message ?? stage.message;
              if (typeof event.progress === "number") stage.progress = event.progress;
            }
          }
          state.currentStageId = stageId;
        }

        state.activities.push({
          kind: "progress",
          id: `e${i}`,
          ts,
          phase: event.phase,
          message: event.message ?? "",
          progress: typeof event.progress === "number" ? event.progress : null,
          stageId,
        });
        break;
      }

      case "prompt": {
        state.pendingPrompt = {
          id: event.id,
          question: event.question,
          options: event.options ?? ["approve", "request-changes", "cancel"],
          payload: event.payload ?? {},
        };
        state.status = "awaiting_input";
        break;
      }

      case "agent_text": {
        state.metrics.assistantBlocks += 1;
        // If we have a messageId and an existing TextActivity for it, append.
        const existingIdx =
          event.messageId !== undefined ? textActivityByMessageId.get(event.messageId) : undefined;
        if (existingIdx !== undefined) {
          const existing = state.activities[existingIdx] as TextActivity;
          existing.text += "\n\n" + event.text;
        } else {
          const idx = state.activities.length;
          state.activities.push({
            kind: "text",
            id: `e${i}`,
            ts,
            text: event.text,
            messageId: event.messageId,
          });
          if (event.messageId !== undefined) {
            textActivityByMessageId.set(event.messageId, idx);
          }
        }
        break;
      }

      case "agent_tool_use": {
        const idx = state.activities.length;
        toolCallIndex.set(event.id, idx);
        state.metrics.toolCallCount += 1;
        state.activities.push({
          kind: "tool",
          id: event.id,
          ts,
          toolName: typeof event.tool === "string" ? event.tool : "unknown",
          input: event.input,
          status: "running",
          output: null,
          endedAt: null,
        });
        break;
      }

      case "agent_tool_result": {
        const idx = toolCallIndex.get(event.id);
        if (idx !== undefined) {
          const tool = state.activities[idx] as ToolCallActivity;
          tool.status = event.isError ? "error" : "complete";
          tool.output = event.text ?? null;
          tool.endedAt = ts;
          if (event.isError) state.metrics.toolCallErrors += 1;
        } else {
          // Orphaned result — surface as raw so we don't silently drop it.
          state.activities.push({
            kind: "raw",
            id: `e${i}`,
            ts,
            text: `(orphan tool_result for ${event.id}) ${event.text ?? ""}`,
          });
        }
        break;
      }

      case "agent_log": {
        state.activities.push({
          kind: "log",
          id: `e${i}`,
          ts,
          level: event.level,
          text: event.text,
        });
        break;
      }

      case "agent_result": {
        if (event.usage) {
          state.metrics.usage = mergeUsage(state.metrics.usage, event.usage);
        }
        if (typeof event.costUsd === "number") {
          state.metrics.costUsd += event.costUsd;
        }
        // Don't push to activities — usage data is shown in the metrics bar, not the stream.
        break;
      }

      case "result": {
        state.metrics.endedAt = ts;
        state.result = {
          status: event.status,
          message: event.message ?? null,
          artifacts: event.artifacts,
        };
        if (event.status === "success") {
          state.status = "complete";
          // Mark all unfinished stages complete and the synthetic 'done' active.
          for (const stage of state.stages) {
            if (stage.status !== "error" && stage.id !== "done") {
              if (stage.status === "active" || stage.status === "pending") {
                stage.status = "complete";
                if (stage.endedAt === null) stage.endedAt = ts;
                if (stage.startedAt === null) stage.startedAt = ts;
              }
            }
            if (stage.id === "done") {
              stage.status = "complete";
              stage.startedAt = ts;
              stage.endedAt = ts;
            }
          }
          state.currentStageId = "done";
        } else if (event.status === "needs_input") {
          state.status = "awaiting_input";
        } else {
          state.status = "error";
          // Mark the active stage as errored.
          const active = state.stages.find((s) => s.status === "active");
          if (active) active.status = "error";
        }
        break;
      }

      case "error": {
        state.activities.push({
          kind: "error",
          id: `e${i}`,
          ts,
          scope: event.scope ?? null,
          message: event.message,
          recoverable: event.recoverable !== false,
        });
        if (event.recoverable === false) {
          state.fatalError = { scope: event.scope ?? null, message: event.message };
          state.status = "error";
          state.metrics.endedAt = ts;
          const active = state.stages.find((s) => s.status === "active");
          if (active) active.status = "error";
        }
        break;
      }

      case "raw": {
        state.activities.push({
          kind: "raw",
          id: `e${i}`,
          ts,
          text: event.text,
        });
        break;
      }

      default: {
        // Unknown future event types — surface as raw, never drop silently.
        const e = event as { type?: string } & Record<string, unknown>;
        state.activities.push({
          kind: "raw",
          id: `e${i}`,
          ts,
          text: `[${e.type ?? "?"}] ${JSON.stringify(e)}`,
        });
      }
    }
  }

  return state;
}

function mergeUsage(a: UsageInfo, b: UsageInfo): UsageInfo {
  return {
    input_tokens: (a.input_tokens ?? 0) + (b.input_tokens ?? 0),
    output_tokens: (a.output_tokens ?? 0) + (b.output_tokens ?? 0),
    cache_creation_input_tokens:
      (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  };
}

// ─── Helper formatters used by multiple components ────────────────────────

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  return `${m}m ${String(rs).padStart(2, "0")}s`;
}

export function formatTokens(n: number | undefined): string {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1000000).toFixed(2)}M`;
}

export function totalUsageTokens(u: UsageInfo): number {
  return (
    (u.input_tokens ?? 0) +
    (u.output_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0)
  );
}
