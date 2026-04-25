import type { TextActivity } from "../../lib/agent-state.js";
import { MarkdownText } from "./MarkdownText.js";

/**
 * Agent's free-form thinking. Display typography (Fraunces italic) so it reads
 * like a voice, not a log line. Markdown emphasis (**bold**, *italic*, `code`)
 * and bullet/numbered lists render properly via MarkdownText.
 */
export function TextCard({ activity }: { activity: TextActivity }) {
  return (
    <article className="hairline border-l-2 border-l-brass pl-5 py-3">
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
        className="mt-2 max-w-3xl font-display text-[15px] italic text-paper"
      />
    </article>
  );
}
