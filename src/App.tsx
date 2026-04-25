import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Video, Film, Settings } from "lucide-react";
import { getConfig } from "./lib/agent-client.js";
import { cn } from "./lib/cn.js";

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then((cfg) => {
        if (cancelled) return;
        if (!cfg.onboarding_complete || !cfg.org_projects_path) {
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
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-800 border-t-blue-500" />
      </div>
    );
  }

  const isProjects = location.pathname === "/";
  const isSettings = location.pathname === "/settings";

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-50">
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-zinc-900 py-6">
        <Link
          to="/"
          className="mb-8 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10 text-blue-400 ring-1 ring-blue-500/20"
          title="Video Studio"
        >
          <Video className="h-5 w-5" />
        </Link>
        <nav className="flex flex-1 flex-col gap-2">
          <NavIcon to="/" active={isProjects} icon={<Film className="h-5 w-5" />} label="Projects" />
        </nav>
        <NavIcon to="/settings" active={isSettings} icon={<Settings className="h-5 w-5" />} label="Settings" />
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function NavIcon({ to, active, icon, label }: { to: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg transition",
        active
          ? "bg-zinc-900 text-zinc-50 ring-1 ring-zinc-800"
          : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
      )}
      title={label}
    >
      {icon}
    </Link>
  );
}
