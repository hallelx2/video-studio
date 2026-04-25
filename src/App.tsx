import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { getConfig } from "./lib/agent-client.js";
import { TopChrome } from "./components/ui/TopChrome.js";
import { Pulse } from "./components/ui/Pulse.js";
import { SearchPalette } from "./components/agent/SearchPalette.js";

/**
 * Atelier Noir shell.
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

  // Bootstrap onboarding redirect.
  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then((cfg) => {
        if (cancelled) return;
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

  if (!checked) {
    return (
      <div className="grain flex h-screen w-screen items-center justify-center bg-ink">
        <Pulse size="md" />
      </div>
    );
  }

  return (
    <div className="grain flex h-screen w-screen flex-col bg-ink text-paper">
      <TopChrome />
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      <SearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
