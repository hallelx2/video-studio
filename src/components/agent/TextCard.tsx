import type { TextActivity } from "../../lib/agent-state.js";

/**
 * Agent's free-form thinking. Display typography (Fraunces italic) so it reads
 * like a voice, not a log line — distinct from progress and tool noise.
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
      <p className="mt-2 max-w-3xl whitespace-pre-wrap font-display text-[15px] leading-relaxed text-paper">
        {activity.text}
      </p>
    </article>
  );
}
