import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { startPreview, stopPreview } from "./agent-client.js";

/**
 * Inline preview state, hoisted to the App shell so any component on any
 * route can request a HyperFrames dev-server preview OR play a rendered
 * MP4 inline — the slide-in PreviewPanel is the single surface for both.
 *
 * Two flavors:
 *   - `iframe`: HyperFrames composition preview. Spawns the dev server in
 *     the bridge and renders an <iframe> against the bound port.
 *   - `video`:  rendered MP4 file. Resolves through the studio-media://
 *     custom protocol so Chromium's <video> element can stream it
 *     directly from disk without going to the OS player.
 *
 * One preview is in flight at a time. Opening a new one stops the previous
 * dev server (if any) before transitioning so we don't leak ports.
 */

export type PreviewState =
  | {
      kind: "iframe";
      /** Workspace dir we spawned `hyperframes preview` against. */
      workspace: string;
      /** Aspect ratio label shown in the panel header (e.g. "1080x1080"). */
      aspect: string;
      /** http://localhost:<port> the dev server is bound to. */
      url: string;
    }
  | {
      kind: "video";
      /** Absolute filesystem path to the rendered MP4. */
      filePath: string;
      /** Format label shown in the header (e.g. "linkedin", "youtube"). */
      format: string;
      /** Pre-built studio-media:// URL the <video> element loads. */
      url: string;
    };

interface PreviewContextValue {
  current: PreviewState | null;
  starting: string | null;
  /** Open a HyperFrames composition in the iframe variant of the panel. */
  openIframe: (args: { workspace: string; aspect: string }) => Promise<void>;
  /** Open a rendered MP4 in the <video> variant of the panel. Sync — no
   *  subprocess to spawn for video playback. */
  openVideo: (args: { filePath: string; format: string }) => void;
  close: () => Promise<void>;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

/**
 * Build a studio-media:// URL for an absolute filesystem path. The path
 * is URL-encoded as a single segment so Windows drive letters / spaces /
 * unicode in paths all survive the round trip through URL parsing.
 */
function mediaUrlFor(filePath: string): string {
  return `studio-media:///${encodeURIComponent(filePath)}`;
}

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<PreviewState | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const tearDown = useCallback(async () => {
    // Only the iframe variant has a dev server we need to kill. Video
    // playback has nothing backing it beyond the protocol handler.
    if (current?.kind === "iframe") {
      await stopPreview().catch(() => undefined);
    }
  }, [current]);

  const openIframe = useCallback(
    async ({ workspace, aspect }: { workspace: string; aspect: string }) => {
      // Same iframe already running? No-op.
      if (
        current?.kind === "iframe" &&
        current.workspace === workspace &&
        current.aspect === aspect
      ) {
        return;
      }
      await tearDown();
      setStarting(aspect);
      try {
        const { url } = await startPreview(workspace);
        setCurrent({ kind: "iframe", workspace, aspect, url });
      } finally {
        setStarting(null);
      }
    },
    [current, tearDown]
  );

  const openVideo = useCallback(
    ({ filePath, format }: { filePath: string; format: string }) => {
      // Switching to a video tears down any iframe that was up — they
      // share the same panel so a transition makes sense.
      if (current?.kind === "iframe") {
        void stopPreview().catch(() => undefined);
      }
      setCurrent({
        kind: "video",
        filePath,
        format,
        url: mediaUrlFor(filePath),
      });
    },
    [current]
  );

  const close = useCallback(async () => {
    setCurrent(null);
    await stopPreview().catch(() => undefined);
  }, []);

  // Stop any running dev server when the app unmounts.
  useEffect(() => {
    return () => {
      stopPreview().catch(() => undefined);
    };
  }, []);

  return (
    <PreviewContext.Provider value={{ current, starting, openIframe, openVideo, close }}>
      {children}
    </PreviewContext.Provider>
  );
}

/**
 * Hook for any component to drive the inline preview. Always safe to call —
 * if the provider isn't mounted (shouldn't happen in normal flow) we return
 * a no-op shape so consumers don't need to defensive-check.
 */
export function usePreview(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) {
    return {
      current: null,
      starting: null,
      openIframe: async () => undefined,
      openVideo: () => undefined,
      close: async () => undefined,
    };
  }
  return ctx;
}
