import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import type { Artifact, RunStatus } from "../../lib/agent-state.js";
import { ModelPicker } from "./ModelPicker.js";
import { SlashCommandMenu } from "./SlashCommandMenu.js";
import {
  filterCommands,
  parseSlashInput,
  type CommandHandlers,
  type SlashCommand,
} from "./slash-commands.js";

/**
 * Chat composer — shadcn-style refined, no aggressive border colors.
 *
 *   ┌───────────────────────────────────────────────────────────┐
 *   │ [Claude Opus 4.7 ▼]                                       │
 *   │                                                           │
 *   │ <textarea — type here…>                                   │
 *   │                                                           │
 *   │ hint                                  ⌘⏎ send  [send →]   │
 *   └───────────────────────────────────────────────────────────┘
 *
 * State-aware behavior (placeholder + send semantics):
 *   idle / complete   → submit starts a fresh run
 *   running           → submit interrupts and restarts with combined brief
 *   awaiting_input    → submit becomes revision notes for the pending prompt
 *   error             → submit starts a fresh run
 *
 * Stop button shows next to send while running. ⌘⏎ submits, ⌘. stops.
 */

export type ComposerMode = "brief" | "interrupt" | "revision" | "follow-up";

interface ComposerProps {
  status: RunStatus;
  hasPendingPrompt: boolean;
  hasHistory: boolean;
  modelId: string;
  artifacts: Artifact[];
  onModelChange: (id: string) => void;
  onSubmit: (text: string) => void | Promise<void>;
  onStop: () => void | Promise<void>;
  projectName: string;
  /** Handlers for slash commands. Provided by Workbench. */
  slashHandlers: CommandHandlers;
}

export function Composer(props: ComposerProps) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mode = deriveMode(props.status, props.hasPendingPrompt, props.hasHistory);
  const placeholder = placeholderFor(mode, props.projectName);
  const hint = hintFor(mode);

  // ─── Slash command detection ────────────────────────────────────────
  const slashParse = useMemo(() => parseSlashInput(value), [value]);
  const slashCtx = useMemo(
    () => ({
      status: props.status,
      hasPendingPrompt: props.hasPendingPrompt,
      hasHistory: props.hasHistory,
      artifacts: props.artifacts,
      hasComposition: props.artifacts.some((a) => a.kind === "composition"),
    }),
    [props.status, props.hasPendingPrompt, props.hasHistory, props.artifacts]
  );
  const slashMatches = useMemo(
    () => (slashParse ? filterCommands(slashParse.name, slashCtx) : []),
    [slashParse, slashCtx]
  );
  const slashOpen = slashParse !== null;

  // Reset highlight when the match list changes shape.
  useEffect(() => {
    setSlashIndex(0);
  }, [slashMatches.length, slashParse?.name]);

  const executeSlashCommand = (cmd: SlashCommand) => {
    const args = slashParse?.args ?? "";
    setValue("");
    void cmd.execute(args, slashCtx, props.slashHandlers);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // Auto-grow up to ~6 rows.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 6 * 24)}px`;
  }, [value]);

  const canSubmit = value.trim().length > 0 && !submitting;
  const showStop = props.status === "running" || props.status === "awaiting_input";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const text = value.trim();
    setSubmitting(true);
    try {
      setValue("");
      await props.onSubmit(text);
    } finally {
      setSubmitting(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // While the slash menu is open, intercept nav keys.
    if (slashOpen && slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, slashMatches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        executeSlashCommand(slashMatches[slashIndex]);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        executeSlashCommand(slashMatches[slashIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setValue("");
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ".") {
      e.preventDefault();
      if (showStop) props.onStop();
    }
  };

  return (
    <div className="relative bg-ink px-10 pb-5 pt-3">
      {/* Slash command palette — pops up when the user starts a / command */}
      {slashOpen && (
        <div className="absolute inset-x-10 bottom-full -translate-y-1">
          <SlashCommandMenu
            commands={slashMatches}
            activeIndex={slashIndex}
            onSelect={executeSlashCommand}
            onHover={setSlashIndex}
            onClose={() => setValue("")}
          />
        </div>
      )}

      {/* shadcn-style: single neutral border, soft ring on focus, no mode-tinted color */}
      <div
        className={cn(
          "rounded-2xl border bg-ink-raised transition-colors",
          focused
            ? "border-paper-mute/30 ring-2 ring-paper-mute/10"
            : "border-paper-mute/15 hover:border-paper-mute/25"
        )}
      >
        {/* Top row: model picker (and any future toolbar items) */}
        <div className="flex items-center justify-between border-b border-paper-mute/10 px-4 py-2.5">
          <ModelPicker modelId={props.modelId} onChange={props.onModelChange} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/60">
            {modeLabel(mode)}
          </span>
        </div>

        {/* Textarea */}
        <div className="px-5 py-3.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            rows={1}
            disabled={submitting}
            className={cn(
              "block w-full resize-none bg-transparent font-sans text-base leading-relaxed text-paper placeholder:text-paper-mute/55 focus:outline-none",
              "min-h-[24px]"
            )}
          />
        </div>

        {/* Bottom row: hint on the left, actions on the right */}
        <div className="flex items-center justify-between gap-4 border-t border-paper-mute/10 px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/65">
            {hint}
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/45">
              ⌘⏎
            </span>
            {showStop && (
              <button
                onClick={() => props.onStop()}
                className="rounded-md border border-paper-mute/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:border-paper-mute/30 hover:text-paper"
                title="Stop the agent (⌘.)"
              >
                stop
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                canSubmit
                  ? "bg-paper text-ink hover:bg-paper/90"
                  : "cursor-not-allowed bg-paper-mute/10 text-paper-mute/40"
              )}
            >
              {submitButtonLabel(mode)}
            </button>
          </div>
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

function modeLabel(mode: ComposerMode): string {
  switch (mode) {
    case "brief":
      return "new brief";
    case "interrupt":
      return "interrupt";
    case "revision":
      return "revision";
    case "follow-up":
      return "follow-up";
  }
}

function submitButtonLabel(mode: ComposerMode): string {
  switch (mode) {
    case "brief":
      return "send";
    case "interrupt":
      return "interrupt";
    case "revision":
      return "revise";
    case "follow-up":
      return "send";
  }
}
