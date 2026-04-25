import { cn } from "../../lib/cn.js";
import type { UserActivity } from "../../lib/agent-state.js";

const INTENT_LABELS = {
  brief: "you",
  interrupt: "you · interrupt",
  "approval-response": "you · revision",
  "follow-up": "you",
} as const;

const INTENT_TONE = {
  brief: "default",
  interrupt: "alarm",
  "approval-response": "accent",
  "follow-up": "default",
} as const;

export function UserMessageCard({ activity }: { activity: UserActivity }) {
  const tone = INTENT_TONE[activity.intent];

  return (
    <article
      className={cn(
        "border-l-2 pl-5 py-3",
        tone === "alarm" && "border-l-alarm",
        tone === "accent" && "border-l-cinnabar",
        tone === "default" && "border-l-paper"
      )}
    >
      <header className="flex items-baseline gap-3">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest",
            tone === "alarm" && "text-alarm",
            tone === "accent" && "text-cinnabar",
            tone === "default" && "text-paper"
          )}
        >
          {INTENT_LABELS[activity.intent]}
        </span>
      </header>
      <p className="mt-2 max-w-3xl whitespace-pre-wrap font-display text-[15px] leading-relaxed text-paper">
        {activity.text}
      </p>
    </article>
  );
}
