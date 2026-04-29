import { useState } from "react";
import { cn } from "../../lib/cn.js";
import { usePreview } from "../../lib/preview-context.js";
import type { AgentRunState } from "../../lib/agent-state.js";

/**
 * Footer strip of finished render outputs (one tile per format).
 * Click a tile → opens the existing slide-in PreviewPanel via
 * `usePreview().openVideo` for full-quality playback. The "render
 * again" button on the right wires to the slash-handler rerender
 * flow which the parent passes in.
 *
 * Pulls from `agent.artifacts` filtered to `kind === "render"` so
 * we don't introduce a new state source.
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
  const preview = usePreview();
  const renders = agent.artifacts.filter((a) => a.kind === "render");
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="hairline flex shrink-0 items-center justify-between gap-4 border-t px-6 py-3">
      <div className="flex items-baseline gap-3 overflow-x-auto">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
          renders
        </span>
        {renders.length === 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
            none yet
          </span>
        ) : (
          renders.map((r) => {
            const formatLabel = guessFormat(r.path);
            return (
              <button
                key={r.path}
                onClick={() =>
                  preview.openVideo({
                    filePath: r.path,
                    format: formatLabel,
                  })
                }
                onMouseEnter={() => setHovered(r.path)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "group flex items-baseline gap-2 border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  hovered === r.path
                    ? "border-cyan/40 text-cyan"
                    : "border-mist-08 text-fg-muted hover:border-mist-12"
                )}
                title={r.path}
              >
                <span>▶ {formatLabel}</span>
              </button>
            );
          })
        )}
      </div>
      <button
        onClick={onRenderAgain}
        disabled={disabled}
        className="border border-mist-08 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:border-cyan/40 hover:text-cyan disabled:opacity-50"
      >
        render again →
      </button>
    </div>
  );
}

function guessFormat(filePath: string): string {
  const seg = filePath.split(/[\\/]/).pop() ?? filePath;
  const noExt = seg.replace(/\.[^.]+$/, "");
  // Common naming: "linkedin.mp4" / "x.mp4" / "9x16.mp4"
  return noExt;
}
