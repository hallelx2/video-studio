import { type ReactNode } from "react";
import { cn } from "../../lib/cn.js";

/**
 * Composed row for the agent stream. CSS-grid layout so the icon disc and
 * the header line share a row and align on their *vertical centers* rather
 * than their tops — the previous flex `items-start` setup put the icon disc
 * (28px tall) above the header text (~14px tall) which read as visually
 * misaligned.
 *
 *   ┌───────────────────────────────────────────────────────┐
 *   │  ◯ icon   │   header (label · meta)         status   │   ← row 1
 *   │           │   body (text / markdown / artifact)      │   ← row 2
 *   └───────────────────────────────────────────────────────┘
 *
 * Static rows are unstyled — clean composition, no chrome. Interactive
 * rows (clickable, expanded, error) earn a 4px rounded container with a
 * mist border or subtle background per their state.
 *
 * **State treatments**:
 *   - `running` → cyan-tinted icon disc + the verb text shimmers inside
 *     the row. No row-wide border, no top stripe — those over-painted the
 *     row and read as "the whole div is shimmering".
 *   - `brutalist` → signature 4×4 offset shadow (fatal errors only).
 *   - `expanded` → mist-08 border + mist-04 background.
 *   - hovered (when `onClick`) → mist-04 background.
 */
export type StreamRowTone =
  | "user"      // your message — high contrast
  | "agent"     // agent text — cyan icon, the "delivery" moment
  | "tool"      // tool call — neutral
  | "reasoning" // collapsed thought — dim, italic body
  | "running"   // any in-flight activity — cyan disc + verb shimmer
  | "alarm"     // error — alarm tone, optionally brutalist
  | "muted";    // logs, raw events — receded

const ICON_TONE: Record<StreamRowTone, string> = {
  user:       "text-fg",
  agent:      "text-cyan",
  tool:       "text-fg-muted",
  reasoning:  "text-fg-faint/80",
  running:    "text-cyan",
  alarm:      "text-alarm",
  muted:      "text-fg-faint/70",
};

const ICON_BG: Record<StreamRowTone, string> = {
  user:       "bg-fg/[0.06] ring-1 ring-mist-10",
  agent:      "bg-cyan/[0.08] ring-1 ring-cyan/30",
  tool:       "bg-mist-04 ring-1 ring-mist-08",
  reasoning:  "bg-mist-04 ring-1 ring-mist-06",
  running:    "bg-cyan/[0.12] ring-1 ring-cyan/40",
  alarm:      "bg-alarm/[0.10] ring-1 ring-alarm/30",
  muted:      "bg-mist-04 ring-1 ring-mist-06",
};

export function StreamRow({
  tone = "tool",
  icon,
  header,
  status,
  running = false,
  brutalist = false,
  expanded = false,
  onClick,
  children,
  className,
  ariaLabel,
}: {
  tone?: StreamRowTone;
  /** Lucide icon (e.g. `<ArrowUpRight className="h-4 w-4" />`). Stroked, currentColor. */
  icon: ReactNode;
  /** Header line — small uppercase label + meta. Renders in row 1, col 2. */
  header?: ReactNode;
  /** Trailing status — elapsed time, badge, expand caret. Right-aligned within row 1. */
  status?: ReactNode;
  /** Active state — cyan icon disc + verb text shimmers (caller wires that). */
  running?: boolean;
  /** Apply the signature brutalist 4×4 offset shadow. Reserve for fatal moments. */
  brutalist?: boolean;
  /** Expanded state — mist border + subtle background. Used by collapsible rows. */
  expanded?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const Tag = onClick ? "button" : "div";
  const interactive = !!onClick;
  const hasBody = children !== undefined && children !== null && children !== false;

  return (
    <Tag
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={interactive ? expanded : undefined}
      className={cn(
        // Two-column grid. Row 1 holds icon + header (centered together).
        // Row 2 (col 2 only) holds the body content. gap-y stays small so a
        // body that immediately follows the header reads as continuous.
        "group relative grid w-full min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded px-3 py-2.5 text-left transition-all duration-150",
        // Container chrome — only when state earns it.
        expanded && !running && "border border-mist-08 bg-mist-04",
        brutalist && "shadow-brutalist border border-alarm/40 bg-alarm/[0.04]",
        interactive && !expanded && !running && !brutalist && "hover:bg-mist-04",
        interactive && "cursor-pointer",
        className
      )}
    >
      {/* ── Icon disc ── grid row 1, col 1, vertically centered */}
      <span
        aria-hidden
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
          ICON_BG[tone],
          ICON_TONE[tone]
        )}
      >
        {icon}
      </span>

      {/* ── Header ── grid row 1, col 2. Header line + trailing status share
            this cell with `justify-between`. */}
      {header ? (
        <span className="flex min-w-0 items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-baseline gap-2.5">{header}</span>
          {status && (
            <span className="flex shrink-0 items-baseline gap-2.5">{status}</span>
          )}
        </span>
      ) : (
        // No header — the body takes col 2 of row 1. Status (if any) gets
        // absolute-positioned to the right edge of the row.
        <span className="min-w-0">
          {hasBody && children}
          {status && (
            <span className="absolute right-3 top-2.5 flex shrink-0 items-baseline gap-2.5">
              {status}
            </span>
          )}
        </span>
      )}

      {/* ── Body ── grid row 2, col 2. Only rendered when there's both a
            header and body content (otherwise the body lives in row 1 above). */}
      {header && hasBody && (
        <span className="col-start-2 row-start-2 min-w-0">{children}</span>
      )}
    </Tag>
  );
}

/**
 * Small uppercase tracking-wide label used inside row headers.
 * Common pattern: <RowLabel tone="cyan">interrupt</RowLabel>.
 */
export function RowLabel({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "cyan" | "alarm" | "fg";
}) {
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-[10px] uppercase tracking-[0.14em]",
        tone === "muted" && "text-fg-muted",
        tone === "cyan" && "text-cyan",
        tone === "alarm" && "text-alarm",
        tone === "fg" && "text-fg"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Pill-shaped badge for inline counts/status. Per DESIGN.md the pill scale
 * is 9999 radius — softer, more approachable for these signal moments.
 */
export function RowBadge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "cyan" | "alarm";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-baseline gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] tabular leading-none",
        tone === "muted" && "border-mist-10 text-fg-muted",
        tone === "cyan" && "border-cyan/40 text-cyan",
        tone === "alarm" && "border-alarm/40 text-alarm"
      )}
    >
      {children}
    </span>
  );
}
