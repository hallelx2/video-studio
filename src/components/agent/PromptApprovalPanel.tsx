import { useState } from "react";
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

interface ScriptPayload {
  scriptPath?: string;
  preview?: {
    scenes?: ScenePreview[];
    totalDurationSec?: number;
  };
  revision?: number;
}

/**
 * Full-takeover HITL surface. When the agent emits a prompt event, this panel
 * dims the activity stream and presents the decision in proper context.
 *
 * For script-approval prompts (the highest-stakes gate), each scene becomes its
 * own card so the user reads the actual narration before approving.
 *
 * For follow-up prompts (e.g. revision notes), shows a multiline textarea.
 */
export function PromptApprovalPanel({
  prompt,
  onRespond,
}: {
  prompt: PendingPrompt;
  onRespond: (response: string) => void | Promise<void>;
}) {
  const isScriptApproval = prompt.id.startsWith("prompt-") && hasScenes(prompt.payload);
  const isMultiline = (prompt.payload as { multiline?: boolean }).multiline === true;

  return (
    <div className="hairline absolute inset-0 z-20 flex flex-col overflow-hidden border-t bg-ink/95 backdrop-blur-sm enter-rise">
      {/* Header */}
      <header className="hairline border-b px-12 py-6">
        <div className="flex items-center gap-3">
          <span className="pulse-cinnabar h-1.5 w-1.5 rounded-full bg-cinnabar" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
            human in the loop · approval requested
          </p>
        </div>
        <h2 className="display-sm mt-3 text-3xl text-paper">{prompt.question}</h2>
        {(prompt.payload as { revision?: number }).revision !== undefined &&
          (prompt.payload as { revision: number }).revision > 0 && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-brass">
              revision · round {(prompt.payload as { revision: number }).revision}
            </p>
          )}
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-12 py-8">
        {isScriptApproval ? (
          <ScriptApprovalBody payload={prompt.payload as ScriptPayload} />
        ) : isMultiline ? (
          <MultilineBody onRespond={onRespond} />
        ) : (
          <p className="max-w-2xl text-base leading-relaxed text-paper-mute">
            The agent is paused, waiting for your decision.
          </p>
        )}
      </div>

      {/* Action footer (hidden for multiline, which has its own submit) */}
      {!isMultiline && (
        <footer className="hairline border-t bg-ink-raised px-12 py-5">
          <div className="flex items-center justify-end gap-8">
            {prompt.options.map((opt) => (
              <button
                key={opt}
                onClick={() => onRespond(opt)}
                className={cn(
                  "border-b pb-1 text-sm font-medium transition-colors",
                  opt === "approve" || opt === "submit"
                    ? "border-cinnabar text-cinnabar hover:text-paper"
                    : opt === "cancel"
                      ? "border-alarm text-alarm hover:text-paper"
                      : "border-brass text-paper-mute hover:text-paper"
                )}
              >
                {opt} →
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}

function ScriptApprovalBody({ payload }: { payload: ScriptPayload }) {
  const scenes = payload.preview?.scenes ?? [];
  const total = payload.preview?.totalDurationSec ?? 0;

  if (scenes.length === 0) {
    return (
      <p className="font-mono text-xs text-paper-mute">
        No script preview available. The script was written to{" "}
        <span className="text-paper">{payload.scriptPath ?? "?"}</span> — open it
        before approving.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        {scenes.length} scenes
        {total > 0 && (
          <span className="ml-3 tabular text-brass">≈ {total.toFixed(1)}s total</span>
        )}
      </p>
      <ol className="mt-6 stagger-children">
        {scenes.map((scene, i) => (
          <li
            key={scene.id}
            className="hairline border-b py-6 first:border-t"
          >
            <header className="flex items-baseline justify-between gap-6">
              <div className="flex items-baseline gap-4">
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
            </header>
            {scene.title && (
              <h3 className="display-sm mt-3 text-2xl text-paper">{scene.title}</h3>
            )}
            {scene.subtitle && (
              <p className="mt-1 text-sm text-paper-mute">{scene.subtitle}</p>
            )}
            <p className="mt-3 max-w-2xl font-display text-lg italic leading-relaxed text-paper">
              "{scene.narration}"
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MultilineBody({
  onRespond,
}: {
  onRespond: (response: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onRespond(value);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-base leading-relaxed text-paper-mute">
        Tell the agent what you want changed. Be specific — scene numbers, lines that should
        differ, voice notes.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={10}
        autoFocus
        placeholder="Tighten the hook — the current version reads like marketing. Cut scene 03 entirely. Move the proof scene to second-to-last."
        className="hairline mt-6 w-full resize-y border bg-ink-raised p-4 font-mono text-xs leading-relaxed text-paper placeholder:text-paper-mute/80 focus:border-cinnabar focus:outline-none"
      />
      <div className="mt-6 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          ⌘⏎ to submit
        </p>
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || submitting}
          className={cn(
            "border-b pb-1 text-sm font-medium transition-colors",
            !value.trim() || submitting
              ? "cursor-not-allowed border-paper-mute/30 text-paper-mute/50"
              : "border-cinnabar text-cinnabar hover:text-paper"
          )}
        >
          {submitting ? "submitting…" : "submit notes →"}
        </button>
      </div>
    </div>
  );
}

function hasScenes(payload: Record<string, unknown>): boolean {
  const preview = (payload as { preview?: { scenes?: unknown[] } }).preview;
  return Array.isArray(preview?.scenes) && preview.scenes.length > 0;
}
