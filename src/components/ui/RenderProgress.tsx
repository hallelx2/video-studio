import { cn } from "../../lib/cn.js";

/**
 * Cinnabar progress bar — fills L→R as the agent advances through stages.
 * No striped overlay, no shimmer keyframe; just the bar and a 1px brass leading edge.
 */
export function RenderProgress({
  progress,
  phase,
  className,
}: {
  /** 0–1 */
  progress: number;
  phase?: string | null;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest">
        <span className="text-paper-mute">{phase ?? "ready"}</span>
        <span className="tabular text-cinnabar">{pct.toFixed(0).padStart(2, "0")}%</span>
      </div>
      <div className="hairline relative h-px overflow-visible border-b">
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-cinnabar transition-[width] duration-[420ms]"
          style={{
            width: `${pct}%`,
            transitionTimingFunction: "var(--ease-atelier)",
          }}
        />
        {pct > 0 && pct < 100 && (
          <div
            className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-cinnabar"
            style={{ left: `calc(${pct}% - 1px)` }}
          />
        )}
      </div>
    </div>
  );
}
