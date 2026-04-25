import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { getConfig } from "./lib/agent-client.js";
import { TopChrome } from "./components/ui/TopChrome.js";
import { Pulse } from "./components/ui/Pulse.js";

/**
 * Atelier Noir shell.
 *
 * Owns: grain overlay, top chrome (always visible), and the route outlet.
 * Routes own their own internal layout (left rail, workbench, agent stream)
 * so each page can compose them differently — see DESIGN.md.
 */
export function App() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

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
    </div>
  );
}
