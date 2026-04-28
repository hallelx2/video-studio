import { useMemo } from "react";
import { cn } from "../../lib/cn.js";

/**
 * Animated swap between an "active" verb (Reading…) and a "done" verb (Read).
 * The shared prefix doesn't move; only the tail flips so the eye stays anchored.
 *
 * Shimmer support is split: pass a separate `runningClassName` that applies
 * ONLY when active, ONLY to the prefix and active-tail leaf spans. Background-
 * clip:text on a `text-shimmer-*` class is leaf-text-clean — applying it to
 * the inline-flex wrapper let the gradient leak past the text and read as
 * "the whole row is shimmering". Now the gradient hugs the verb only.
 */
export function ToolStatusTitle({
  active,
  activeText,
  doneText,
  className,
  runningClassName,
}: {
  active: boolean;
  activeText: string;
  doneText: string;
  /** Always-applied typography (size, color, weight). Stays on the wrapper. */
  className?: string;
  /** Applied to leaf text spans only when `active=true` (e.g. text-shimmer-cyan). */
  runningClassName?: string;
}) {
  const { prefix, activeTail, doneTail } = useMemo(
    () => splitCommonPrefix(activeText, doneText),
    [activeText, doneText]
  );

  return (
    <span
      data-active={active ? "true" : "false"}
      className={cn("relative inline-flex items-baseline whitespace-pre", className)}
      aria-label={active ? activeText : doneText}
    >
      {prefix && <span className={cn(active && runningClassName)}>{prefix}</span>}
      <span
        className={cn(
          "transition-opacity duration-300 ease-[var(--ease-composio)]",
          active ? "opacity-100" : "absolute -translate-x-px opacity-0",
          active && runningClassName
        )}
        aria-hidden={!active}
      >
        {activeTail}
      </span>
      <span
        className={cn(
          "transition-opacity duration-300 ease-[var(--ease-composio)]",
          active ? "absolute -translate-x-px opacity-0" : "opacity-100"
        )}
        aria-hidden={active}
      >
        {doneTail}
      </span>
    </span>
  );
}

/**
 * "Reading…" / "Read" → { prefix: "Read", activeTail: "ing…", doneTail: "" }
 * If there's no useful common prefix (≥2 chars), returns the full strings.
 */
function splitCommonPrefix(active: string, done: string): {
  prefix: string;
  activeTail: string;
  doneTail: string;
} {
  const a = Array.from(active);
  const b = Array.from(done);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i < 2) return { prefix: "", activeTail: active, doneTail: done };
  return {
    prefix: a.slice(0, i).join(""),
    activeTail: a.slice(i).join(""),
    doneTail: b.slice(i).join(""),
  };
}
