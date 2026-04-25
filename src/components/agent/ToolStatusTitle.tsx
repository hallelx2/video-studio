import { useMemo } from "react";
import { cn } from "../../lib/cn.js";

/**
 * Animated swap between an "active" verb (Reading…) and a "done" verb (Read).
 * Inspired by OpenCode's ToolStatusTitle. The shared prefix doesn't move; only
 * the tail flips so the eye stays anchored.
 *
 * No layout-thrashing measure-and-resize loop — we just inline-block the two
 * spans and let CSS transition handle the visual swap. Crisp on cheap hardware
 * and avoids any flash of wrong text.
 */
export function ToolStatusTitle({
  active,
  activeText,
  doneText,
  className,
}: {
  active: boolean;
  activeText: string;
  doneText: string;
  className?: string;
}) {
  const { prefix, activeTail, doneTail } = useMemo(
    () => splitCommonPrefix(activeText, doneText),
    [activeText, doneText]
  );

  return (
    <span
      data-active={active ? "true" : "false"}
      className={cn("inline-flex items-baseline whitespace-pre", className)}
      aria-label={active ? activeText : doneText}
    >
      {prefix && <span>{prefix}</span>}
      <span
        className={cn(
          "transition-opacity duration-300 ease-[var(--ease-atelier)]",
          active ? "opacity-100" : "absolute -translate-x-px opacity-0"
        )}
        aria-hidden={!active}
      >
        {activeTail}
      </span>
      <span
        className={cn(
          "transition-opacity duration-300 ease-[var(--ease-atelier)]",
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
