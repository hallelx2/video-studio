import { cn } from "../../lib/cn.js";

/**
 * The cyan heartbeat — used wherever the agent is "thinking" or a state is active.
 * 1.4s cycle, opacity 0.4 → 1.0 → 0.4, defined in index.css.
 */
export function Pulse({
  className,
  size = "sm",
  active = true,
}: {
  className?: string;
  size?: "xs" | "sm" | "md";
  active?: boolean;
}) {
  const dim = size === "xs" ? "h-1 w-1" : size === "md" ? "h-2.5 w-2.5" : "h-1.5 w-1.5";
  return (
    <span
      className={cn(
        "inline-block rounded-full",
        dim,
        active ? "bg-cyan pulse-cyan" : "bg-fg-muted/40",
        className
      )}
    />
  );
}
