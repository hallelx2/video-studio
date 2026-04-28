import { useState, type ReactNode } from "react";
import { Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { StreamRow, RowLabel, RowBadge } from "./StreamRow.js";

/**
 * Render a contiguous run of agent_log lines as one terminal pane — dark
 * surface background, mono font, ANSI escape sequences parsed into colored
 * spans so output from `npx hyperframes tts` / `preview` / stderr looks like
 * the actual terminal it came from instead of plain scattered rows.
 *
 * Wrapped in a StreamRow header so the terminal sits inside the same grid
 * as every other event. The inner pane is a self-contained, framed surface
 * with three small "window dots" hinting at terminal-window provenance,
 * generous internal padding, and a centered hidden-lines indicator that
 * reads as part of the output rather than chrome.
 */
export function TerminalLogGroup({
  level,
  lines,
}: {
  /** Log level — used as the title, e.g. "tts", "preview", "stderr". */
  level: string;
  lines: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_TAIL = 8;
  const isLong = lines.length > COLLAPSED_TAIL;
  const visible = expanded || !isLong ? lines : lines.slice(-COLLAPSED_TAIL);
  const hidden = lines.length - visible.length;

  return (
    <StreamRow
      tone="muted"
      icon={<Terminal className="h-3.5 w-3.5" strokeWidth={1.75} />}
      header={
        <span className="flex min-w-0 items-baseline gap-2.5">
          <RowLabel tone="muted">terminal</RowLabel>
          <span className="font-mono text-[10px] text-fg-muted/70">·</span>
          <span className="font-mono text-[11px] tracking-tight text-fg-muted">{level}</span>
          <RowBadge tone="muted">
            {lines.length} {lines.length === 1 ? "line" : "lines"}
          </RowBadge>
        </span>
      }
      status={
        isLong ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded border border-mist-08 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:border-mist-12 hover:bg-mist-04 hover:text-fg"
            title={expanded ? "Collapse to last 8 lines" : `Show all ${lines.length} lines`}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                show all
              </>
            )}
          </button>
        ) : undefined
      }
    >
      {/* ── Terminal pane ──────────────────────────────────────────────────
          The StreamRow's icon + "TERMINAL · {level}" header already
          establishes terminal context, so we don't need a redundant
          window-chrome strip on the inner pane. Just a clean framed pre
          with an optional hidden-lines indicator. Reads light for one-line
          output, holds together for long traces. */}
      <div className="mt-2 overflow-hidden rounded border border-mist-10 bg-surface">
        {/* Hidden-lines indicator — centered ellipsis with leading and
            trailing hairlines so it reads as part of the output rather
            than as a separate UI control. */}
        {hidden > 0 && (
          <div className="flex items-center justify-center gap-3 border-b border-mist-06 bg-void/30 px-3 py-1.5">
            <span aria-hidden className="h-px w-12 bg-mist-08" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted/65">
              {hidden} earlier {hidden === 1 ? "line" : "lines"} hidden
            </span>
            <span aria-hidden className="h-px w-12 bg-mist-08" />
          </div>
        )}

        {/* Lines — generous padding, comfortable leading. Horizontal scroll
            preserves real-terminal behavior on long paths instead of
            wrapping mid-line. */}
        <pre
          className={cn(
            "max-h-72 overflow-auto px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-fg/85",
            "whitespace-pre"
          )}
        >
          {visible.map((line, i) => (
            <div key={i}>{ansiToReact(line)}</div>
          ))}
        </pre>
      </div>
    </StreamRow>
  );
}

// ─── ANSI escape sequence → React span colors ────────────────────────────
// Minimal SGR (Select Graphic Rendition) parser: handles the colors most
// CLI tools actually emit (foreground 30–37 / 90–97, reset 0/39, bold 1).
// Anything we don't recognise is consumed silently so the text is clean.
//
// Color choices favor the Composio cool palette — cyan for info, signal-blue
// for paths, alarm-leaning for errors. Greens/yellows are kept for legacy CLI
// signal-fidelity (success markers, warnings) but tuned to feel native on
// the void canvas instead of a generic terminal palette.

const ANSI_FG: Record<number, string> = {
  30: "#4D4D52", // black (terminal-bg-tinted)
  31: "#FF6B5A", // red — errors / failures (alarm-leaning)
  32: "#7BD9C4", // green — success markers (cyan-leaning, native to Composio)
  33: "#E5C07B", // yellow — warnings
  34: "#0089FF", // blue — paths / URLs (signal-blue)
  35: "#C678DD", // magenta
  36: "#00FFFF", // cyan — info (Electric Cyan)
  37: "#FFFFFF", // white (default fg)
  90: "rgb(255 255 255 / 0.40)", // bright black / gray — spinners, dim text
  91: "#FF8B7E",
  92: "#A0EBD4",
  93: "#F0CD8E",
  94: "#5BAEFF",
  95: "#D7A0E5",
  96: "#7DCCD7",
  97: "#FFFFFF",
};

const ESC = "";
const ANSI_RE = /\[([0-9;]+)m|\[\?[0-9]+[hl]/g;

interface SgrState {
  fg: string | null;
  bold: boolean;
}

function applyCodes(state: SgrState, codes: number[]): SgrState {
  let next = { ...state };
  for (const code of codes) {
    if (code === 0) {
      next = { fg: null, bold: false };
    } else if (code === 1) {
      next.bold = true;
    } else if (code === 22) {
      next.bold = false;
    } else if (code === 39) {
      next.fg = null;
    } else if (ANSI_FG[code]) {
      next.fg = ANSI_FG[code];
    }
  }
  return next;
}

function styleFor(state: SgrState): React.CSSProperties | undefined {
  if (!state.fg && !state.bold) return undefined;
  return {
    color: state.fg ?? undefined,
    fontWeight: state.bold ? 600 : undefined,
  };
}

/**
 * Parse one line of text containing ANSI escape sequences into an array of
 * colored React spans. Cursor-control sequences (`[?25l` / `[?25h` etc) are
 * stripped silently — they're terminal noise that has no meaning in a web
 * scrollback and would otherwise show as unprintable garbage.
 */
function ansiToReact(text: string): ReactNode {
  if (!text.includes(ESC)) {
    // Fast path — no escape codes in this line.
    return text;
  }
  const out: ReactNode[] = [];
  let cursor = 0;
  let state: SgrState = { fg: null, bold: false };
  let key = 0;
  ANSI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANSI_RE.exec(text)) !== null) {
    if (match.index > cursor) {
      const chunk = text.slice(cursor, match.index);
      out.push(
        <span key={key++} style={styleFor(state)}>
          {chunk}
        </span>
      );
    }
    if (match[1] !== undefined) {
      const codes = match[1].split(";").map((s) => parseInt(s, 10) || 0);
      state = applyCodes(state, codes);
    }
    cursor = ANSI_RE.lastIndex;
  }
  if (cursor < text.length) {
    out.push(
      <span key={key++} style={styleFor(state)}>
        {text.slice(cursor)}
      </span>
    );
  }
  return <>{out}</>;
}
