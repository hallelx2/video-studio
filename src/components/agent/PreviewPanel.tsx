import { useEffect, useState } from "react";
import { cn } from "../../lib/cn.js";
import {
  openExternal,
  openPath,
  revealInFolder,
  statPath,
  transcodeWebSafe,
} from "../../lib/agent-client.js";
import { usePreview } from "../../lib/preview-context.js";

/**
 * Slide-in preview panel. Polymorphic: hosts either a HyperFrames dev
 * server in an iframe (compose-approval flow) or a rendered MP4 in a
 * <video> element (post-render flow). Same chrome, same animation, same
 * close affordances — the user toggles between the two via the same
 * surface so they never leave the Composio surface.
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
        className="fixed inset-0 z-40 cursor-default bg-void/70 backdrop-blur-sm transition-opacity duration-200 enter-rise"
      />

      {/* The panel itself — slides in from the right. */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-[70vw] min-w-[640px] max-w-[1280px]",
          "flex-col border-l border-mist-10/30 bg-void shadow-[-24px_0_64px_rgba(0,0,0,0.45)]",
          "translate-x-0 transition-transform duration-200 ease-[var(--ease-composio)]"
        )}
      >
        <PanelHeader current={current} onClose={() => void close()} />
        <div className="relative flex-1 bg-void">
          {current.kind === "iframe" ? (
            <IframeView
              url={current.url}
              aspect={current.aspect}
              ready={iframeReady}
              onReady={() => setIframeReady(true)}
            />
          ) : (
            <VideoView
              url={current.url}
              format={current.format}
              filePath={current.filePath}
            />
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
        <span className="pulse-cyan h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
          {isIframe ? "live preview" : "rendered video"}
        </span>
        <span className="shrink-0 font-display text-base font-semibold text-fg">
          {label}
        </span>
        <span className="min-w-0 truncate font-mono text-[10px] text-fg-muted">
          {detailLine}
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-5">
        {!isIframe && (
          <button
            onClick={handleReveal}
            className="border-b border-fg-muted/40 pb-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:border-fg hover:text-fg"
            title="Reveal the file in your file manager"
          >
            reveal ↗
          </button>
        )}
        <button
          onClick={handleOpenExternal}
          className="border-b border-fg-muted/40 pb-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:border-fg hover:text-fg"
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
          className="border-b border-cyan pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan transition-colors hover:text-fg"
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
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-void">
          <div className="flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            <span className="pulse-cyan h-1.5 w-1.5 self-center rounded-full bg-cyan" />
            <span>warming up dev server</span>
            <span className="tabular text-fg-muted/70">{url}</span>
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
        className="h-full w-full border-0 bg-void"
      />
    </>
  );
}

// ─── Video variant (rendered MP4) ────────────────────────────────────────

function VideoView({
  url,
  format,
  filePath,
}: {
  url: string;
  format: string;
  filePath: string;
}) {
  // The studio-media:// custom protocol streams the MP4 from disk through
  // the main process. The protocol handler supports range requests so
  // Chromium's <video> element can seek freely.
  //
  // We surface load errors directly to the user — silent black frames are
  // worse than a visible "couldn't load" with a Retry button. Most
  // failures come from (a) the file being mid-write when we mounted, or
  // (b) the path encoding losing a backslash on Windows.
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [transcoding, setTranscoding] = useState(false);

  useEffect(() => {
    setError(null);
    setDiag(null);
  }, [url, reloadKey]);

  const handleFixCodec = async () => {
    setTranscoding(true);
    try {
      const res = await transcodeWebSafe(filePath);
      if (res.ok) {
        // Force <video> to remount with a fresh URL so it doesn't keep
        // the cached failed-decode state.
        setReloadKey((k) => k + 1);
      } else {
        setDiag(`transcode failed: ${res.error}`);
      }
    } finally {
      setTranscoding(false);
    }
  };

  // When the <video> errors, the bare error code rarely tells us why.
  // fetch() can't parse studio-media:// URLs in the renderer, so we go
  // through the main process via IPC to stat the underlying file. That
  // distinguishes the three real failure modes:
  //   - file missing → render didn't finish or wrote elsewhere
  //   - file present but 0 bytes → render still in flight, mid-write
  //   - file present and sized → likely a codec / corrupt file issue
  const probeResponse = async () => {
    try {
      const st = await statPath(filePath);
      if (!st.exists) {
        setDiag(
          `file not on disk · ${st.error ?? "ENOENT"} — the render likely never produced this output. Check that Stage 6 finished.`
        );
        return;
      }
      if (!st.isFile) {
        setDiag(`path exists but is not a file (directory?)`);
        return;
      }
      if (st.size === 0) {
        setDiag(
          `file is 0 bytes — render is probably mid-write or failed. Try Retry once Stage 6 finishes.`
        );
        return;
      }
      const kb = (st.size / 1024).toFixed(1);
      setDiag(
        `file is on disk · ${kb} KB · likely a codec or container issue (Chromium <video> only plays H.264/AAC MP4 — try 'open in player ↗')`
      );
    } catch (err) {
      setDiag(
        `stat failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-void px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-alarm">
          could not load video
        </p>
        <p className="max-w-md text-[12px] text-fg-muted [overflow-wrap:anywhere]">
          {error}
        </p>
        {diag && (
          <p className="max-w-md font-mono text-[10px] text-amber-300/85 [overflow-wrap:anywhere]">
            handler: {diag}
          </p>
        )}
        <p className="max-w-md font-mono text-[10px] text-fg-muted/70 [overflow-wrap:anywhere]">
          {url}
        </p>
        <div className="flex flex-wrap items-baseline justify-center gap-4">
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={transcoding}
            className="border-b border-cyan pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          >
            retry ↻
          </button>
          <button
            onClick={() => void handleFixCodec()}
            disabled={transcoding}
            title="Re-encode this MP4 in place to a Chromium-safe H.264/yuv420p profile"
            className="border-b border-cyan pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {transcoding ? "transcoding…" : "fix codec ⚙"}
          </button>
          {!diag && (
            <button
              onClick={() => void probeResponse()}
              className="border-b border-mist-10 pb-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
            >
              probe protocol
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-void">
      <video
        key={`${url}#${reloadKey}`}
        src={url}
        controls
        autoPlay
        preload="auto"
        playsInline
        className="h-full max-h-full w-full max-w-full bg-void"
        title={`Rendered output · ${format}`}
        onError={(e) => {
          const el = e.currentTarget;
          const code = el.error?.code ?? null;
          const codeMap: Record<number, string> = {
            1: "MEDIA_ERR_ABORTED — playback aborted",
            2: "MEDIA_ERR_NETWORK — network/protocol error reaching the file",
            3: "MEDIA_ERR_DECODE — the file exists but couldn't be decoded (codec / corrupt)",
            4: "MEDIA_ERR_SRC_NOT_SUPPORTED — file missing, unreadable, or unsupported format",
          };
          setError(
            (code !== null ? codeMap[code] ?? `error code ${code}` : null) ??
              el.error?.message ??
              "unknown video error"
          );
          // Auto-probe so the user immediately sees the real handler
          // response (HTTP status + body) without an extra click.
          void probeResponse();
        }}
      >
        Your renderer doesn't support inline video — use "open in player ↗" above.
      </video>
    </div>
  );
}
