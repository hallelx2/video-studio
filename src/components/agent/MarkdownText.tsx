import { useMemo, type ReactNode } from "react";
import { cn } from "../../lib/cn.js";

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
 * output: paragraphs, bullet/numbered lists, **bold**, *italic*, `code`,
 * [link](url). Skips fancy block markdown (headers, blockquotes, tables,
 * fenced code) — when the agent wants those, the ToolCallCard's code
 * block already covers it.
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
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseBlocks(input: string): ParsedBlock[] {
  const lines = input.split(/\r?\n/);
  const blocks: ParsedBlock[] = [];
  let para: string[] = [];
  let listItems: string[] | null = null;
  let listKind: "ul" | "ol" | null = null;

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

  for (const raw of lines) {
    const line = raw.trim();

    // Blank line ends any current block.
    if (line === "") {
      flushPara();
      flushList();
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
  return blocks;
}

// ─── Block rendering ──────────────────────────────────────────────────────

function Block({ block }: { block: ParsedBlock }) {
  if (block.kind === "p") {
    return <p className="leading-relaxed">{renderInline(block.text)}</p>;
  }
  if (block.kind === "ul") {
    return (
      <ul className="ml-1 list-none space-y-1.5">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-3 leading-relaxed">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brass" aria-hidden />
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ol className="ml-1 list-none space-y-1.5">
      {block.items.map((item, i) => (
        <li key={i} className="flex gap-3 leading-relaxed">
          <span className="shrink-0 font-mono text-[11px] tabular text-brass">
            {String(i + 1).padStart(2, "0")}.
          </span>
          <span>{renderInline(item)}</span>
        </li>
      ))}
    </ol>
  );
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
          <strong key={key++} className="font-semibold not-italic text-paper">
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
            className="rounded border border-paper-mute/15 bg-ink-edge px-1 py-0.5 font-mono text-[0.85em] not-italic text-paper"
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
            className="border-b border-cinnabar/60 not-italic text-cinnabar transition-colors hover:text-paper"
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
