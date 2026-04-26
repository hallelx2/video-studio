import type { TextActivity } from "../../lib/agent-state.js";
import { MarkdownText } from "./MarkdownText.js";

/**
 * Agent's free-form prose. Body sans-serif at 14.5px with comfortable
 * leading — readable while streaming, scannable in long sessions, and a
 * deliberate break from Fraunces italic which read as a hero pull-quote
 * instead of a chat message. Mono is reserved for code/path spans inside
 * the markdown (handled by MarkdownText).
 */
export function TextCard({ activity }: { activity: TextActivity }) {
  return (
    <article className="hairline min-w-0 border-l-2 border-l-brass py-3 pl-5">
      <header className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-brass">
          agent
        </span>
        {activity.messageId && (
          <span className="font-mono text-[10px] tabular text-paper-mute">
            {activity.messageId.slice(-8)}
          </span>
        )}
      </header>
      <MarkdownText
        text={activity.text}
        className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-paper"
      />
    </article>
  );
}
