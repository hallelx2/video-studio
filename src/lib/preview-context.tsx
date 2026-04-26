import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { startPreview, stopPreview } from "./agent-client.js";

/**
 * Inline preview state, hoisted to the App shell so any component on any
 * route can request a HyperFrames dev-server preview and have it appear in
 * the slide-in PreviewPanel — instead of launching the user's external
 * browser the way the old flow did.
 *
 * One preview is in flight at a time. Opening a new one stops the previous
 * dev server before spinning up the next so we don't leak ports.
 */

export interface PreviewState {
  /** Workspace dir we spawned `hyperframes preview` against. */
  workspace: string;
  /** Aspect ratio label shown in the panel header (e.g. "1080x1080"). */
  aspect: string;
  /** http://localhost:<port> the dev server is bound to. */
  url: string;
}

interface PreviewContextValue {
  current: PreviewState | null;
  starting: string | null;
  open: (args: { workspace: string; aspect: string }) => Promise<void>;
  close: () => Promise<void>;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<PreviewState | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const open = useCallback(
    async ({ workspace, aspect }: { workspace: string; aspect: string }) => {
      // Same aspect already running? No-op.
      if (current && current.workspace === workspace && current.aspect === aspect) return;
      // Different aspect or first launch — tear down whatever's running.
      if (current) {
        await stopPreview().catch(() => undefined);
      }
      setStarting(aspect);
      try {
        const { url } = await startPreview(workspace);
        setCurrent({ workspace, aspect, url });
      } finally {
        setStarting(null);
      }
    },
    [current]
  );

  const close = useCallback(async () => {
    setCurrent(null);
    await stopPreview().catch(() => undefined);
  }, []);

  // Stop the dev server when the app is unmounted (window close, navigate
  // away from a route that invoked it, etc).
  useEffect(() => {
    return () => {
      stopPreview().catch(() => undefined);
    };
  }, []);

  return (
    <PreviewContext.Provider value={{ current, starting, open, close }}>
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
      open: async () => undefined,
      close: async () => undefined,
    };
  }
  return ctx;
}
