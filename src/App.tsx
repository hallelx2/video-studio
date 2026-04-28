import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { getConfig, saveConfig } from "./lib/agent-client.js";
import { TopChrome } from "./components/ui/TopChrome.js";
import { Pulse } from "./components/ui/Pulse.js";
import { SearchPalette } from "./components/agent/SearchPalette.js";
import { PreviewPanel } from "./components/agent/PreviewPanel.js";
import { PreviewProvider } from "./lib/preview-context.js";
import { DEFAULT_CONFIG, type AppConfig, type ThemeId } from "./lib/types.js";

/**
 * Composio shell.
 *
 * Owns: grain overlay, top chrome, route outlet, and the global Cmd+K
 * search palette. Routes own their own internal layout (left rail,
 * workbench, agent stream) so each page can compose them differently —
 * see DESIGN.md.
 */
export function App() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_CONFIG.theme);

  // Bootstrap onboarding redirect + hydrate theme.
  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then((cfg) => {
        if (cancelled) return;
        const t: ThemeId = cfg.theme ?? DEFAULT_CONFIG.theme;
        setThemeState(t);
        if (!cfg.onboardingComplete || !cfg.orgProjectsPath) {
          navigate("/onboarding", { replace: true });
        }
        setChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        navigate("/onboarding", { replace: true });
        setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Reflect the theme on <html> so the [data-theme="creme"] CSS rules in
  // index.css apply globally — including overlays, the search palette,
  // and any portaled content. data-theme="noir" is the default and a noop.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, [theme]);

  const setTheme = async (next: ThemeId) => {
    setThemeState(next);
    try {
      const cfg = (await getConfig().catch(() => null)) ?? DEFAULT_CONFIG;
      const merged: AppConfig = { ...cfg, theme: next };
      await saveConfig(merged);
    } catch {
      // best-effort persistence; the in-memory state still flips
    }
  };

  // Global Cmd+K / Ctrl+K to open the search palette. Suppressed when
  // typing in editable elements (the slash menu owns input focus there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== "k") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        // Allow Cmd+K from inputs only if no value is being edited (rare
        // case — let the user have it).
        if ((target as HTMLInputElement).value && (target as HTMLInputElement).value.length > 0) {
          return;
        }
      }
      e.preventDefault();
      setPaletteOpen((v) => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Native menu → UI commands. File > Search… opens the palette;
  // File > New Session is delegated to whichever route owns the action
  // (Workbench listens via the same `menu:new-session` channel).
  useEffect(() => {
    const unsub = window.studio?.meta?.onMenuCommand?.((cmd) => {
      if (cmd === "open-search") setPaletteOpen(true);
    });
    return () => {
      unsub?.();
    };
  }, []);

  if (!checked) {
    return (
      <div className="grain flex h-screen w-screen items-center justify-center bg-void">
        <Pulse size="md" />
      </div>
    );
  }

  return (
    <PreviewProvider>
      <div className="grain flex h-screen w-screen flex-col bg-void text-fg">
        <TopChrome theme={theme} onThemeChange={setTheme} />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
        <SearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        {/* Inline preview slide-in — globally mounted so any route can drive
            it via usePreview(). Renders nothing when no preview is active. */}
        <PreviewPanel />
      </div>
    </PreviewProvider>
  );
}
