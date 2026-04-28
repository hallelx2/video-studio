import { Activity, AlertTriangle, Terminal, Inbox } from "lucide-react";
import { cn } from "../../lib/cn.js";
import type {
  ProgressActivity,
  LogActivity,
  ErrorActivity,
  RawActivity,
} from "../../lib/agent-state.js";
import { StreamRow, RowLabel, RowBadge } from "./StreamRow.js";

/**
 * Smaller activity rows that share the StreamRow grid. Each gets its own
 * Lucide icon + tone so the trace reads as a coherent event log.
 */

/**
 * Stage progress row. The phase label is humanized so enum-style values like
 * `reading_source` render as `READING SOURCE` (the underscores were leaking
 * into the UI as raw enum punctuation). The bar sits below the row text at
 * 2px, with a 1px cyan track that's actually visible at low percentages.
 */
export function ProgressCard({ activity }: { activity: ProgressActivity }) {
  const pct = activity.progress !== null ? Math.round(activity.progress * 100) : null;
  return (
    <StreamRow
      tone="muted"
      icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.75} />}
      header={
        <span className="flex min-w-0 items-baseline gap-2.5">
          <RowLabel tone="muted">{humanizePhase(activity.phase)}</RowLabel>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
            {activity.message}
          </span>
        </span>
      }
      status={pct !== null ? <RowBadge tone="cyan">{pct}%</RowBadge> : undefined}
    >
      {pct !== null && (
        <span
          aria-hidden
          className="relative mt-2 block h-0.5 w-full overflow-hidden rounded-full bg-mist-06"
        >
          <span
            className="absolute inset-y-0 left-0 min-w-[2px] rounded-full bg-cyan shadow-[0_0_6px_var(--color-cyan-glow)] transition-[width] duration-300 ease-[var(--ease-composio)]"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
    </StreamRow>
  );
}

/**
 * Replace `_` and `-` with spaces so `reading_source` renders as
 * `reading source` — the StreamRow's `uppercase tracking-widest` treatment
 * then cleans it up to `READING SOURCE`.
 */
function humanizePhase(phase: string): string {
  return phase.replace(/[_-]+/g, " ").trim();
}

/**
 * Stand-alone log line that didn't get grouped with its siblings.
 */
export function LogCard({ activity }: { activity: LogActivity }) {
  return (
    <StreamRow
      tone="muted"
      icon={<Terminal className="h-3.5 w-3.5" strokeWidth={1.75} />}
      header={<RowLabel tone="muted">{activity.level}</RowLabel>}
    >
      <span className="break-words font-mono text-[11px] leading-relaxed text-fg-muted">
        {activity.text}
      </span>
    </StreamRow>
  );
}

/**
 * Errors land hard. Non-recoverable errors get the signature 4×4 brutalist
 * offset shadow — the only place in the activity stream where it appears,
 * so failures land visually distinct without resorting to heavy chrome.
 */
export function ErrorCard({ activity }: { activity: ErrorActivity }) {
  return (
    <StreamRow
      tone="alarm"
      icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />}
      brutalist={!activity.recoverable}
      header={
        <span className="flex min-w-0 items-baseline gap-2.5">
          <RowLabel tone="alarm">error</RowLabel>
          {activity.scope && <RowLabel tone="muted">{activity.scope}</RowLabel>}
        </span>
      }
      status={!activity.recoverable ? <RowBadge tone="alarm">fatal</RowBadge> : undefined}
    >
      <p
        className={cn(
          "max-w-3xl break-words font-mono text-[12px] leading-relaxed",
          activity.recoverable ? "text-alarm/90" : "text-alarm"
        )}
      >
        {activity.message}
      </p>
    </StreamRow>
  );
}

/**
 * Catch-all for unparseable events. Receded — takes minimum visual weight
 * so it doesn't pollute the trace.
 */
export function RawCard({ activity }: { activity: RawActivity }) {
  return (
    <StreamRow
      tone="muted"
      icon={<Inbox className="h-3 w-3" strokeWidth={1.75} />}
      header={<RowLabel tone="muted">raw</RowLabel>}
    >
      <p className="break-words font-mono text-[11px] leading-relaxed text-fg-muted/70">
        {activity.text}
      </p>
    </StreamRow>
  );
}
