import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Pulse } from "./Pulse.js";
import { onAgentEvent } from "../../lib/agent-client.js";
import type { ThemeId } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

/**
 * Universal top chrome — 44px (was 36), hairline-bottom, always-visible across
 * routes inside <App>. Brand mark · breadcrumb · agent run indicator · theme
 * toggle button · settings button.
 *
 * Per DESIGN.md: chrome-thin (still chrome — just slightly more substantial),
 * no rounded corners on the bar itself, brass hairline divider only. Buttons
 * inside use 2px corners + hover surface so they're visibly clickable.
 *
 * On macOS the BrowserWindow uses titleBarStyle="hiddenInset" so traffic
 * lights appear top-left and we leave a 80px gap on the leading edge.
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

  const trafficLightGap = platform === "darwin" ? "pl-[80px]" : "pl-6";

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
      className={cn(
        "hairline relative z-10 flex h-14 shrink-0 items-center justify-between border-b bg-ink pr-4",
        trafficLightGap
      )}
    >
      <div className="flex items-center gap-6">
        <BrandMark />
        <span className="h-5 w-px bg-brass-line" aria-hidden />
        <nav className="flex items-baseline gap-2.5 font-mono text-[11px] uppercase tracking-widest">
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-2.5">
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
              {i < breadcrumb.length - 1 && (
                <span className="text-paper-mute/85">/</span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2.5">
        {running && (
          <span className="mr-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-cinnabar">
            <Pulse size="sm" />
            <span>{phase ?? "running"}</span>
          </span>
        )}
        {theme && onThemeChange && (
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        )}
        <SettingsButton />
      </div>
    </header>
  );
}

// ─── Brand mark ───────────────────────────────────────────────────────────
// Stylized lens + play triangle. The cinnabar dot in the upper-right is a
// classic "REC" marker — subtle nod to the app's purpose without being
// literal. Wordmark in Fraunces small-caps tracking, slightly larger than
// before so the brand reads at the top of the viewport.

function BrandMark() {
  return (
    <Link
      to="/"
      className="group inline-flex items-center gap-3 transition-colors"
    >
      <span className="relative inline-block h-8 w-8">
        <svg
          viewBox="0 0 32 32"
          className="h-8 w-8 text-paper transition-transform group-hover:rotate-3"
          aria-hidden
        >
          {/* Lens ring */}
          <circle
            cx="16"
            cy="16"
            r="13.5"
            stroke="currentColor"
            strokeWidth="1.75"
            fill="none"
          />
          {/* Inner aperture suggestion */}
          <circle
            cx="16"
            cy="16"
            r="9"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
            opacity="0.55"
          />
          {/* Play triangle */}
          <path
            d="M13 11.5 L21.5 16 L13 20.5 Z"
            fill="var(--color-cinnabar)"
          />
        </svg>
        {/* REC dot */}
        <span
          aria-hidden
          className="absolute right-0 top-0 h-2 w-2 rounded-full bg-cinnabar shadow-[0_0_6px_var(--color-cinnabar-glow)]"
        />
      </span>
      <span className="flex items-baseline gap-1.5 font-display text-[18px] font-semibold tracking-tight text-paper">
        Video
        <span className="italic text-paper-mute transition-colors group-hover:text-paper">
          Studio
        </span>
      </span>
    </Link>
  );
}

// ─── Icon buttons (theme toggle, settings) ────────────────────────────────
// Visible 32×32 hit targets with a hairline border, hover surface, and an
// active label that reads on hover. Way more clickable than a text link.

function IconButton({
  to,
  onClick,
  title,
  active,
  children,
}: {
  to?: string;
  onClick?: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const className = cn(
    "group inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
    active
      ? "border-brass/60 bg-ink-edge text-paper"
      : "border-paper-mute/30 text-paper hover:border-brass/50 hover:bg-ink-edge"
  );
  if (to) {
    return (
      <Link to={to} className={className} title={title} aria-label={title}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} title={title} aria-label={title}>
      {children}
    </button>
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
  const label = `Switch to Atelier ${next === "noir" ? "Noir" : "Crème"}`;
  return (
    <IconButton onClick={() => onChange(next)} title={label}>
      {theme === "noir" ? (
        <SunGlyph className="h-4 w-4" />
      ) : (
        <MoonGlyph className="h-4 w-4" />
      )}
    </IconButton>
  );
}

function SettingsButton() {
  const location = useLocation();
  const isActive = location.pathname === "/settings";
  return (
    <IconButton to="/settings" title="Settings" active={isActive}>
      <GearGlyph className="h-4 w-4" />
    </IconButton>
  );
}

// ─── Glyphs ───────────────────────────────────────────────────────────────

function SunGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path
        d="M8 1.5V3 M8 13V14.5 M1.5 8H3 M13 8H14.5 M3.2 3.2L4.3 4.3 M11.7 11.7L12.8 12.8 M3.2 12.8L4.3 11.7 M11.7 4.3L12.8 3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        d="M12.5 10 A 5.5 5.5 0 1 1 6 3.5 A 4 4 0 0 0 12.5 10 Z"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      {/* Gear teeth — 8 nubs around a center */}
      <path
        d="M8 1.5V3 M8 13V14.5 M1.5 8H3 M13 8H14.5
           M3.2 3.2L4.3 4.3 M11.7 11.7L12.8 12.8
           M3.2 12.8L4.3 11.7 M11.7 4.3L12.8 3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Outer ring */}
      <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.4" fill="none" />
      {/* Inner hole */}
      <circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
