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
  awaiting_approval: "script",
  narration: "narration",
  composing: "compose",
  awaiting_compose_approval: "compose",
  revising_composition: "compose",
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
  | UserActivity
  | TextActivity
  | ToolCallActivity
  | ProgressActivity
  | LogActivity
  | ErrorActivity
  | RawActivity;

export interface UserActivity {
  kind: "user";
  id: string;
  ts: number;
  text: string;
  /** brief = first message that kicked off the run.
   *  interrupt = mid-flight redirect.
   *  approval-response = response submitted to a pending prompt.
   *  follow-up = sent after a run completed. */
  intent: "brief" | "interrupt" | "approval-response" | "follow-up";
}

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
  /** Parent assistant message id, when known. Lets the UI group a single
   *  assistant response's text + tool blocks into one cohesive message. */
  messageId?: string;
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
  /** Files the agent has touched, derived from Read/Write/Edit tool calls. */
  artifacts: Artifact[];
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
    artifacts: [],
  };

  // We synthesize a timestamp per event from its insertion order so the UI
  // can show relative times even though we don't ship real timestamps over IPC.
  const baseTs = Date.now() - events.length;

  // Track tool calls by id so tool_result can patch the matching tool_use Activity.
  const toolCallIndex = new Map<string, number>();

  // Track text accumulation per message id so we collapse multiple text blocks
  // from one assistant message into one TextActivity.
  const textActivityByMessageId = new Map<string, number>();

  // Track whether we just passed a terminal state. The next user_message
  // after a terminal event marks the start of a new turn, and we reset
  // per-run state so the StreamEndIndicator and metrics bar stop reflecting
  // the previous run's outcome while the new one is in flight.
  let postTerminal = false;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const ts = baseTs + i;

    // Reset per-run state when a new turn opens after a terminal event.
    // Keeps cumulative session totals (usage, cost, toolCallCount) but wipes
    // the ephemeral fields that describe "the current run".
    if (event.type === "user_message" && postTerminal) {
      state.status = "running";
      state.result = null;
      state.fatalError = null;
      state.pendingPrompt = null;
      state.currentStageId = null;
      state.stages = STAGE_ORDER.map((id) => ({
        id,
        label: STAGE_LABELS[id],
        status: "pending",
        startedAt: null,
        endedAt: null,
        message: null,
        progress: null,
      }));
      state.metrics.startedAt = ts;
      state.metrics.endedAt = null;
      postTerminal = false;
    }

    if (state.metrics.startedAt === null) state.metrics.startedAt = ts;

    if (state.status === "idle") state.status = "running";

    // If a prompt was outstanding and the agent just emitted a "moving on"
    // signal (next progress, text, tool call, or result), clear the prompt
    // so the InlineApproval card unmounts and the new stage's activity
    // takes its place at the bottom of the stream. Background telemetry
    // (agent_log, raw stderr) doesn't count — the prompt is only resolved
    // when the agent itself has clearly resumed work.
    if (
      state.pendingPrompt !== null &&
      (event.type === "progress" ||
        event.type === "agent_text" ||
        event.type === "agent_tool_use" ||
        event.type === "agent_tool_result")
    ) {
      state.pendingPrompt = null;
      if (state.status === "awaiting_input") state.status = "running";
    }

    // The bridge surfaces a recoverable agent-respond error when the user
    // clicks approve/cancel after the agent already exited. The prompt is
    // now orphaned (the dead bridge can't deliver the response anyway),
    // so clear it and let the user start a fresh run.
    if (
      state.pendingPrompt !== null &&
      event.type === "error" &&
      event.scope === "agent-respond"
    ) {
      state.pendingPrompt = null;
      if (state.status === "awaiting_input") state.status = "running";
    }

    switch (event.type) {
      case "user_message": {
        state.activities.push({
          kind: "user",
          id: `e${i}`,
          ts,
          text: event.text,
          intent: event.kind,
        });
        break;
      }

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
        // Defensive: occasionally the agent's stdout pipe leaks a stringified
        // progress/log event into the assistant text channel — most often
        // when a child process writes its own NDJSON to stderr. Detect and
        // re-route so the user never sees raw `{"type":"progress",...}` JSON
        // rendered as the agent's "voice".
        const leaked = parseLeakedEvent(event.text);
        if (leaked && leaked.type === "progress") {
          const stageId = PHASE_TO_STAGE[leaked.phase ?? ""] ?? null;
          if (stageId) {
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
                stage.message = leaked.message ?? stage.message;
                if (typeof leaked.progress === "number") stage.progress = leaked.progress;
              }
            }
            state.currentStageId = stageId;
          }
          state.activities.push({
            kind: "progress",
            id: `e${i}`,
            ts,
            phase: leaked.phase ?? "unknown",
            message: leaked.message ?? "",
            progress: typeof leaked.progress === "number" ? leaked.progress : null,
            stageId,
          });
          break;
        }
        if (leaked && leaked.type === "log") {
          state.activities.push({
            kind: "log",
            id: `e${i}`,
            ts,
            level: leaked.level ?? "info",
            text: leaked.text ?? "",
          });
          break;
        }
        // Drop any other leaked control events — they're noise, not voice.
        if (leaked) break;

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
          messageId: event.messageId,
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
        // The run is over — any prompt that was outstanding is moot. Clearing
        // here means the composer treats the next user message as a follow-up
        // (new run) instead of routing it to a dead `agent:respond` IPC.
        state.pendingPrompt = null;
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
        postTerminal = true;
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
          // Same reason as in `result` — the agent is gone, so any pending
          // prompt would only route the next message to a dead IPC handler.
          state.pendingPrompt = null;
          const active = state.stages.find((s) => s.status === "active");
          if (active) active.status = "error";
          postTerminal = true;
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

  // Derive artifacts from the same event log — Hypatia pattern: every view
  // model is a pure function of the message stream.
  state.artifacts = extractArtifacts(events);

  // Finalization: any tool call that's STILL marked "running" once the run
  // is done (or paused for input) MUST have actually completed — the SDK
  // serializes tool execution within a turn, so the agent can't have moved
  // past it without a tool_result. We sometimes drop the result event (id
  // mismatch, mid-stream interruption, etc), which leaves the row stuck
  // showing "Running…" forever. Sweep them to "complete" so the timeline
  // reads correctly.
  if (
    state.status === "complete" ||
    state.status === "error" ||
    state.status === "awaiting_input"
  ) {
    for (const a of state.activities) {
      if (a.kind === "tool" && a.status === "running") {
        a.status = "complete";
        if (a.endedAt === null) {
          a.endedAt = state.metrics.endedAt ?? a.ts;
        }
      }
    }
  }

  // Mid-run sweep: a running tool call is also stale if a LATER tool call
  // (or the agent's next text/result) exists in the timeline — the agent
  // can only emit those after the prior tool returned. Mark the predecessor
  // complete so "Running… 171s" doesn't linger on a tool the agent has
  // already moved past.
  let lastSettledIdx = -1;
  for (let i = state.activities.length - 1; i >= 0; i--) {
    const a = state.activities[i];
    if (a.kind === "tool" && a.status !== "running") {
      lastSettledIdx = i;
      break;
    }
    if (a.kind === "text" || a.kind === "user") {
      lastSettledIdx = i;
      break;
    }
  }
  if (lastSettledIdx >= 0) {
    for (let i = 0; i < lastSettledIdx; i++) {
      const a = state.activities[i];
      if (a.kind === "tool" && a.status === "running") {
        a.status = "complete";
        if (a.endedAt === null) a.endedAt = a.ts;
      }
    }
  }

  return state;
}

/**
 * Detect an agent_text payload that's actually a stringified control event
 * leaking through the wrong channel. Returns the parsed shape if so, null
 * otherwise. Cheap fast-path: bail unless the trimmed text starts with `{`
 * AND contains `"type":"progress"` / `"type":"log"`.
 *
 * We intentionally accept only the small set of internal event types we own.
 * Anything else (including legitimate JSON the agent might quote in its
 * voice for the user) falls through to normal text rendering.
 */
function parseLeakedEvent(text: string): {
  type: "progress" | "log" | "result" | "error";
  phase?: string;
  message?: string;
  progress?: number;
  level?: string;
  text?: string;
} | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  if (
    !trimmed.includes('"type":"progress"') &&
    !trimmed.includes('"type":"log"') &&
    !trimmed.includes('"type":"result"') &&
    !trimmed.includes('"type":"error"')
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const type = parsed.type;
    if (type !== "progress" && type !== "log" && type !== "result" && type !== "error") {
      return null;
    }
    return {
      type,
      phase: typeof parsed.phase === "string" ? parsed.phase : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
      progress: typeof parsed.progress === "number" ? parsed.progress : undefined,
      level: typeof parsed.level === "string" ? parsed.level : undefined,
      text: typeof parsed.text === "string" ? parsed.text : undefined,
    };
  } catch {
    return null;
  }
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

// ─── Artifact extraction (Hypatia-style derived view) ────────────────────
// We don't store artifacts separately — they're a pure function of the event
// log. Any tool call with a file_path argument adds/updates an entry. The
// most recent Write/Edit wins; otherwise we record a Read.

export type ArtifactKind =
  | "script"        // script.json
  | "design"        // DESIGN.md
  | "brief"         // source-brief.md
  | "manifest"      // manifest.json
  | "composition"   // index.html (root or sub)
  | "narration"     // narration/*.wav
  | "render"        // output/*.mp4
  | "config"        // package.json, tsconfig.json
  | "code"          // .ts/.tsx/.js/.css
  | "doc"           // README, *.md
  | "other";

export interface Artifact {
  /** Stable identity by full path so the UI doesn't churn. */
  path: string;
  /** Last known basename. */
  name: string;
  /** Lowercase extension without leading dot. */
  ext: string;
  kind: ArtifactKind;
  /** Most recent action recorded for this file. */
  lastAction: "wrote" | "edited" | "read";
  /** Tool call id of the most recent action (used as a React key). */
  lastToolId: string;
  /** Order index in the event log of the most recent action. */
  lastIndex: number;
  /** If we wrote it, the content the agent passed in — no need to re-read disk. */
  inlineContent: string | null;
  /** Number of times this file has been touched. */
  touches: number;
}

export function extractArtifacts(events: AgentEvent[]): Artifact[] {
  const byPath = new Map<string, Artifact>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "agent_tool_use") continue;
    const tool = event.tool;
    if (tool !== "Read" && tool !== "Write" && tool !== "Edit") continue;

    const input = event.input as Record<string, unknown> | null | undefined;
    const path = input && typeof input.file_path === "string" ? input.file_path : null;
    if (!path) continue;

    const existing = byPath.get(path);
    const action: Artifact["lastAction"] =
      tool === "Write" ? "wrote" : tool === "Edit" ? "edited" : "read";

    // Don't downgrade: if we already saw a Write/Edit, a later Read shouldn't
    // overwrite the inlineContent or the more meaningful action.
    if (existing) {
      const existingScore = scoreAction(existing.lastAction);
      const newScore = scoreAction(action);
      if (newScore >= existingScore) {
        existing.lastAction = action;
        existing.lastToolId = event.id;
        existing.lastIndex = i;
        if (tool === "Write" && typeof input?.content === "string") {
          existing.inlineContent = input.content;
        }
      } else {
        existing.lastIndex = i; // still bump for sort recency
      }
      existing.touches += 1;
      continue;
    }

    byPath.set(path, {
      path,
      name: basename(path),
      ext: extOf(path),
      kind: classifyArtifact(path),
      lastAction: action,
      lastToolId: event.id,
      lastIndex: i,
      inlineContent:
        tool === "Write" && typeof input?.content === "string" ? input.content : null,
      touches: 1,
    });
  }

  // Sort by recency (most recent first) so newly-touched files surface to the top.
  return Array.from(byPath.values()).sort((a, b) => b.lastIndex - a.lastIndex);
}

function scoreAction(action: Artifact["lastAction"]): number {
  switch (action) {
    case "wrote":
      return 3;
    case "edited":
      return 2;
    case "read":
      return 1;
  }
}

function basename(path: string): string {
  // Handle both \ and / separators (Windows / Unix)
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}

function extOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "";
}

function classifyArtifact(path: string): ArtifactKind {
  const lower = path.toLowerCase();
  const name = basename(lower);
  if (name === "script.json") return "script";
  if (name === "design.md") return "design";
  if (name === "source-brief.md") return "brief";
  if (name === "manifest.json") return "manifest";
  if (name === "index.html") return "composition";
  if (lower.includes("/narration/") || lower.endsWith(".wav") || lower.endsWith(".mp3")) {
    return "narration";
  }
  if (lower.includes("/output/") && (lower.endsWith(".mp4") || lower.endsWith(".webm"))) {
    return "render";
  }
  if (name === "package.json" || name === "tsconfig.json" || name === "hyperframes.json") {
    return "config";
  }
  const ext = extOf(lower);
  if (["ts", "tsx", "js", "jsx", "css", "scss"].includes(ext)) return "code";
  if (["md", "txt", "mdx"].includes(ext)) return "doc";
  return "other";
}

const KIND_LABELS: Record<ArtifactKind, string> = {
  script: "Script",
  design: "Design",
  brief: "Brief",
  manifest: "Manifest",
  composition: "Composition",
  narration: "Narration",
  render: "Render",
  config: "Config",
  code: "Code",
  doc: "Doc",
  other: "Other",
};

export function artifactKindLabel(kind: ArtifactKind): string {
  return KIND_LABELS[kind];
}

/** A handful of "core" artifact kinds that we surface above generic files. */
export function isCoreArtifact(a: Artifact): boolean {
  return ["script", "design", "brief", "manifest", "composition", "narration", "render"].includes(
    a.kind
  );
}
