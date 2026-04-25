import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { getConfig } from "./lib/agent-client.js";

/**
 * Atelier Noir shell.
 *
 * Just the grain overlay and a route outlet. Routes own their own internal
 * layout (left rail, workbench, agent stream) so each page can compose them
 * differently — see DESIGN.md for the prescribed shape.
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
        <span className="pulse-cinnabar h-2 w-2 rounded-full bg-cinnabar" />
      </div>
    );
  }

  return (
    <div className="grain flex h-screen w-screen flex-col bg-ink text-paper">
      <Outlet />
    </div>
  );
}
