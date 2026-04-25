/**
 * Slash command registry for the composer.
 *
 * Type `/` at the start of the composer input and a filtered palette pops up.
 * Each command knows when it's relevant (so /approve only shows when a prompt
 * is pending, /preview only when a composition exists, etc.) and what to do
 * when selected.
 *
 * The actual execution lives in Workbench — this file just defines the
 * registry shape and the canonical command list.
 */

import type { Artifact, RunStatus } from "../../lib/agent-state.js";

export interface CommandContext {
  status: RunStatus;
  hasPendingPrompt: boolean;
  artifacts: Artifact[];
  hasComposition: boolean;
  hasHistory: boolean;
}

export interface CommandHandlers {
  onHelp: () => void;
  onNewSession: () => void;
  onClear: () => void;
  onStop: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onPreview: () => void;
  onSwitchModel: (modelHint: string) => void;
}

export interface SlashCommand {
  name: string;
  /** Aliases that also match this command (no leading slash). */
  aliases?: string[];
  description: string;
  /** Optional one-line hint shown to the right of the description. */
  hint?: string;
  /** Hide command unless this returns true for the current context. */
  visible?: (ctx: CommandContext) => boolean;
  /** What to do when the user picks this command. */
  execute: (args: string, ctx: CommandContext, handlers: CommandHandlers) => void | Promise<void>;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "help",
    aliases: ["?"],
    description: "Show available commands",
    hint: "?",
    execute: (_args, _ctx, h) => h.onHelp(),
  },
  {
    name: "new",
    aliases: ["session", "n"],
    description: "Start a new session",
    hint: "⌘N",
    execute: (_args, _ctx, h) => h.onNewSession(),
  },
  {
    name: "clear",
    description: "Clear this session's events (keeps the session itself)",
    visible: (ctx) => ctx.hasHistory,
    execute: (_args, _ctx, h) => h.onClear(),
  },
  {
    name: "stop",
    aliases: ["abort", "kill"],
    description: "Stop the running agent",
    hint: "⌘.",
    visible: (ctx) => ctx.status === "running" || ctx.status === "awaiting_input",
    execute: (_args, _ctx, h) => h.onStop(),
  },
  {
    name: "approve",
    aliases: ["yes", "ok"],
    description: "Approve the current pending prompt",
    visible: (ctx) => ctx.hasPendingPrompt,
    execute: (_args, _ctx, h) => h.onApprove(),
  },
  {
    name: "cancel",
    aliases: ["no", "deny"],
    description: "Decline the current pending prompt",
    visible: (ctx) => ctx.hasPendingPrompt,
    execute: (_args, _ctx, h) => h.onCancel(),
  },
  {
    name: "preview",
    description: "Launch the HyperFrames dev server for the latest composition",
    visible: (ctx) => ctx.hasComposition,
    execute: (_args, _ctx, h) => h.onPreview(),
  },
  {
    name: "model",
    description: "Switch the active Claude model · /model opus, /model sonnet, /model haiku",
    execute: (args, _ctx, h) => h.onSwitchModel(args.trim().toLowerCase()),
  },
];

/**
 * Parse a composer value to detect a slash command in progress.
 * Returns null if the value isn't a slash command, otherwise returns the
 * partial command name + any args after the first space.
 *
 * Cases:
 *   "/help"           → { name: "help", args: "" }
 *   "/model opus"     → { name: "model", args: "opus" }
 *   "/he"             → { name: "he",   args: "" }   (filter while typing)
 *   "/"               → { name: "",     args: "" }   (show all)
 *   "hello /thing"    → null (only matches at start)
 *   "  /help"         → null (whitespace before / disqualifies)
 */
export function parseSlashInput(value: string): { name: string; args: string } | null {
  if (!value.startsWith("/")) return null;
  const body = value.slice(1);
  const spaceIdx = body.indexOf(" ");
  if (spaceIdx === -1) {
    return { name: body, args: "" };
  }
  return { name: body.slice(0, spaceIdx), args: body.slice(spaceIdx + 1) };
}

export function findCommand(name: string): SlashCommand | undefined {
  const lower = name.toLowerCase();
  return SLASH_COMMANDS.find(
    (c) => c.name === lower || (c.aliases && c.aliases.includes(lower))
  );
}

export function filterCommands(query: string, ctx: CommandContext): SlashCommand[] {
  const lower = query.toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.visible && !cmd.visible(ctx)) return false;
    if (!lower) return true;
    if (cmd.name.startsWith(lower)) return true;
    if (cmd.aliases?.some((a) => a.startsWith(lower))) return true;
    if (cmd.description.toLowerCase().includes(lower)) return true;
    return false;
  });
}
