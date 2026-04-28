import { ArrowUpRight, OctagonAlert, RotateCcw, CornerDownRight } from "lucide-react";
import type { UserActivity } from "../../lib/agent-state.js";
import { StreamRow, RowLabel, type StreamRowTone } from "./StreamRow.js";

/**
 * The user's prompt — your message to the agent. Each intent gets a distinct
 * Lucide icon so the eye scans by shape:
 *
 *   ↗  brief / follow-up   — sending up to the agent
 *   ⚠  interrupt          — alarm-toned, breaks the run
 *   ↩  approval-response  — cyan, signaling a second pass
 *   ⤷  follow-up          — soft re-entry
 */

const INTENT_ICON = {
  brief:               ArrowUpRight,
  interrupt:           OctagonAlert,
  "approval-response": RotateCcw,
  "follow-up":         CornerDownRight,
} as const;

const INTENT_TONE: Record<UserActivity["intent"], StreamRowTone> = {
  brief:               "user",
  interrupt:           "alarm",
  "approval-response": "agent",
  "follow-up":         "user",
};

const INTENT_LABEL = {
  brief:               null,
  interrupt:           "interrupt",
  "approval-response": "revision",
  "follow-up":         "follow-up",
} as const;

export function UserMessageCard({ activity }: { activity: UserActivity }) {
  const Icon = INTENT_ICON[activity.intent];
  const tone = INTENT_TONE[activity.intent];
  const label = INTENT_LABEL[activity.intent];

  return (
    <StreamRow
      tone={tone}
      icon={<Icon className="h-3.5 w-3.5" strokeWidth={1.75} />}
      header={
        label ? (
          <RowLabel tone={tone === "alarm" ? "alarm" : tone === "agent" ? "cyan" : "fg"}>
            {label}
          </RowLabel>
        ) : (
          <RowLabel tone="fg">you</RowLabel>
        )
      }
    >
      <p
        className={
          "max-w-3xl whitespace-pre-wrap text-[14.5px] leading-relaxed " +
          (tone === "alarm" ? "text-alarm" : "text-fg")
        }
      >
        {activity.text}
      </p>
    </StreamRow>
  );
}
