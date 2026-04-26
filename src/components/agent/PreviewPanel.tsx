import { useEffect, useState } from "react";
import { cn } from "../../lib/cn.js";
import { openExternal, openPath, revealInFolder } from "../../lib/agent-client.js";
import { usePreview } from "../../lib/preview-context.js";

/**
 * Slide-in preview panel. Polymorphic: hosts either a HyperFrames dev
 * server in an iframe (compose-approval flow) or a rendered MP4 in a
 * <video> element (post-render flow). Same chrome, same animation, same
 * close affordances — the user toggles between the two via the same
 * surface so they never leave Atelier Noir.
 *
 * Anchored to the right edge at ~70vw with a backdrop dimmer. Esc key +
 * click-outside both close. Closing tears down whichever underlying
 * resource is in flight (dev server for iframe, no-op for video).
 *
 * The "open in browser" / "open in default player" / "reveal in folder"
 * affordances stay as escape hatches — when the embedded view doesn't
 * cut it, the user can pop out to whatever they prefer.
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

  return (
    <>
      {/* Backdrop dim. Click-outside closes. */}
      <button
        aria-label="close preview"
        onClick={() => void close()}
        className="fixed inset-0 z-40 cursor-default bg-ink/70 backdrop-blur-sm transition-opacity duration-200 enter-rise"
      />

      {/* The panel itself — slides in from the right. */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-[70vw] min-w-[640px] max-w-[1280px]",
          "flex-col border-l border-brass-line/30 bg-ink shadow-[-24px_0_64px_rgba(0,0,0,0.45)]",
          "translate-x-0 transition-transform duration-200 ease-[var(--ease-atelier)]"
        )}
      >
        <PanelHeader current={current} onClose={() => void close()} />
        <div className="relative flex-1 bg-ink">
          {current.kind === "iframe" ? (
            <IframeView
              url={current.url}
              aspect={current.aspect}
              ready={iframeReady}
              onReady={() => setIframeReady(true)}
            />
          ) : (
            <VideoView url={current.url} format={current.format} />
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────

function PanelHeader({
  current,
  onClose,
}: {
  current: NonNullable<ReturnType<typeof usePreview>["current"]>;
  onClose: () => void;
}) {
  const isIframe = current.kind === "iframe";
  const label = isIframe ? current.aspect : current.format;
  const detailLine = isIframe ? current.url : current.filePath;

  const handleOpenExternal = () => {
    if (isIframe) {
      openExternal(current.url).catch(() => undefined);
    } else {
      openPath(current.filePath).catch(() => undefined);
    }
  };

  const handleReveal = () => {
    if (!isIframe) {
      revealInFolder(current.filePath).catch(() => undefined);
    }
  };

  return (
    <header className="hairline flex items-center justify-between gap-6 border-b px-6 py-3">
      <div className="flex min-w-0 items-baseline gap-4">
        <span className="pulse-cinnabar h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
          {isIframe ? "live preview" : "rendered video"}
        </span>
        <span className="shrink-0 font-display text-base font-semibold text-paper">
          {label}
        </span>
        <span className="min-w-0 truncate font-mono text-[10px] text-paper-mute">
          {detailLine}
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-5">
        {!isIframe && (
          <button
            onClick={handleReveal}
            className="border-b border-paper-mute/40 pb-0.5 font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:border-paper hover:text-paper"
            title="Reveal the file in your file manager"
          >
            reveal ↗
          </button>
        )}
        <button
          onClick={handleOpenExternal}
          className="border-b border-paper-mute/40 pb-0.5 font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:border-paper hover:text-paper"
          title={
            isIframe
              ? "Open the dev server in your default browser"
              : "Open the MP4 in your default video player"
          }
        >
          {isIframe ? "open in browser ↗" : "open in player ↗"}
        </button>
        <button
          onClick={onClose}
          className="border-b border-cinnabar pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cinnabar transition-colors hover:text-paper"
          title="Close the preview (Esc)"
        >
          ✕ close
        </button>
      </div>
    </header>
  );
}

// ─── Iframe variant (HyperFrames dev server) ─────────────────────────────

function IframeView({
  url,
  aspect,
  ready,
  onReady,
}: {
  url: string;
  aspect: string;
  ready: boolean;
  onReady: () => void;
}) {
  return (
    <>
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink">
          <div className="flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            <span className="pulse-cinnabar h-1.5 w-1.5 self-center rounded-full bg-cinnabar" />
            <span>warming up dev server</span>
            <span className="tabular text-paper-mute/70">{url}</span>
          </div>
        </div>
      )}
      <iframe
        key={url}
        src={url}
        title={`${aspect} preview`}
        onLoad={onReady}
        // Same-origin allows GSAP-driven scripts and the HyperFrames
        // dev server's HMR socket to run; sandbox-only would break both.
        className="h-full w-full border-0 bg-ink"
      />
    </>
  );
}

// ─── Video variant (rendered MP4) ────────────────────────────────────────

function VideoView({ url, format }: { url: string; format: string }) {
  // The studio-media:// custom protocol streams the MP4 from disk through
  // the main process. The protocol handler supports range requests so
  // Chromium's <video> element can seek freely.
  return (
    <div className="flex h-full w-full items-center justify-center bg-ink">
      <video
        key={url}
        src={url}
        controls
        autoPlay
        className="h-full max-h-full w-full max-w-full bg-ink"
        title={`Rendered output · ${format}`}
      >
        Your renderer doesn't support inline video — use "open in player ↗" above.
      </video>
    </div>
  );
}
