import { useState, type ReactNode } from "react";
import { cn } from "../../lib/cn.js";

/**
 * Render a contiguous run of agent_log lines as one terminal-like block —
 * dark background, mono font, ANSI color codes parsed into colored spans
 * so output from `npx hyperframes tts` / `npx hyperframes preview` /
 * stderr looks like the actual terminal it came from instead of plain
 * scattered rows.
 *
 * Collapsible: shows the last 8 lines by default with a "show all N"
 * expander so a 60-line TTS run doesn't dominate the activity stream.
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
    <article className="hairline overflow-hidden rounded border border-paper-mute/15 bg-[#0E0E10]">
      <header className="flex items-center justify-between gap-3 border-b border-paper-mute/15 bg-[#16161A] px-3 py-1.5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            terminal · {level}
          </span>
          <span className="font-mono text-[10px] tabular text-paper-mute/80">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </span>
        </div>
        {isLong && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-widest text-paper-mute hover:text-paper"
          >
            {expanded ? "collapse ▴" : `show all ${lines.length} ▾`}
          </button>
        )}
      </header>
      {hidden > 0 && (
        <p className="border-b border-paper-mute/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-paper-mute/70">
          {hidden} earlier line{hidden === 1 ? "" : "s"} hidden
        </p>
      )}
      <pre
        className={cn(
          "max-h-72 overflow-auto px-3 py-2 font-mono text-[11px] leading-[1.55] text-[#D4D4D4]",
          // No word-wrap — terminal lines stay on one line and the user
          // scrolls horizontally if a path is too long. Matches what a
          // real terminal does.
          "whitespace-pre"
        )}
      >
        {visible.map((line, i) => (
          <div key={i}>{ansiToReact(line)}</div>
        ))}
      </pre>
    </article>
  );
}

// ─── ANSI escape sequence → React span colors ────────────────────────────
// Minimal SGR (Select Graphic Rendition) parser: handles the colors most
// CLI tools actually emit (foreground 30–37 / 90–97, reset 0/39, bold 1).
// Anything we don't recognise is consumed silently so the text is clean.

const ANSI_FG: Record<number, string> = {
  30: "#4D4D52", // black (terminal-bg-tinted, not full black)
  31: "#FF6B5A", // red — used by errors / failures
  32: "#9CC79B", // green — success markers (Studio running, etc)
  33: "#E5C07B", // yellow — warnings
  34: "#7AA2C5", // blue — paths / URLs
  35: "#C678DD", // magenta
  36: "#56B6C2", // cyan — info
  37: "#D4D4D4", // white (default fg)
  90: "#7B7B82", // bright black / gray — used for spinners + dim text
  91: "#FF8B7E",
  92: "#B6E0B5",
  93: "#F0CD8E",
  94: "#9BBDDA",
  95: "#D7A0E5",
  96: "#7DCCD7",
  97: "#FFFFFF",
};

const ESC = "";
const ANSI_RE = /\[([0-9;]+)m|\[\?[0-9]+[hl]/g;

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
  // Reset the regex so consecutive calls don't share state.
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
      // SGR sequence: e.g. "31;1" → fg red + bold
      const codes = match[1].split(";").map((s) => parseInt(s, 10) || 0);
      state = applyCodes(state, codes);
    }
    // Cursor-control sequences match[0] starts with "[?" — silently
    // dropped (no state change). Either way advance the cursor past them.
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
