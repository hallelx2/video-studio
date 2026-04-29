import { useState } from "react";
import { cn } from "../../lib/cn.js";
import type { PendingPrompt } from "../../lib/agent-state.js";

/**
 * Sticky in-place approval banner that appears under the StageRibbon
 * whenever the agent has a pending prompt. Lets the user respond
 * directly from the main pane — no modal popping over the canvas, no
 * scrolling away to find the InlineApproval card buried in the
 * activity stream.
 *
 * For complex approvals (script edits, per-aspect previews) the user
 * can still click "more options →" to open the full DetailsModal which
 * mounts the rich src/components/agent/InlineApproval card. This
 * banner just covers the common case: approve, revise (with a quick
 * note), or cancel.
 *
 * Visually loud on first appearance (cyan halo via animate-halo) then
 * settles into a quieter state. Sticky so it stays visible even as the
 * user scrolls SceneStrip or canvas content.
 */
export function StageInlineApproval({
  prompt,
  onRespond,
  onOpenDetails,
}: {
  prompt: PendingPrompt;
  onRespond: (response: string) => Promise<void>;
  onOpenDetails: () => void;
}) {
  const [reviseText, setReviseText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handle = async (response: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onRespond(response);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-label="Approval needed"
      className={cn(
        "sticky top-0 z-20 border-b border-cyan/30 bg-cyan/8 px-6 py-3 backdrop-blur-sm",
        "animate-halo"
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan">
            approval needed
          </p>
          <p
            className="mt-1 truncate font-display text-sm text-fg"
            title={prompt.question}
          >
            {prompt.question}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <button
            onClick={() => handle("approve")}
            disabled={submitting}
            className="border border-cyan/50 bg-cyan/12 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-50"
          >
            ✓ approve
          </button>
          <button
            onClick={onOpenDetails}
            className="font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
          >
            more options →
          </button>
          <button
            onClick={() => handle("cancel")}
            disabled={submitting}
            className="font-mono text-[10px] uppercase tracking-widest text-alarm hover:underline"
          >
            cancel
          </button>
        </div>
      </div>

      {/* Lightweight revise input — type a note + Enter to submit it as
          the response. Doesn't replace the rich InlineApproval card
          (which lets the user edit per-scene narration); for that, the
          "more options →" button opens the full modal. */}
      <div className="mt-2 flex items-baseline gap-2">
        <input
          type="text"
          value={reviseText}
          onChange={(e) => setReviseText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && reviseText.trim() && !submitting) {
              const note = reviseText.trim();
              setReviseText("");
              void handle(note);
            }
          }}
          placeholder="quick revision note (Enter to submit)…"
          disabled={submitting}
          className="hairline flex-1 border bg-void px-2 py-1 font-mono text-[11px] text-fg placeholder:text-fg-faint focus:border-cyan/40 focus:outline-none"
        />
      </div>
    </div>
  );
}
