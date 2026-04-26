import { cn } from "../../lib/cn.js";
import type {
  ProgressActivity,
  LogActivity,
  ErrorActivity,
  RawActivity,
} from "../../lib/agent-state.js";

/**
 * Smaller activity cards that share a compact one-line layout. Used for events
 * that don't warrant the full Tool/Text card treatment.
 */

export function ProgressCard({ activity }: { activity: ProgressActivity }) {
  return (
    <article className="flex items-baseline gap-3 px-1 py-1">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        {activity.phase}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-paper-mute">
        {activity.message}
      </span>
      {activity.progress !== null && (
        <span className="shrink-0 font-mono text-[10px] tabular text-cinnabar">
          {Math.round(activity.progress * 100)}%
        </span>
      )}
    </article>
  );
}

export function LogCard({ activity }: { activity: LogActivity }) {
  return (
    <article className="flex items-baseline gap-3 px-1 py-1">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-paper-mute/85">
        {activity.level}
      </span>
      <span className="min-w-0 flex-1 break-words font-mono text-[11px] text-paper-mute">
        {activity.text}
      </span>
    </article>
  );
}

export function ErrorCard({ activity }: { activity: ErrorActivity }) {
  return (
    <article
      className={cn(
        "border-l-2 border-l-alarm bg-alarm/[0.06] px-4 py-3",
        !activity.recoverable && "ring-1 ring-alarm/40"
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-alarm">
            error
          </span>
          {activity.scope && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
              {activity.scope}
            </span>
          )}
          {!activity.recoverable && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-alarm">
              fatal
            </span>
          )}
        </div>
      </header>
      <p className="mt-2 break-words font-mono text-xs leading-relaxed text-alarm">
        {activity.message}
      </p>
    </article>
  );
}

export function RawCard({ activity }: { activity: RawActivity }) {
  return (
    <article className="px-1 py-1">
      <p className="break-words font-mono text-[11px] text-paper-mute/80">{activity.text}</p>
    </article>
  );
}
