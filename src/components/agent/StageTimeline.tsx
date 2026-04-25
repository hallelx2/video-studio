import { cn } from "../../lib/cn.js";
import type { Stage, StageId } from "../../lib/agent-state.js";

/**
 * The 6-stage pipeline as a horizontal sequence. Always visible at the top
 * of the agent inspector. Per DESIGN.md: hairline cells, cinnabar for active,
 * brass for elapsed. No icons — just numerals and labels.
 */
export function StageTimeline({
  stages,
  currentStageId,
}: {
  stages: Stage[];
  currentStageId: StageId | null;
}) {
  return (
    <div className="hairline flex items-stretch border-b">
      {stages.map((stage, i) => {
        const isActive = stage.id === currentStageId && stage.status === "active";
        const isComplete = stage.status === "complete";
        const isError = stage.status === "error";
        const isPending = stage.status === "pending";
        const isLast = i === stages.length - 1;

        return (
          <div
            key={stage.id}
            className={cn(
              "group relative flex flex-1 items-center gap-3 px-5 py-4 transition-colors",
              !isLast && "hairline border-r",
              isActive && "bg-ink-raised"
            )}
          >
            <span
              className={cn(
                "font-mono text-[10px] tabular tracking-widest",
                isActive && "text-cinnabar",
                isComplete && "text-paper",
                isError && "text-alarm",
                isPending && "text-paper-mute/50"
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    isActive && "text-paper",
                    isComplete && "text-paper",
                    isError && "text-alarm",
                    isPending && "text-paper-mute/60"
                  )}
                >
                  {stage.label}
                </span>
                {isActive && (
                  <span className="pulse-cinnabar h-1 w-1 rounded-full bg-cinnabar" />
                )}
              </div>
              {stage.message && (isActive || isError) && (
                <p className="mt-1 truncate font-mono text-[10px] text-paper-mute">
                  {stage.message}
                </p>
              )}
              {isComplete && stage.startedAt !== null && stage.endedAt !== null && (
                <p className="mt-1 font-mono text-[10px] tabular text-paper-mute/70">
                  {((stage.endedAt - stage.startedAt) / 1000).toFixed(1)}s
                </p>
              )}
            </div>

            {/* Active stage progress bar — cinnabar fill along the bottom edge */}
            {isActive && stage.progress !== null && (
              <span
                aria-hidden
                className="absolute bottom-0 left-0 h-px bg-cinnabar transition-[width] duration-500"
                style={{
                  width: `${Math.max(2, Math.min(100, stage.progress * 100))}%`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
