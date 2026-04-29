import { SceneCard } from "./SceneCard.js";
import type { SceneState } from "../../lib/scene-state.js";

/**
 * Horizontal strip of scenes below the Canvas. Click → set active.
 * Hover → reveal per-scene actions inside each card.
 *
 * For Ship 1 each action invalidates the whole stage from that step
 * forward (existing slash-handler retry behavior); per-scene scoped
 * invalidation is deferred.
 */
export function SceneStrip({
  scenes,
  activeSceneId,
  onSelectScene,
  onRewrite,
  onReRecord,
  onRestage,
  disabled,
}: {
  scenes: SceneState[];
  activeSceneId: string | null;
  onSelectScene: (id: string) => void;
  onRewrite: () => void;
  onReRecord: () => void;
  onRestage: () => void;
  disabled?: boolean;
}) {
  if (scenes.length === 0) {
    return (
      <div className="hairline flex h-[120px] items-center justify-center border-t px-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
          scenes will appear here as the script forms
        </p>
      </div>
    );
  }

  return (
    <div className="hairline flex shrink-0 gap-3 overflow-x-auto border-t px-6 py-4">
      {scenes.map((s) => (
        <SceneCard
          key={s.id}
          scene={s}
          active={s.id === activeSceneId}
          onClick={() => onSelectScene(s.id)}
          onRewrite={onRewrite}
          onReRecord={onReRecord}
          onRestage={onRestage}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
