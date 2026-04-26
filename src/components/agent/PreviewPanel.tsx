import { useEffect, useState } from "react";
import { cn } from "../../lib/cn.js";
import { openExternal } from "../../lib/agent-client.js";
import { usePreview } from "../../lib/preview-context.js";

/**
 * Slide-in preview panel. Replaces the old "open in user's external
 * browser" flow — the HyperFrames dev server now renders inside the app
 * via an iframe so the user never leaves their session to scrub a
 * composition.
 *
 * Anchored to the right edge, takes ~70% of viewport width. Backdrop
 * dimmer makes the rest of the workbench inert while the preview is up.
 *
 * The dev server takes ~1s to come up after spawn — we render a "warming
 * up…" splash while the iframe loads so the user doesn't see a 404 flash.
 *
 * Esc key + click-outside both close. Closing stops the dev server.
 */
export function PreviewPanel() {
  const { current, close } = usePreview();
  const [iframeReady, setIframeReady] = useState(false);

  // Reset the loading splash whenever a new preview opens.
  useEffect(() => {
    setIframeReady(false);
  }, [current?.url]);

  // Esc closes the panel.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, close]);

  if (!current) return null;

  const handleOpenExternal = () => {
    openExternal(current.url).catch(() => undefined);
  };

  return (
    <>
      {/* Backdrop dim. Click-outside closes. */}
      <button
        aria-label="close preview"
        onClick={() => void close()}
        className="fixed inset-0 z-40 cursor-default bg-ink/70 backdrop-blur-sm transition-opacity duration-200 enter-rise"
      />

      {/* The panel itself — slides in from the right via translate-x. */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-[70vw] min-w-[640px] max-w-[1280px]",
          "flex-col border-l border-brass-line/30 bg-ink shadow-[-24px_0_64px_rgba(0,0,0,0.45)]",
          "translate-x-0 transition-transform duration-200 ease-[var(--ease-atelier)]"
        )}
      >
        {/* Header — aspect label, dev URL, escape hatches */}
        <header className="hairline flex items-center justify-between gap-6 border-b px-6 py-3">
          <div className="flex min-w-0 items-baseline gap-4">
            <span className="pulse-cinnabar h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
              live preview
            </span>
            <span className="shrink-0 font-display text-base font-semibold text-paper">
              {current.aspect}
            </span>
            <span className="min-w-0 truncate font-mono text-[10px] text-paper-mute">
              {current.url}
            </span>
          </div>
          <div className="flex shrink-0 items-baseline gap-5">
            <button
              onClick={handleOpenExternal}
              className="border-b border-paper-mute/40 pb-0.5 font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:border-paper hover:text-paper"
              title="Open the dev server in your default browser"
            >
              open in browser ↗
            </button>
            <button
              onClick={() => void close()}
              className="border-b border-cinnabar pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cinnabar transition-colors hover:text-paper"
              title="Close the preview (Esc)"
            >
              ✕ close
            </button>
          </div>
        </header>

        {/* Iframe body. The dev server takes a beat to come up — show a
            soft splash until the iframe fires onLoad. */}
        <div className="relative flex-1 bg-ink">
          {!iframeReady && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink">
              <div className="flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
                <span className="pulse-cinnabar h-1.5 w-1.5 self-center rounded-full bg-cinnabar" />
                <span>warming up dev server</span>
                <span className="tabular text-paper-mute/70">{current.url}</span>
              </div>
            </div>
          )}
          <iframe
            key={current.url}
            src={current.url}
            title={`${current.aspect} preview`}
            onLoad={() => setIframeReady(true)}
            // Same-origin allows GSAP-driven scripts and the HyperFrames
            // dev server's HMR socket to run; sandbox-only would break both.
            className="h-full w-full border-0 bg-ink"
          />
        </div>
      </aside>
    </>
  );
}
