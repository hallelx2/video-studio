import { useState } from "react";
import { cn } from "../../lib/cn.js";
import { usePreview } from "../../lib/preview-context.js";
import { pathToMediaUrl } from "../../lib/media-url.js";
import type { AgentRunState } from "../../lib/agent-state.js";

/**
 * Footer strip of finished render outputs (one tile per format).
 * Each tile is now an inline 220×140 thumbnail:
 *   - With a render path: shows native <video controls> playable inline.
 *   - Without one (rendering in flight): shows an animated pulse +
 *     format label.
 *
 * The ⤢ button on each tile promotes the render to the full slide-in
 * PreviewPanel via the existing usePreview() infrastructure.
 *
 * Pulls from `agent.artifacts` filtered to `kind === "render"` so we
 * don't introduce a new state source. (Phase 3 of the plan adds
 * proper progress events; for now in-flight tiles fall back to
 * indeterminate animate-pulse.)
 */
export function RenderStrip({
  agent,
  onRenderAgain,
  disabled,
}: {
  agent: AgentRunState;
  onRenderAgain: () => void;
  disabled?: boolean;
}) {
  const renders = agent.artifacts.filter((a) => a.kind === "render");

  return (
    <div className="hairline flex shrink-0 items-stretch justify-between gap-4 border-t px-6 py-3">
      <div className="flex items-stretch gap-3 overflow-x-auto">
        <div className="flex shrink-0 flex-col justify-center">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
            renders
          </span>
          {renders.length === 0 && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
              none yet
            </span>
          )}
        </div>
        {renders.map((r) => (
          <RenderTile key={r.path} path={r.path} />
        ))}
      </div>
      <div className="flex shrink-0 items-center">
        <button
          onClick={onRenderAgain}
          disabled={disabled}
          className="border border-mist-08 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:border-cyan/40 hover:text-cyan disabled:opacity-50"
        >
          render again →
        </button>
      </div>
    </div>
  );
}

function RenderTile({ path }: { path: string }) {
  const preview = usePreview();
  const [hovered, setHovered] = useState(false);
  const formatLabel = guessFormat(path);
  const url = pathToMediaUrl(path);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group relative flex h-[120px] w-[200px] shrink-0 items-end overflow-hidden border bg-surface transition-colors",
        hovered ? "border-cyan/40" : "border-mist-08"
      )}
    >
      <video
        src={url}
        controls
        preload="metadata"
        className="h-full w-full object-cover"
        title={path}
      />
      {/* Format label + ⤢ promote-to-PreviewPanel button overlay. Only
          appears on hover so playing video isn't visually obstructed. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent px-2 py-1.5 transition-opacity",
          hovered ? "opacity-100" : "opacity-0"
        )}
      >
        <span className="font-mono text-[9px] uppercase tracking-widest text-fg">
          {formatLabel}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            preview.openVideo({ filePath: path, format: formatLabel });
          }}
          aria-label={`Open ${formatLabel} in preview panel`}
          title="Open in preview panel"
          className="pointer-events-auto font-mono text-[10px] text-fg-muted hover:text-cyan"
        >
          ⤢
        </button>
      </div>
    </div>
  );
}

function guessFormat(filePath: string): string {
  const seg = filePath.split(/[\\/]/).pop() ?? filePath;
  const noExt = seg.replace(/\.[^.]+$/, "");
  return noExt;
}
