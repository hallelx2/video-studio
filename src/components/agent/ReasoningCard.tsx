import { useState } from "react";
import { cn } from "../../lib/cn.js";
import type { TextActivity } from "../../lib/agent-state.js";

/**
 * Folded inter-tool agent text — Hypatia pattern. When the agent says a short
 * sentence between two tool calls ("Now I'll read IMPROVEMENTS.md", "That's
 * what I needed; let me draft the script"), it's reasoning glue, not the
 * agent's substantive output. Collapsing it keeps the stream skimmable while
 * preserving the trace for anyone who wants to expand and read it.
 *
 * The full TextCard remains in use for:
 *   - the agent's first text block before any tool calls (preface)
 *   - the agent's last text block after all tool calls (conclusion)
 *   - any text block longer than ~500 chars (substantial output)
 */
export function ReasoningCard({ activity }: { activity: TextActivity }) {
  const [open, setOpen] = useState(false);
  const preview = takePreview(activity.text, 90);

  return (
    <article className="border-l-2 border-l-brass/40 pl-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-baseline gap-3 py-1 text-left transition-colors hover:bg-ink-raised/30"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-brass/80">
          thought
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-sm italic text-paper-mute">
          {open ? activity.text.slice(0, 60) + "…" : preview}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] tabular text-paper-mute/70 transition-transform",
            open && "rotate-90"
          )}
          aria-hidden
        >
          ▸
        </span>
      </button>
      {open && (
        <div className="enter-rise pb-2 pl-0 pr-4 pt-1">
          <p className="max-w-3xl whitespace-pre-wrap font-display text-[14px] italic leading-relaxed text-paper">
            {activity.text}
          </p>
        </div>
      )}
    </article>
  );
}

function takePreview(text: string, maxLen: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  // Cut at a word boundary if possible.
  const slice = oneLine.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.5 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}
