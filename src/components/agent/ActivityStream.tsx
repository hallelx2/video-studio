import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  Wrench,
  Activity as ActivityIcon,
  AlertTriangle,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/cn.js";
import type {
  Activity,
  AgentRunState,
  LogActivity,
  PendingPrompt,
  TextActivity,
} from "../../lib/agent-state.js";
import { TextCard } from "./TextCard.js";
import { ToolCallCard } from "./ToolCallCard.js";
import { ProgressCard, ErrorCard, RawCard } from "./MetaCards.js";
import { UserMessageCard } from "./UserMessageCard.js";
import { InlineApproval } from "./InlineApproval.js";
import { ReasoningCard } from "./ReasoningCard.js";
import { StreamEndIndicator } from "./StreamEndIndicator.js";
import { TerminalLogGroup } from "./TerminalLogGroup.js";

const REASONING_MAX_LEN = 500;

type FilterKey = "all" | "chat" | "tools" | "progress" | "errors";

interface FilterDef {
  key: FilterKey;
  label: string;
  icon: LucideIcon;
}

const FILTERS: ReadonlyArray<FilterDef> = [
  { key: "all", label: "All", icon: Layers },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "tools", label: "Tools", icon: Wrench },
  { key: "progress", label: "Progress", icon: ActivityIcon },
  { key: "errors", label: "Errors", icon: AlertTriangle },
];

export function ActivityStream({
  activities,
  pendingPrompt,
  onRespondToPrompt,
  agentState,
}: {
  activities: Activity[];
  pendingPrompt?: PendingPrompt | null;
  onRespondToPrompt?: (response: string) => void | Promise<void>;
  /** Full agent state for terminal-end markers. Optional — falls back to no marker. */
  agentState?: AgentRunState;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isRunning = agentState?.status === "running";
  const counts = useMemo(() => countByKind(activities), [activities]);

  const visible = useMemo(() => {
    switch (filter) {
      case "all":
        return activities;
      case "chat":
        return activities.filter((a) => a.kind === "user" || a.kind === "text");
      case "tools":
        return activities.filter((a) => a.kind === "tool");
      case "progress":
        return activities.filter((a) => a.kind === "progress");
      case "errors":
        return activities.filter((a) => a.kind === "error");
    }
  }, [activities, filter]);

  // Auto-scroll to bottom when new activities arrive — but pause if user
  // scrolled up to read something earlier.
  useEffect(() => {
    if (!autoScroll) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [visible.length, pendingPrompt?.id, autoScroll]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setAutoScroll(distFromBottom < 80);
  };

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
      {/* Bioluminescent running indicator — a thin cyan line that pulses
          across the very top of the stream container while the agent is
          actively running. Restrained, but it carries the "alive" signal. */}
      {isRunning && (
        <span
          aria-hidden
          className="pulse-cyan pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-cyan to-transparent"
        />
      )}

      {/* ─── Filter chips + tail toggle ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 border-b border-mist-08 px-12 py-3">
        <div className="inline-flex items-center gap-1 rounded-full border border-mist-08 bg-surface/40 p-0.5">
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            const count = countForFilter(counts, f.key);
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium tracking-tight transition-colors",
                  isActive
                    ? "bg-cyan/[0.10] text-cyan ring-1 ring-cyan/30"
                    : "text-fg-muted hover:bg-mist-04 hover:text-fg"
                )}
              >
                <Icon
                  className={cn("h-3.5 w-3.5", isActive ? "text-cyan" : "text-fg-muted/85")}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span>{f.label}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 font-mono text-[10px] tabular leading-tight",
                      isActive ? "bg-cyan/15 text-cyan" : "bg-mist-08 text-fg-muted"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
            autoScroll
              ? "border-cyan/30 bg-cyan/[0.06] text-cyan"
              : "border-mist-08 text-fg-muted hover:border-mist-12 hover:bg-mist-04 hover:text-fg"
          )}
          title={autoScroll ? "Auto-scroll enabled — click to pause" : "Auto-scroll paused — click to resume"}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              autoScroll ? "pulse-cyan bg-cyan" : "bg-fg-muted/40"
            )}
            aria-hidden
          />
          tail
        </button>
      </div>

      {/* ─── Stream body ────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-w-0 flex-1 overflow-y-auto px-9 py-6"
      >
        {visible.length === 0 && !pendingPrompt ? (
          <Empty filter={filter} />
        ) : (
          <ul className="flex min-w-0 flex-col gap-1.5">
            {groupActivities(visible).map((item, i) => {
              if (item.kind === "log-group") {
                return (
                  <li key={item.firstId}>
                    <TerminalLogGroup level={item.level} lines={item.lines} />
                  </li>
                );
              }
              const activity = item.activity;
              // Turn boundary: every UserActivity (except the very first one
              // in the visible list) starts a new turn — render a hairline
              // divider with a numbered "turn N" label so multi-run sessions
              // are scannable at a glance.
              const turnNumber = countTurnsBefore(visible, activity);
              const isTurnStart = activity.kind === "user" && i > 0;
              const asReasoning = isReasoningContext(visible, visible.indexOf(activity));
              return (
                <li key={activity.id}>
                  {isTurnStart && <TurnDivider turnNumber={turnNumber} />}
                  {asReasoning ? (
                    <ReasoningCard activity={activity as TextActivity} />
                  ) : (
                    renderActivity(activity)
                  )}
                </li>
              );
            })}
            {pendingPrompt && onRespondToPrompt && (filter === "all" || filter === "chat") && (
              <li>
                <InlineApproval prompt={pendingPrompt} onRespond={onRespondToPrompt} />
              </li>
            )}
            {agentState && (filter === "all" || filter === "chat") && (
              <li>
                <StreamEndIndicator
                  state={agentState}
                  hasInlineApproval={!!pendingPrompt}
                />
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Returns true if the activity at index `i` is a TextActivity that should be
 * rendered as folded reasoning (Hypatia pattern): short text wedged between
 * two tool calls within the same agent turn. Long text and text outside of
 * a tool sandwich stay as full TextCard.
 */
function isReasoningContext(activities: Activity[], i: number): boolean {
  const a = activities[i];
  if (a.kind !== "text") return false;
  if (a.text.length > REASONING_MAX_LEN) return false;
  const prev = activities[i - 1];
  const next = activities[i + 1];
  return prev?.kind === "tool" && next?.kind === "tool";
}

/**
 * Numbered turn divider. A full-width hairline with a centered pill showing
 * "turn 02" in mono uppercase — gives multi-run sessions a clear chapter
 * structure without dominating the page.
 */
function TurnDivider({ turnNumber }: { turnNumber: number }) {
  return (
    <div className="my-6 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-mist-06" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-mist-08 bg-surface/40 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-fg-muted/70">
        turn {turnNumber.toString().padStart(2, "0")}
      </span>
      <span className="h-px flex-1 bg-mist-06" />
    </div>
  );
}

/**
 * How many user turns precede `activity` (inclusive). Used to label the
 * turn divider with a sequential number so the reader can refer to "the
 * second turn" rather than counting from the top.
 */
function countTurnsBefore(activities: Activity[], activity: Activity): number {
  let n = 0;
  for (const a of activities) {
    if (a.kind === "user") n += 1;
    if (a.id === activity.id) return n;
  }
  return n;
}

function renderActivity(activity: Activity): React.ReactNode {
  switch (activity.kind) {
    case "user":
      return <UserMessageCard activity={activity} />;
    case "text":
      return <TextCard activity={activity} />;
    case "tool":
      return <ToolCallCard activity={activity} />;
    case "progress":
      return <ProgressCard activity={activity} />;
    case "log":
      // Singleton logs (no consecutive siblings to group) still render as a
      // tiny TerminalLogGroup so the formatting is consistent — one mono
      // block with one line instead of bare text in the prose stream.
      return <TerminalLogGroup level={activity.level} lines={[activity.text]} />;
    case "error":
      return <ErrorCard activity={activity} />;
    case "raw":
      return <RawCard activity={activity} />;
  }
}

/**
 * Collapse consecutive LogActivity items with the same level into one
 * `log-group` item that renders as a single TerminalLogGroup. Any other
 * activity flushes the run.
 */
type StreamItem =
  | { kind: "single"; activity: Activity }
  | { kind: "log-group"; level: string; lines: string[]; firstId: string };

function groupActivities(activities: Activity[]): StreamItem[] {
  const out: StreamItem[] = [];
  for (const a of activities) {
    if (a.kind === "log") {
      const last = out[out.length - 1];
      if (last && last.kind === "log-group" && last.level === a.level) {
        last.lines.push(a.text);
        continue;
      }
      out.push({
        kind: "log-group",
        level: (a as LogActivity).level,
        lines: [a.text],
        firstId: a.id,
      });
      continue;
    }
    out.push({ kind: "single", activity: a });
  }
  return out;
}

function Empty({ filter }: { filter: FilterKey }) {
  const messages: Record<FilterKey, string> = {
    all: "Empty. Start a conversation below.",
    chat: "No messages yet.",
    tools: "No tools called yet.",
    progress: "No stage progress yet.",
    errors: "No errors. Good.",
  };
  const Icon = FILTERS.find((f) => f.key === filter)?.icon ?? Layers;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <span
        aria-hidden
        className="flex h-10 w-10 items-center justify-center rounded-full border border-mist-08 bg-surface/40 text-fg-muted/60"
      >
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted/85">
        {messages[filter]}
      </p>
    </div>
  );
}

interface KindCounts {
  user: number;
  text: number;
  tool: number;
  progress: number;
  error: number;
  total: number;
}

function countByKind(activities: Activity[]): KindCounts {
  const counts: KindCounts = {
    user: 0,
    text: 0,
    tool: 0,
    progress: 0,
    error: 0,
    total: activities.length,
  };
  for (const a of activities) {
    if (a.kind === "user") counts.user += 1;
    else if (a.kind === "text") counts.text += 1;
    else if (a.kind === "tool") counts.tool += 1;
    else if (a.kind === "progress") counts.progress += 1;
    else if (a.kind === "error") counts.error += 1;
  }
  return counts;
}

function countForFilter(c: KindCounts, key: FilterKey): number {
  switch (key) {
    case "all":
      return c.total;
    case "chat":
      return c.user + c.text;
    case "tools":
      return c.tool;
    case "progress":
      return c.progress;
    case "errors":
      return c.error;
  }
}
