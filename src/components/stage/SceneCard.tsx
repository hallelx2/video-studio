import { cn } from "../../lib/cn.js";
import { useActivityVerb } from "../../lib/activity-verbs.js";
import { useExclusiveAudio } from "../../lib/exclusive-audio.js";
import { pathToMediaUrl } from "../../lib/media-url.js";
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
  /** Called with the scene's id so the parent can scope the
   *  regeneration to just this scene's narration via runTool. */
  onReRecord: (sceneId: string) => void;
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

      {/* Inline narration player — appears the moment the WAV lands. The
          audio element is shared via useExclusiveAudio so playing one
          scene auto-pauses any other playing scene. preload=metadata
          keeps the UI responsive even with many scenes mounted. */}
      {scene.narrationPath && (
        <NarrationPlayer narrationPath={scene.narrationPath} />
      )}

      {isInFlight && verb ? (
        <span
          key={cycleKey}
          className="animate-verb-fade font-display text-[11px] italic text-fg-muted"
        >
          {verb}…
        </span>
      ) : null}

      {/* Always-visible action row — replaces the previous hover-only
          opacity:0 affordance so keyboard / touch users can reach
          rewrite / re-record / restage without needing to hover the
          card. Idle: 50% opacity (quiet); on card hover/focus-within:
          100% (loud). Stays in the tab order regardless. */}
      <div className="mt-1 flex gap-2 opacity-50 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
        <ActionPill
          onClick={onRewrite}
          disabled={disabled}
          aria-label={`Rewrite scene ${scene.index + 1} script`}
          title="Rewrite this scene's script"
        >
          ✏ rewrite
        </ActionPill>
        <ActionPill
          onClick={() => onReRecord(scene.id)}
          disabled={disabled}
          aria-label={`Re-record scene ${scene.index + 1} narration`}
          title="Regenerate just this scene's narration"
        >
          🔁 re-record
        </ActionPill>
        <ActionPill
          onClick={onRestage}
          disabled={disabled}
          aria-label={`Restage scene ${scene.index + 1} composition`}
          title="Re-author the composition"
        >
          🎨 restage
        </ActionPill>
      </div>
    </div>
  );
}

/**
 * 28px-tall native audio control bound to the scene's narration WAV via
 * the studio-media protocol. Cheap (preload=metadata) so dozens of
 * cards mounted in the strip don't all eagerly fetch the full WAV.
 * useExclusiveAudio coordinates auto-pause across the strip.
 */
function NarrationPlayer({ narrationPath }: { narrationPath: string }) {
  const audioRef = useExclusiveAudio<HTMLAudioElement>();
  return (
    <audio
      ref={audioRef}
      controls
      preload="metadata"
      className="mt-1 h-7 w-full"
      // Stop click propagation so playing/seeking doesn't also fire
      // the parent SceneCard's onClick (which selects the scene).
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") e.stopPropagation();
      }}
      src={pathToMediaUrl(narrationPath)}
    >
      Your browser does not support the audio element.
    </audio>
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
  ...rest
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
} & React.AriaAttributes) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        // Stop Space/Enter from also triggering the parent card's onClick
        // when the user is focusing this button — they meant the action,
        // not "select the scene".
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
        }
      }}
      disabled={disabled}
      title={title}
      className="border border-mist-08 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-fg-muted transition-colors hover:border-cyan/40 hover:text-cyan focus-visible:border-cyan/60 focus-visible:text-cyan focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan/40 disabled:opacity-50"
      {...rest}
    >
      {children}
    </button>
  );
}
