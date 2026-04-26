import { useEffect, useRef } from "react";
import { cn } from "../../lib/cn.js";
import type { SlashCommand } from "./slash-commands.js";

/**
 * Floating command palette that hangs above the composer when the user
 * starts a slash command. Pure presentation — keyboard navigation lives
 * in the Composer itself (which owns focus), this component just renders.
 */
export function SlashCommandMenu({
  commands,
  activeIndex,
  onSelect,
  onHover,
  onClose,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // Auto-scroll the active item into view as the user arrows up/down.
  useEffect(() => {
    const node = listRef.current?.children?.[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (commands.length === 0) {
    return (
      <div
        role="dialog"
        className={cn(
          "absolute bottom-full left-0 right-0 z-30 mb-2 origin-bottom",
          "rounded-xl border border-paper-mute/15 bg-ink-raised shadow-2xl shadow-ink/80",
          "enter-rise"
        )}
      >
        <p className="px-4 py-4 text-center font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          no matching commands
        </p>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      onMouseLeave={() => undefined}
      className={cn(
        "absolute bottom-full left-0 right-0 z-30 mb-2 max-w-[520px] origin-bottom",
        "rounded-xl border border-paper-mute/15 bg-ink-raised shadow-2xl shadow-ink/80",
        "enter-rise"
      )}
    >
      <header className="flex items-center justify-between border-b border-paper-mute/10 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          commands · {commands.length}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/80">
          ↑↓ nav · ⏎ run · esc close
        </span>
      </header>
      <ul ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
        {commands.map((cmd, i) => {
          const isActive = i === activeIndex;
          return (
            <li key={cmd.name}>
              <button
                type="button"
                onMouseEnter={() => onHover(i)}
                onClick={() => onSelect(cmd)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                  isActive ? "bg-ink-edge" : "hover:bg-ink-edge/60"
                )}
              >
                <span
                  className={cn(
                    "shrink-0 font-mono text-xs",
                    isActive ? "text-cinnabar" : "text-paper-mute"
                  )}
                >
                  /
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm text-paper">
                    {cmd.name}
                    {cmd.aliases && cmd.aliases.length > 0 && (
                      <span className="ml-2 text-[10px] text-paper-mute/85">
                        {cmd.aliases.map((a) => `/${a}`).join("  ")}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate font-sans text-[12px] text-paper-mute">
                    {cmd.description}
                  </span>
                </span>
                {cmd.hint && (
                  <span className="shrink-0 rounded-md border border-paper-mute/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
                    {cmd.hint}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {/* Suppress unused warning; keeping onClose available for future Escape integration */}
      <span data-on-close-noop={typeof onClose} hidden />
    </div>
  );
}
