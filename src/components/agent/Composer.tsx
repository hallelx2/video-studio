import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import type { RunStatus } from "../../lib/agent-state.js";

/**
 * Chat-style composer at the bottom of the workbench. State-aware — the
 * placeholder, hint, and submit semantics change based on what the agent is
 * doing. Always visible. Always available to interrupt.
 *
 * Behaviors:
 *   idle / complete         submit → start a new run with the typed brief
 *   running (no prompt)     submit → cancel current run, restart with combined brief
 *   awaiting_input          submit → respond to the pending prompt as revision notes
 *   error                   submit → start a fresh run
 *
 * Stop button always visible while running. ⌘⏎ submits.
 */

export type ComposerMode = "brief" | "interrupt" | "revision" | "follow-up";

interface ComposerProps {
  status: RunStatus;
  hasPendingPrompt: boolean;
  /** Has the user run anything yet in this workbench session? */
  hasHistory: boolean;
  onSubmit: (text: string) => void | Promise<void>;
  onStop: () => void | Promise<void>;
  /** Project name used in the placeholder copy. */
  projectName: string;
}

export function Composer(props: ComposerProps) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mode = deriveMode(props.status, props.hasPendingPrompt, props.hasHistory);
  const placeholder = placeholderFor(mode, props.projectName);
  const hint = hintFor(mode);

  // Auto-grow the textarea up to ~6 rows.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 6 * 24)}px`;
  }, [value]);

  const canSubmit = value.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const text = value.trim();
    setSubmitting(true);
    try {
      setValue("");
      await props.onSubmit(text);
    } finally {
      setSubmitting(false);
      // Re-focus so the user can keep typing.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      return;
    }
    // ⌘. or Ctrl+. cancels a running agent (terminal convention).
    if ((e.metaKey || e.ctrlKey) && e.key === ".") {
      e.preventDefault();
      if (props.status === "running" || props.status === "awaiting_input") {
        props.onStop();
      }
    }
  };

  const showStop = props.status === "running" || props.status === "awaiting_input";

  return (
    <div className="hairline border-t bg-ink">
      <div className="flex items-end gap-4 px-12 py-4">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={submitting}
            className={cn(
              "block w-full resize-none bg-transparent font-sans text-base leading-relaxed text-paper placeholder:text-paper-mute/60 focus:outline-none",
              "min-h-[24px]"
            )}
          />
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/70">
              {hint}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/50">
              ⌘⏎ send
              {showStop && <span className="ml-3">⌘. stop</span>}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-6 self-start pt-1">
          {showStop && (
            <button
              onClick={() => props.onStop()}
              className="font-mono text-[10px] uppercase tracking-widest text-alarm transition-colors hover:text-paper"
              title="Stop the agent (⌘.)"
            >
              stop
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "border-b pb-1 text-sm font-medium transition-colors",
              canSubmit
                ? "border-cinnabar text-cinnabar hover:text-paper"
                : "cursor-not-allowed border-paper-mute/30 text-paper-mute/40"
            )}
          >
            {submitButtonLabel(mode)}
          </button>
        </div>
      </div>
    </div>
  );
}

function deriveMode(status: RunStatus, hasPendingPrompt: boolean, hasHistory: boolean): ComposerMode {
  if (hasPendingPrompt) return "revision";
  if (status === "running") return "interrupt";
  if (status === "complete" || status === "error") return "follow-up";
  if (hasHistory) return "follow-up";
  return "brief";
}

function placeholderFor(mode: ComposerMode, project: string): string {
  switch (mode) {
    case "brief":
      return `What video should we make for ${project}? (e.g. "60s hackathon demo, lean into speed")`;
    case "interrupt":
      return "Interrupt with a new instruction…";
    case "revision":
      return "Type to request changes — or click approve above.";
    case "follow-up":
      return `Anything else? (e.g. "now make a YouTube short", "re-render at 60fps")`;
  }
}

function hintFor(mode: ComposerMode): string {
  switch (mode) {
    case "brief":
      return "send to start the agent";
    case "interrupt":
      return "send will stop the current run and restart with combined context";
    case "revision":
      return "send will become revision notes for the current draft";
    case "follow-up":
      return "send to start the next run";
  }
}

function submitButtonLabel(mode: ComposerMode): string {
  switch (mode) {
    case "brief":
      return "send →";
    case "interrupt":
      return "interrupt →";
    case "revision":
      return "revise →";
    case "follow-up":
      return "send →";
  }
}
