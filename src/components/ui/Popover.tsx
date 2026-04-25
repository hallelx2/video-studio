import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn.js";

/**
 * Lightweight popover — no Radix dependency, no portal. We just absolutely
 * position the panel relative to the trigger's wrapper and close on:
 *   · click outside the panel/trigger
 *   · escape key
 *   · the consumer toggling `open` via the `onClose` callback
 *
 * Anchor point is "bottom-start" by default — panel hangs below the trigger
 * aligned to its left edge. For the Composer's model chip we want
 * "top-start" instead (panel pops upward), so the side prop accepts both.
 */
export type PopoverSide = "top" | "bottom";
export type PopoverAlign = "start" | "end";

export function Popover({
  trigger,
  open,
  onOpenChange,
  side = "bottom",
  align = "start",
  className,
  children,
}: {
  trigger: (args: { open: boolean; toggle: () => void }) => ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: PopoverSide;
  align?: PopoverAlign;
  className?: string;
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click + escape.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapperRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onOpenChange]);

  // Focus the first focusable element inside the panel when it opens.
  useEffect(() => {
    if (!open) return;
    const node = panelRef.current?.querySelector<HTMLElement>(
      "input, button, [tabindex='0']"
    );
    node?.focus();
  }, [open]);

  const sideClass = side === "top" ? "bottom-full mb-2" : "top-full mt-2";
  const alignClass = align === "end" ? "right-0" : "left-0";

  return (
    <div ref={wrapperRef} className="relative inline-block">
      {trigger({ open, toggle: () => onOpenChange(!open) })}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          className={cn(
            "absolute z-50 min-w-[280px] origin-top-left",
            sideClass,
            alignClass,
            "rounded-xl border border-paper-mute/15 bg-ink-raised shadow-2xl shadow-ink/80",
            "enter-rise",
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface PopoverState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Convenience hook so consumers don't have to wire useState themselves. */
export function usePopover(initial = false): PopoverState {
  const [open, setOpen] = useState(initial);
  return { open, setOpen };
}
