import { useEffect, useState } from "react";
import { cn } from "../../lib/cn.js";
import {
  formatDuration,
  formatTokens,
  totalUsageTokens,
  type RunMetrics,
  type RunStatus,
} from "../../lib/agent-state.js";

const STATUS_LABELS: Record<RunStatus, string> = {
  idle: "idle",
  running: "running",
  awaiting_input: "awaiting input",
  complete: "complete",
  error: "errored",
};

export function RunMetricsBar({
  status,
  metrics,
  toolCallCount,
  toolCallErrors,
  assistantBlocks,
}: {
  status: RunStatus;
  metrics: RunMetrics;
  toolCallCount: number;
  toolCallErrors: number;
  assistantBlocks: number;
}) {
  // Live duration ticker — only when running.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "running" && status !== "awaiting_input") return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [status]);

  const elapsed =
    metrics.startedAt === null
      ? 0
      : metrics.endedAt !== null
        ? metrics.endedAt - metrics.startedAt
        : now - metrics.startedAt;

  const tokens = totalUsageTokens(metrics.usage);

  return (
    <footer className="hairline flex items-center justify-between border-t bg-ink px-12 py-3 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
      <div className="flex items-center gap-6">
        <Status status={status} />
        <Field label="elapsed">
          <span className="tabular text-paper">{formatDuration(elapsed)}</span>
        </Field>
        <Field label="tools">
          <span className="tabular text-paper">
            {toolCallCount}
            {toolCallErrors > 0 && (
              <span className="ml-1 text-alarm">· {toolCallErrors} err</span>
            )}
          </span>
        </Field>
        <Field label="messages">
          <span className="tabular text-paper">{assistantBlocks}</span>
        </Field>
      </div>

      <div className="flex items-center gap-6">
        {tokens > 0 && (
          <>
            <Field label="in">
              <span className="tabular text-paper">{formatTokens(metrics.usage.input_tokens)}</span>
            </Field>
            <Field label="out">
              <span className="tabular text-paper">{formatTokens(metrics.usage.output_tokens)}</span>
            </Field>
            {(metrics.usage.cache_read_input_tokens ?? 0) > 0 && (
              <Field label="cache">
                <span className="tabular text-brass">
                  {formatTokens(metrics.usage.cache_read_input_tokens)}
                </span>
              </Field>
            )}
          </>
        )}
        {metrics.costUsd > 0 && (
          <Field label="cost">
            <span className="tabular text-paper">${metrics.costUsd.toFixed(3)}</span>
          </Field>
        )}
      </div>
    </footer>
  );
}

function Status({ status }: { status: RunStatus }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "running" && "pulse-cinnabar bg-cinnabar",
          status === "awaiting_input" && "bg-cinnabar",
          status === "complete" && "bg-paper",
          status === "error" && "bg-alarm",
          status === "idle" && "bg-paper-mute/40"
        )}
      />
      <span
        className={cn(
          status === "running" && "text-cinnabar",
          status === "awaiting_input" && "text-cinnabar",
          status === "complete" && "text-paper",
          status === "error" && "text-alarm",
          status === "idle" && "text-paper-mute"
        )}
      >
        {STATUS_LABELS[status]}
      </span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-paper-mute/70">{label}</span>
      {children}
    </span>
  );
}
