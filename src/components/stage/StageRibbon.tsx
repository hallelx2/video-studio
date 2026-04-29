import { cn } from "../../lib/cn.js";
import type { Stage, StageId } from "../../lib/agent-state.js";

/**
 * Compact 6-stage indicator that lives between StageStatus and Canvas on
 * the main pane. Always visible — answers "where am I in the pipeline?"
 * without forcing the user into the details modal.
 *
 * Visual contract: 6 mono pills (`01 SCRIPT · 02 NARRATE · …`), 32px tall,
 * full-width band with a hairline above and below. Active pill = cyan
 * fill, complete = fg-muted, pending = fg-faint, error = alarm. Click
 * any pill → opens DetailsModal so the user can drill into that stage.
 *
 * The richer StageTimeline component (with messages + per-stage timing)
 * still lives inside DetailsModal — this is its compact cousin for the
 * always-on surface.
 */
export function StageRibbon({
  stages,
  currentStageId,
  onOpenDetails,
}: {
  stages: Stage[];
  currentStageId: StageId | null;
  onOpenDetails?: () => void;
}) {
  return (
    <div className="hairline flex items-center justify-between gap-px border-b bg-void/60">
      {stages.map((stage, i) => {
        const isActive = stage.id === currentStageId && stage.status === "active";
        const isComplete = stage.status === "complete";
        const isError = stage.status === "error";
        const isPending = stage.status === "pending";

        return (
          <button
            key={stage.id}
            onClick={onOpenDetails}
            disabled={!onOpenDetails}
            title={
              isActive
                ? `${stage.label} — in flight (click for details)`
                : isComplete
                  ? `${stage.label} — done`
                  : isError
                    ? `${stage.label} — errored`
                    : stage.label
            }
            className={cn(
              "group flex flex-1 items-baseline gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors",
              isActive && "bg-cyan/8 text-cyan",
              isComplete && "text-fg-muted hover:text-fg",
              isError && "bg-alarm/8 text-alarm",
              isPending && "text-fg-faint",
              !!onOpenDetails && "cursor-pointer",
              !onOpenDetails && "cursor-default"
            )}
          >
            <span className="tabular">{String(i + 1).padStart(2, "0")}</span>
            <span className="truncate">{stage.label}</span>
            {isActive && (
              <span aria-hidden className="pulse-cyan ml-auto h-1 w-1 rounded-full bg-cyan" />
            )}
          </button>
        );
      })}
    </div>
  );
}
