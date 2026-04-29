import { cn } from "../../lib/cn.js";
import { useActivityVerb } from "../../lib/activity-verbs.js";
import type { SceneState } from "../../lib/scene-state.js";

/**
 * One thumbnail in the SceneStrip. Shows scene number + title, the
 * rotating activity verb when in flight, and three hover-revealed
 * actions wired to the slash-handler retry-stage routes.
 */
export function SceneCard({
  scene,
  active,
  onClick,
  onRewrite,
  onReRecord,
  onRestage,
  disabled,
}: {
  scene: SceneState;
  active: boolean;
  onClick: () => void;
  onRewrite: () => void;
  onReRecord: () => void;
  onRestage: () => void;
  disabled?: boolean;
}) {
  const isInFlight = ["writing", "narrating", "composing", "rendering"].includes(scene.status);
  const { verb, cycleKey } = useActivityVerb(isInFlight ? scene.activityState ?? null : null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className={cn(
        "group relative flex w-[200px] shrink-0 cursor-pointer flex-col gap-2 border bg-surface p-3 transition-colors",
        active
          ? "border-cyan/40 shadow-[0_0_24px_rgba(0,255,255,0.08)]"
          : "border-mist-08 hover:border-mist-12"
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-fg-faint">
          scene {scene.index + 1}
        </span>
        <StatusChip status={scene.status} />
      </div>

      <p className="line-clamp-2 font-display text-sm font-semibold text-fg">{scene.title}</p>

      <p className="line-clamp-2 text-xs text-fg-muted">{scene.narration || "…"}</p>

      {isInFlight && verb ? (
        <span
          key={cycleKey}
          className="animate-verb-fade font-display text-[11px] italic text-fg-muted"
        >
          {verb}…
        </span>
      ) : null}

      {/* Hover-revealed actions */}
      <div className="invisible mt-1 flex gap-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100">
        <ActionPill onClick={onRewrite} disabled={disabled} title="Rewrite this scene's script">
          ✏ rewrite
        </ActionPill>
        <ActionPill onClick={onReRecord} disabled={disabled} title="Regenerate narration">
          🔁 re-record
        </ActionPill>
        <ActionPill onClick={onRestage} disabled={disabled} title="Re-author the composition">
          🎨 restage
        </ActionPill>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: SceneState["status"] }) {
  const label =
    status === "ready"
      ? "ready"
      : status === "queued"
        ? "—"
        : status === "error"
          ? "error"
          : status; // writing/narrating/composing/rendering
  const tone =
    status === "ready"
      ? "text-cyan"
      : status === "error"
        ? "text-alarm"
        : status === "queued"
          ? "text-fg-faint"
          : "text-fg-muted";
  return (
    <span className={cn("font-mono text-[9px] uppercase tracking-widest", tone)}>{label}</span>
  );
}

function ActionPill({
  onClick,
  children,
  disabled,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={title}
      className="border border-mist-08 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-fg-muted transition-colors hover:border-cyan/40 hover:text-cyan disabled:opacity-50"
    >
      {children}
    </button>
  );
}
