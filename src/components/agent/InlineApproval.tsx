import { cn } from "../../lib/cn.js";
import type { PendingPrompt } from "../../lib/agent-state.js";

interface ScenePreview {
  id: string;
  narration: string;
  title?: string;
  subtitle?: string;
  durationSec?: number;
  kind?: string;
}

/**
 * Inline approval card — sits at the END of the activity stream when the agent
 * is waiting for user input. The buttons here are the fast paths (approve /
 * cancel); typing into the composer below acts as revision notes.
 *
 * For script-approval prompts, also shows the scene preview inline so the user
 * can read the actual narration before approving.
 */
export function InlineApproval({
  prompt,
  onRespond,
}: {
  prompt: PendingPrompt;
  onRespond: (response: string) => void | Promise<void>;
}) {
  const scenes = (prompt.payload as { preview?: { scenes?: ScenePreview[] } }).preview?.scenes ?? [];
  const total = (prompt.payload as { preview?: { totalDurationSec?: number } }).preview
    ?.totalDurationSec;
  const revision = (prompt.payload as { revision?: number }).revision;
  const isScriptApproval = scenes.length > 0;

  return (
    <article className="hairline relative border-l-2 border-l-cinnabar bg-cinnabar/[0.03] py-4 pl-5 pr-4 enter-rise">
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="pulse-cinnabar h-1 w-1 self-center rounded-full bg-cinnabar" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
            {isScriptApproval ? "review · script" : "agent paused"}
          </span>
          {revision !== undefined && revision > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-brass">
              revision {revision}
            </span>
          )}
        </div>
        {isScriptApproval && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            <span className="tabular text-paper">{scenes.length}</span> scenes
            {total ? (
              <>
                {" · "}
                <span className="tabular text-paper">≈ {total.toFixed(1)}s</span>
              </>
            ) : null}
          </span>
        )}
      </header>

      <h3 className="display-sm mt-2 text-xl text-paper">{prompt.question}</h3>

      {isScriptApproval && (
        <ol className="mt-4 max-h-[40vh] overflow-y-auto stagger-children divide-y divide-brass-line/40">
          {scenes.map((scene, i) => (
            <li key={scene.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-6">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[10px] tabular tracking-widest text-cinnabar">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
                    {scene.id}
                  </span>
                  {scene.kind && (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-brass">
                      {scene.kind}
                    </span>
                  )}
                </div>
                {scene.durationSec !== undefined && (
                  <span className="font-mono text-[10px] tabular text-paper-mute">
                    {scene.durationSec.toFixed(1)}s
                  </span>
                )}
              </div>
              {scene.title && (
                <h4 className="display-sm mt-2 text-lg text-paper">{scene.title}</h4>
              )}
              {scene.subtitle && (
                <p className="mt-1 text-sm text-paper-mute">{scene.subtitle}</p>
              )}
              <p className="mt-2 max-w-2xl font-display text-base italic leading-relaxed text-paper">
                "{scene.narration}"
              </p>
            </li>
          ))}
        </ol>
      )}

      <footer className="mt-4 flex items-center justify-end gap-8">
        <span className="mr-auto font-mono text-[10px] uppercase tracking-widest text-paper-mute/70">
          or type below to request changes
        </span>
        {prompt.options.map((opt) => (
          <ActionButton key={opt} option={opt} onClick={() => onRespond(opt)} />
        ))}
      </footer>
    </article>
  );
}

function ActionButton({
  option,
  onClick,
}: {
  option: string;
  onClick: () => void;
}) {
  const tone = toneFor(option);
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-b pb-1 text-sm font-medium transition-colors",
        tone === "primary" && "border-cinnabar text-cinnabar hover:text-paper",
        tone === "danger" && "border-alarm text-alarm hover:text-paper",
        tone === "neutral" && "border-brass text-paper-mute hover:text-paper"
      )}
    >
      {option} →
    </button>
  );
}

function toneFor(option: string): "primary" | "danger" | "neutral" {
  const o = option.toLowerCase();
  if (o === "approve" || o === "submit" || o === "allow" || o === "yes" || o === "continue") {
    return "primary";
  }
  if (o === "cancel" || o === "deny" || o === "reject" || o === "abort" || o === "no") {
    return "danger";
  }
  return "neutral";
}
