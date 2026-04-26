import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Pulse } from "./Pulse.js";
import { onAgentEvent } from "../../lib/agent-client.js";
import type { ThemeId } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

/**
 * The app's universal top chrome — 36px, hairline-bottom, always-visible across
 * routes inside <App>. Shows: brand mark · breadcrumb · agent run indicator ·
 * theme toggle · settings.
 *
 * Per DESIGN.md: chrome-thin, no rounded corners, brass hairline divider only.
 * On macOS, the BrowserWindow uses titleBarStyle="hiddenInset" so traffic lights
 * appear top-left and we leave a 72px gap on the leading edge for them.
 */
export function TopChrome({
  theme,
  onThemeChange,
}: {
  theme?: ThemeId;
  onThemeChange?: (next: ThemeId) => void;
}) {
  const location = useLocation();
  const params = useParams();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);

  useEffect(() => {
    const unsub = onAgentEvent((event) => {
      if (event.type === "progress") {
        setRunning(true);
        setPhase(event.phase);
      }
      if (event.type === "result") {
        setRunning(false);
        setPhase(null);
      }
      if (event.type === "error" && event.recoverable === false) {
        setRunning(false);
        setPhase(null);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.studio?.meta
      ?.platform()
      .then((p) => {
        if (!cancelled) setPlatform(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const trafficLightGap = platform === "darwin" ? "pl-[80px]" : "pl-8";

  // Build a breadcrumb from the path
  const segments = location.pathname.split("/").filter(Boolean);
  const breadcrumb = ((): { label: string; to?: string }[] => {
    if (segments.length === 0) return [{ label: "Projects" }];
    if (segments[0] === "settings") return [{ label: "Projects", to: "/" }, { label: "Settings" }];
    if (segments[0] === "project" && segments[1]) {
      return [{ label: "Projects", to: "/" }, { label: params.productId ?? segments[1] }];
    }
    return [{ label: segments.join(" / ") }];
  })();

  return (
    <header
      className={`hairline relative z-10 flex h-9 shrink-0 items-center justify-between border-b bg-ink ${trafficLightGap} pr-6`}
    >
      <div className="flex items-center gap-5">
        <BrandMark />
        <span className="h-3 w-px bg-brass-line" aria-hidden />
        <nav className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-widest">
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-2">
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="text-paper-mute transition-colors hover:text-paper"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-paper">{crumb.label}</span>
              )}
              {i < breadcrumb.length - 1 && <span className="text-paper-mute/50">/</span>}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-6">
        {running && (
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cinnabar">
            <Pulse size="xs" />
            <span>{phase ?? "running"}</span>
          </span>
        )}
        {theme && onThemeChange && (
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        )}
        <Link
          to="/settings"
          className="font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
        >
          settings
        </Link>
      </div>
    </header>
  );
}

function ThemeToggle({
  theme,
  onChange,
}: {
  theme: ThemeId;
  onChange: (next: ThemeId) => void;
}) {
  const next: ThemeId = theme === "noir" ? "creme" : "noir";
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      title={`Switch to Atelier ${next === "noir" ? "Noir" : "Crème"}`}
      className={cn(
        "flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
      )}
    >
      {theme === "noir" ? <SunGlyph /> : <MoonGlyph />}
      <span>{theme === "noir" ? "noir" : "crème"}</span>
    </button>
  );
}

function SunGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path
        d="M6 1.5V3 M6 9V10.5 M1.5 6H3 M9 6H10.5 M2.6 2.6L3.5 3.5 M8.5 8.5L9.4 9.4 M2.6 9.4L3.5 8.5 M8.5 3.5L9.4 2.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <path
        d="M9 7.5 A 4 4 0 1 1 4.5 3 A 3 3 0 0 0 9 7.5 Z"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrandMark() {
  return (
    <Link
      to="/"
      className="group inline-flex items-baseline gap-1.5 font-display text-[15px] font-semibold tracking-tight text-paper transition-colors"
    >
      <svg
        width="9"
        height="14"
        viewBox="0 0 9 14"
        fill="none"
        className="translate-y-[1px] text-cinnabar transition-transform group-hover:translate-y-0"
        aria-hidden
      >
        <path d="M0 0 L9 7 L0 14 Z" fill="currentColor" />
      </svg>
      <span>
        Video <span className="italic text-paper-mute/70 group-hover:text-paper">Studio</span>
      </span>
    </Link>
  );
}
