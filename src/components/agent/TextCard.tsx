import { Sparkles } from "lucide-react";
import type { TextActivity } from "../../lib/agent-state.js";
import { MarkdownText } from "./MarkdownText.js";
import { StreamRow, RowLabel } from "./StreamRow.js";

/**
 * The agent's free-form prose — the "delivery" moment in the trace.
 *
 *   ◯ AGENT  · 5fa4c8b1
 *           Drafted the script. Three scenes, 28s total.
 *           The opening scene establishes the…
 *
 * Larger type than surrounding rows (14.5px) and a cyan-tinted icon disc so
 * substantive output stands out visually from the reasoning glue and tool
 * noise. The `agent` label + short message ID give a quiet provenance mark.
 */
export function TextCard({ activity }: { activity: TextActivity }) {
  return (
    <StreamRow
      tone="agent"
      icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />}
      header={
        <>
          <RowLabel tone="cyan">agent</RowLabel>
          {activity.messageId && (
            <span className="font-mono text-[10px] tabular text-fg-muted/65">
              · {activity.messageId.slice(-8)}
            </span>
          )}
        </>
      }
    >
      <MarkdownText
        text={activity.text}
        className="max-w-3xl text-[14.5px] leading-relaxed text-fg"
      />
    </StreamRow>
  );
}
