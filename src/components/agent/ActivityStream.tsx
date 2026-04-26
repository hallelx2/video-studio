import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import type {
  Activity,
  AgentRunState,
  PendingPrompt,
  TextActivity,
} from "../../lib/agent-state.js";
import { TextCard } from "./TextCard.js";
import { ToolCallCard } from "./ToolCallCard.js";
import { ProgressCard, LogCard, ErrorCard, RawCard } from "./MetaCards.js";
import { UserMessageCard } from "./UserMessageCard.js";
import { InlineApproval } from "./InlineApproval.js";
import { ReasoningCard } from "./ReasoningCard.js";
import { StreamEndIndicator } from "./StreamEndIndicator.js";

const REASONING_MAX_LEN = 500;

type FilterKey = "all" | "chat" | "tools" | "progress" | "errors";

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "chat", label: "Chat" },
  { key: "tools", label: "Tools" },
  { key: "progress", label: "Progress" },
  { key: "errors", label: "Errors" },
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filter chips */}
      <div className="hairline flex items-center justify-between gap-4 border-b px-12 py-3">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            const count = countForFilter(counts, f.key);
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "relative flex items-baseline gap-2 px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  isActive ? "text-paper" : "text-paper-mute hover:text-paper"
                )}
              >
                <span>{f.label}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "tabular",
                      isActive ? "text-cinnabar" : "text-paper-mute/85"
                    )}
                  >
                    {count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-px bg-cinnabar" />
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest transition-colors",
            autoScroll ? "text-cinnabar" : "text-paper-mute hover:text-paper"
          )}
          title={autoScroll ? "Auto-scroll enabled — click to pause" : "Auto-scroll paused — click to resume"}
        >
          {autoScroll ? "tail ●" : "tail ○"}
        </button>
      </div>

      {/* Stream */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-12 py-6"
      >
        {visible.length === 0 && !pendingPrompt ? (
          <Empty filter={filter} />
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((activity, i) => {
              // Turn boundary: every UserActivity (except the very first one
              // in the visible list) starts a new turn — render a hairline
              // divider above it so multi-run conversations are scannable.
              const isTurnStart = activity.kind === "user" && i > 0;
              const asReasoning = isReasoningContext(visible, i);
              return (
                <li key={activity.id}>
                  {isTurnStart && <TurnDivider />}
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

function TurnDivider() {
  return (
    <div className="my-6 flex items-center gap-4" aria-hidden>
      <span className="hairline h-px flex-1 border-t" />
      <span className="font-mono text-[9px] uppercase tracking-widest text-paper-mute/50">
        new turn
      </span>
      <span className="hairline h-px flex-1 border-t" />
    </div>
  );
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
      return <LogCard activity={activity} />;
    case "error":
      return <ErrorCard activity={activity} />;
    case "raw":
      return <RawCard activity={activity} />;
  }
}

function Empty({ filter }: { filter: FilterKey }) {
  const messages: Record<FilterKey, string> = {
    all: "Empty. Start a conversation below.",
    chat: "No messages yet.",
    tools: "No tools called yet.",
    progress: "No stage progress yet.",
    errors: "No errors. Good.",
  };
  return (
    <div className="flex h-full items-center justify-center">
      <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/85">
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
