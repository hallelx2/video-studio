import { useEffect, useState } from "react";
import { cn } from "../../lib/cn.js";
import { usePreview } from "../../lib/preview-context.js";
import { useActivityVerb } from "../../lib/activity-verbs.js";
import type { SceneState } from "../../lib/scene-state.js";

/**
 * Full-bleed centered preview surface. Shows the active scene's
 * composition iframe (when one exists) inside an aspect-locked frame,
 * letterboxed by the surrounding void. When the active scene is in
 * flight (status writing/narrating/composing/rendering), the canvas
 * cools and a verb overlay appears bottom-left — the cinematic
 * generation moment.
 *
 * For Ship 1 we show a single iframe per active scene against the
 * first available format's workspace dir. The richer per-aspect
 * preview swap lands in Ship 2.
 */
export function Canvas({
  activeScene,
  formatHint,
  workspacePath,
}: {
  activeScene: SceneState | null;
  formatHint: string;
  workspacePath: string | null;
}) {
  const preview = usePreview();
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  useEffect(() => {
    // Reach for an iframe-form of the preview if one exists. We don't
    // start the preview server unless the user clicks an explicit
    // affordance — the canvas just mirrors whatever preview state
    // already exists.
    if (preview.current?.kind === "iframe") {
      setIframeUrl(preview.current.url);
    } else if (activeScene?.compositionPath) {
      // No live preview server, but we know the composition's HTML path —
      // load it directly through the studio-media protocol so the user
      // sees the still page even when no dev server is running. Format
      // hint isn't strictly used here yet; placeholder for richer
      // per-aspect routing.
      void formatHint;
      setIframeUrl(`studio-media://local/${encodeURIComponent(activeScene.compositionPath.replace(/\\/g, "/"))}`);
    } else {
      setIframeUrl(null);
    }
  }, [preview.current, activeScene?.compositionPath, formatHint]);

  const isInFlight = activeScene
    ? ["writing", "narrating", "composing", "rendering"].includes(activeScene.status)
    : false;
  const { verb, cycleKey } = useActivityVerb(isInFlight ? activeScene?.activityState ?? null : null);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-void px-12 py-10">
      <div
        className={cn(
          "relative aspect-video w-full max-w-5xl overflow-hidden border bg-surface transition-all duration-500",
          isInFlight ? "border-cyan/40 animate-halo canvas-scan" : "border-mist-08"
        )}
      >
        {iframeUrl ? (
          <iframe
            src={iframeUrl}
            className={cn(
              "h-full w-full border-0 transition-[filter,opacity] duration-500",
              isInFlight && "opacity-70 saturate-50 brightness-90"
            )}
            title={activeScene?.title ?? "preview"}
          />
        ) : (
          <EmptyCanvas workspacePath={workspacePath} />
        )}

        {/* Verb overlay — cinematic generation cue. */}
        {verb && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-start px-6 py-5">
            <span
              key={cycleKey}
              className="animate-verb-fade font-display text-lg italic text-fg"
            >
              {verb}
              <span className="ml-1 inline-block animate-verb-dots">…</span>
            </span>
          </div>
        )}

        {/* Active scene title plate — top-left, low contrast. */}
        {activeScene && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-6 py-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-fg-faint">
                scene {activeScene.index + 1} · {activeScene.status}
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-fg">
                {activeScene.title}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyCanvas({ workspacePath }: { workspacePath: string | null }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
          {workspacePath ? "scene preview" : "nothing here yet"}
        </p>
        <p className="mt-2 max-w-sm font-display text-sm text-fg-muted">
          {workspacePath
            ? "Pick a scene below or wait for the agent to compose this aspect."
            : "Describe the video below and the canvas will fill itself."}
        </p>
      </div>
    </div>
  );
}
