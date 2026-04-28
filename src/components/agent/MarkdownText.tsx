import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { tryRenderStatePayload } from "./StatePayload.js";

/**
 * Tiny markdown renderer for agent prose. The agent often emits text like:
 *
 *   "Found a sub-100ms recall claim in **IMPROVEMENTS.md**. I'll use it
 *    as the hook. Drafting now — three things to lock in:
 *
 *    - elevator pitch
 *    - speed claim
 *    - one screenshot reference"
 *
 * Without this it renders as literal asterisks and dashes. Hand-rolled
 * (no dependency) — handles the cases that actually show up in agent
 * output:
 *   - paragraphs with graceful long-URL wrapping
 *   - bullet / numbered lists
 *   - **bold** · *italic* · `inline code` · [link](url)
 *   - ``` fenced code blocks ``` with language label + copy button
 *   - JSON-shaped paragraphs auto-detected and rendered as syntax-highlighted
 *     code blocks (so the agent's verbose result-dumps stop breaking the page)
 *
 * Skips fancy block markdown (headers, blockquotes, tables) — when the agent
 * wants those, the ToolCallCard's artifact panel already covers it.
 */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

// ─── Block parsing ────────────────────────────────────────────────────────

type ParsedBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; content: string; language: string | null }
  // JSON we successfully parsed. We keep the parsed value so the renderer
  // can try a rich state-payload component (progress bar, result card, …)
  // before falling back to a generic JSON code block.
  | { kind: "json"; raw: string; value: unknown };

function parseBlocks(input: string): ParsedBlock[] {
  const lines = input.split(/\r?\n/);
  const blocks: ParsedBlock[] = [];
  let para: string[] = [];
  let listItems: string[] | null = null;
  let listKind: "ul" | "ol" | null = null;
  // Code-fence state. We parse fences at the line level (``` opens,
  // matching ``` closes) before any other block detection.
  let inFence = false;
  let fenceLang: string | null = null;
  let fenceLines: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push({ kind: "p", text: para.join(" ").trim() });
    para = [];
  };
  const flushList = () => {
    if (!listItems || !listKind) return;
    blocks.push({ kind: listKind, items: listItems });
    listItems = null;
    listKind = null;
  };
  const flushFence = () => {
    blocks.push({
      kind: "code",
      content: fenceLines.join("\n"),
      language: fenceLang,
    });
    inFence = false;
    fenceLang = null;
    fenceLines = [];
  };

  for (const raw of lines) {
    // Inside a fence — collect lines verbatim until the closing ```. Don't
    // trim or interpret list markers; whitespace is meaningful in code.
    if (inFence) {
      if (/^\s*```\s*$/.test(raw)) {
        flushFence();
        continue;
      }
      fenceLines.push(raw);
      continue;
    }

    // Detect fence open: ```lang or ```
    const fenceOpen = /^\s*```([A-Za-z0-9_+-]+)?\s*$/.exec(raw);
    if (fenceOpen) {
      flushPara();
      flushList();
      inFence = true;
      fenceLang = fenceOpen[1] ?? null;
      continue;
    }

    const line = raw.trim();

    // Blank line ends any current block.
    if (line === "") {
      flushPara();
      flushList();
      continue;
    }

    // ATX-style headers: 1–4 leading hashes. Detected before lists/paras so
    // the agent's `## Failure review` style summaries render as documents
    // instead of bleeding into a paragraph.
    const heading = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({
        kind: "h",
        level: heading[1].length as 1 | 2 | 3 | 4,
        text: heading[2],
      });
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+\.\s+(.+)$/.exec(line);

    if (bullet) {
      flushPara();
      if (listKind && listKind !== "ul") flushList();
      listKind = "ul";
      listItems = listItems ?? [];
      listItems.push(bullet[1]);
      continue;
    }
    if (numbered) {
      flushPara();
      if (listKind && listKind !== "ol") flushList();
      listKind = "ol";
      listItems = listItems ?? [];
      listItems.push(numbered[1]);
      continue;
    }

    // Regular paragraph line — close any open list, append.
    flushList();
    para.push(line);
  }

  flushPara();
  flushList();
  // Defensive: close any unterminated fence so we don't drop content.
  if (inFence) flushFence();

  // Post-process: if a paragraph is shaped like JSON ({…} or […]) and parses
  // cleanly, lift it into a `json` block. The renderer will then try the
  // rich state-payload component first (progress bars, success cards, etc.)
  // and fall back to a syntax-highlighted code block if the JSON shape isn't
  // a recognised state.
  return blocks.map((b) => {
    if (b.kind === "p") {
      const json = tryParseJson(b.text);
      if (json !== undefined) {
        return { kind: "json", raw: prettifyJson(json), value: json };
      }
    }
    return b;
  });
}

function tryParseJson(text: string): unknown | undefined {
  const t = text.trim();
  if (t.length < 4) return undefined;
  const first = t[0];
  const last = t[t.length - 1];
  if (!((first === "{" && last === "}") || (first === "[" && last === "]"))) {
    return undefined;
  }
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

function prettifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ─── Block rendering ──────────────────────────────────────────────────────

function Block({ block }: { block: ParsedBlock }) {
  if (block.kind === "h") {
    const text = renderInline(block.text);
    if (block.level === 1) {
      return (
        <h1 className="display-sm mt-2 text-[18px] font-semibold tracking-tight text-fg [overflow-wrap:anywhere]">
          {text}
        </h1>
      );
    }
    if (block.level === 2) {
      return (
        <h2 className="mt-2 text-[15px] font-semibold tracking-tight text-fg [overflow-wrap:anywhere]">
          {text}
        </h2>
      );
    }
    if (block.level === 3) {
      return (
        <h3 className="mt-1 text-[13.5px] font-semibold tracking-tight text-fg [overflow-wrap:anywhere]">
          {text}
        </h3>
      );
    }
    return (
      <h4 className="mt-1 font-mono text-[10.5px] uppercase tracking-widest text-cyan [overflow-wrap:anywhere]">
        {text}
      </h4>
    );
  }
  if (block.kind === "p") {
    // overflow-wrap: anywhere lets long paths and URLs break at any point
    // instead of forcing the row to expand or wrapping mid-syllable.
    return (
      <p className="leading-relaxed [overflow-wrap:anywhere]">{renderInline(block.text)}</p>
    );
  }
  if (block.kind === "ul") {
    return (
      <ul className="ml-1 list-none space-y-1.5">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-3 leading-relaxed [overflow-wrap:anywhere]">
            <span
              className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fg-faint"
              aria-hidden
            />
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (block.kind === "ol") {
    return (
      <ol className="ml-1 list-none space-y-1.5">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-3 leading-relaxed [overflow-wrap:anywhere]">
            <span className="shrink-0 font-mono text-[11px] tabular text-fg-faint">
              {String(i + 1).padStart(2, "0")}.
            </span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (block.kind === "json") {
    // Try the rich state renderer first — recognises {type:"progress"} and
    // {type:"result"} shapes and renders them as proper state cards. If the
    // JSON isn't a recognised state shape, fall back to the generic code
    // block so the user can still read and copy the raw payload.
    const rich = tryRenderStatePayload(block.value, block.raw);
    if (rich) return <>{rich}</>;
    return (
      <CodeBlockBlock
        block={{ kind: "code", content: block.raw, language: "json" }}
      />
    );
  }
  return <CodeBlockBlock block={block} />;
}

// ─── Code block ──────────────────────────────────────────────────────────
// Renders a fenced or auto-detected code block with a refined frame: a
// header strip carrying the language label + copy button, and a scrollable
// monospace body. JSON gets simple syntax-highlighting so the eye can scan
// keys/values/numbers at a glance.

function CodeBlockBlock({
  block,
}: {
  block: { kind: "code"; content: string; language: string | null };
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard
      ?.writeText(block.content)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {
        // Silently ignore — the user can still select+copy manually.
      });
  };

  const lineCount = block.content.split("\n").length;

  return (
    <div className="overflow-hidden rounded border border-mist-10 bg-surface">
      {/* Header strip — language + line count on the left, copy on the right. */}
      <div className="flex items-center justify-between gap-3 border-b border-mist-08 bg-void/40 px-3 py-2">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
            {block.language ?? "code"}
          </span>
          <span className="font-mono text-[10px] tabular text-fg-muted/60">
            · {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
        </div>
        <button
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
            copied
              ? "border-cyan/40 bg-cyan/[0.06] text-cyan"
              : "border-mist-08 text-fg-muted hover:border-mist-12 hover:bg-mist-04 hover:text-fg"
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" strokeWidth={2} aria-hidden />
              copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              copy
            </>
          )}
        </button>
      </div>

      {/* Body — generous padding, comfortable leading. Horizontal scroll for
          lines wider than the column; vertical scroll past max-h. */}
      <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-fg/85 whitespace-pre">
        {block.language === "json" ? highlightJson(block.content) : block.content}
      </pre>
    </div>
  );
}

// ─── Tiny JSON syntax highlighter ────────────────────────────────────────
// Single-pass regex tokenizer. Scans for, in priority order: a string
// followed by `:` (object key), a plain string, a number, a boolean / null,
// or punctuation. Anything not matched stays unstyled (whitespace).
//
// Color choices map to the Composio palette:
//   - keys      → fg (white)
//   - strings   → cyan        (the "data is here" tone)
//   - numbers   → signal blue (cool, distinct from cyan)
//   - bool/null → ocean       (slightly warmer blue, marks atomics)
//   - punct     → fg-muted    (receded — frame, not content)

const JSON_TOKEN_RE =
  /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;

function highlightJson(text: string): ReactNode {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  // Reset before iterating — exec() with /g maintains state across calls.
  JSON_TOKEN_RE.lastIndex = 0;

  while ((match = JSON_TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const [, keyStr, colon, str, num, kw, punct] = match;
    if (keyStr) {
      out.push(
        <span key={key++} className="text-fg">
          {keyStr}
        </span>
      );
      out.push(
        <span key={key++} className="text-fg-muted">
          {colon}
        </span>
      );
    } else if (str) {
      out.push(
        <span key={key++} className="text-cyan">
          {str}
        </span>
      );
    } else if (num) {
      out.push(
        <span key={key++} className="text-signal">
          {num}
        </span>
      );
    } else if (kw) {
      out.push(
        <span key={key++} className="text-ocean">
          {kw}
        </span>
      );
    } else if (punct) {
      out.push(
        <span key={key++} className="text-fg-muted/60">
          {punct}
        </span>
      );
    }
    lastIndex = JSON_TOKEN_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }
  return out;
}

// ─── Inline emphasis / code / links ───────────────────────────────────────
// Process the text linearly, finding the earliest opening token at each step.

interface InlineToken {
  kind: "bold" | "italic" | "code" | "link";
  start: number;
  end: number;
  /** content slice (between the markers) */
  inner: string;
  /** href, only for "link" */
  href?: string;
}

const INLINE_PATTERNS: Array<{
  kind: InlineToken["kind"];
  re: RegExp;
}> = [
  // **bold** — must come before single-* italic so we don't false-match
  { kind: "bold", re: /\*\*([^*\n]+?)\*\*/ },
  // `code`
  { kind: "code", re: /`([^`\n]+?)`/ },
  // [text](url)
  { kind: "link", re: /\[([^\]\n]+?)\]\(([^)\n]+?)\)/ },
  // *italic* — last so ** doesn't accidentally match
  { kind: "italic", re: /(?<![*\w])\*([^*\n]+?)\*(?![*\w])/ },
];

function nextToken(text: string): InlineToken | null {
  let earliest: InlineToken | null = null;
  for (const { kind, re } of INLINE_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const start = match.index;
    const end = start + match[0].length;
    const candidate: InlineToken =
      kind === "link"
        ? { kind, start, end, inner: match[1], href: match[2] }
        : { kind, start, end, inner: match[1] };
    if (!earliest || candidate.start < earliest.start) {
      earliest = candidate;
    }
  }
  return earliest;
}

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const token = nextToken(remaining);
    if (!token) {
      out.push(remaining);
      break;
    }
    if (token.start > 0) {
      out.push(remaining.slice(0, token.start));
    }
    switch (token.kind) {
      case "bold":
        out.push(
          <strong key={key++} className="font-semibold not-italic text-fg">
            {renderInline(token.inner)}
          </strong>
        );
        break;
      case "italic":
        out.push(
          <em key={key++} className="italic">
            {token.inner}
          </em>
        );
        break;
      case "code":
        out.push(
          <code
            key={key++}
            className="rounded border border-mist-10 bg-elevated/60 px-1.5 py-0.5 font-mono text-[0.85em] not-italic text-fg"
          >
            {token.inner}
          </code>
        );
        break;
      case "link":
        out.push(
          <a
            key={key++}
            href={token.href}
            onClick={(e) => {
              // Open external links in the user's default browser via the
              // bridge instead of navigating the renderer (which would
              // break the Electron window).
              e.preventDefault();
              if (token.href) {
                void window.studio?.shell?.openExternal?.(token.href);
              }
            }}
            className="border-b border-cyan/60 not-italic text-cyan transition-colors hover:text-fg"
          >
            {token.inner}
          </a>
        );
        break;
    }
    remaining = remaining.slice(token.end);
  }

  return out;
}
