import { useState } from "react";
import { Brain, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn.js";
import type { TextActivity } from "../../lib/agent-state.js";
import { MarkdownText } from "./MarkdownText.js";
import { StreamRow, RowLabel } from "./StreamRow.js";

/**
 * Folded inter-tool agent text — the "thought line" of the trace.
 *
 *   ◯ THOUGHT  Skimming the README for tone, then drafting…   ▸
 *
 * Short reasoning glue between tool calls collapses to a single dim line so
 * the stream stays skimmable. Click the row to expand into the full markdown
 * thought, italicized in muted text so it remains visually subordinate to
 * the agent's substantive output (which uses TextCard).
 */
export function ReasoningCard({ activity }: { activity: TextActivity }) {
  const [open, setOpen] = useState(false);
  const preview = takePreview(activity.text, 140);

  return (
    <article className="min-w-0">
      <StreamRow
        tone="reasoning"
        icon={<Brain className="h-3.5 w-3.5" strokeWidth={1.75} />}
        expanded={open}
        onClick={() => setOpen((v) => !v)}
        ariaLabel={open ? "Collapse thought" : "Expand thought"}
        header={
          <span className="flex min-w-0 items-baseline gap-2.5">
            <RowLabel tone="muted">thought</RowLabel>
            {!open && (
              <span className="min-w-0 flex-1 truncate text-[12.5px] italic text-fg-muted">
                {preview}
              </span>
            )}
          </span>
        }
        status={
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-fg-muted/70 transition-transform duration-200",
              open && "rotate-90 text-fg"
            )}
            strokeWidth={2}
            aria-hidden
          />
        }
      >
        {open ? (
          <div className="enter-rise mt-1">
            <MarkdownText
              text={activity.text}
              className="max-w-3xl text-[13px] italic leading-relaxed text-fg-muted"
            />
          </div>
        ) : (
          <span className="sr-only">Reasoning collapsed</span>
        )}
      </StreamRow>
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
