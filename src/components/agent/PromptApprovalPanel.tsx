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
    <div className="hairline absolute inset-0 z-20 flex flex-col overflow-hidden border-t bg-void/95 backdrop-blur-sm enter-rise">
      {/* Header */}
      <header className="hairline border-b px-12 py-6">
        <div className="flex items-center gap-3">
          <span className="pulse-cyan h-1.5 w-1.5 rounded-full bg-cyan" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan">
            human in the loop · approval requested
          </p>
        </div>
        <h2 className="display-sm mt-3 text-3xl text-fg">{prompt.question}</h2>
        {(prompt.payload as { revision?: number }).revision !== undefined &&
          (prompt.payload as { revision: number }).revision > 0 && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-fg-faint">
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
          <p className="max-w-2xl text-base leading-relaxed text-fg-muted">
            The agent is paused, waiting for your decision.
          </p>
        )}
      </div>

      {/* Action footer (hidden for multiline, which has its own submit) */}
      {!isMultiline && (
        <footer className="hairline border-t bg-surface px-12 py-5">
          <div className="flex items-center justify-end gap-8">
            {prompt.options.map((opt) => (
              <button
                key={opt}
                onClick={() => onRespond(opt)}
                className={cn(
                  "border-b pb-1 text-sm font-medium transition-colors",
                  opt === "approve" || opt === "submit"
                    ? "border-cyan text-cyan hover:text-fg"
                    : opt === "cancel"
                      ? "border-alarm text-alarm hover:text-fg"
                      : "border-mist-10 text-fg-muted hover:text-fg"
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
      <p className="font-mono text-xs text-fg-muted">
        No script preview available. The script was written to{" "}
        <span className="text-fg">{payload.scriptPath ?? "?"}</span> — open it
        before approving.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {scenes.length} scenes
        {total > 0 && (
          <span className="ml-3 tabular text-fg-faint">≈ {total.toFixed(1)}s total</span>
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
                <span className="font-mono text-[10px] tabular tracking-widest text-cyan">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  {scene.id}
                </span>
                {scene.kind && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
                    {scene.kind}
                  </span>
                )}
              </div>
              {scene.durationSec !== undefined && (
                <span className="font-mono text-[10px] tabular text-fg-muted">
                  {scene.durationSec.toFixed(1)}s
                </span>
              )}
            </header>
            {scene.title && (
              <h3 className="display-sm mt-3 text-2xl text-fg">{scene.title}</h3>
            )}
            {scene.subtitle && (
              <p className="mt-1 text-sm text-fg-muted">{scene.subtitle}</p>
            )}
            <p className="mt-3 max-w-2xl font-display text-lg italic leading-relaxed text-fg">
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
      <p className="text-base leading-relaxed text-fg-muted">
        Tell the agent what you want changed. Be specific — scene numbers, lines that should
        differ, voice notes.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={10}
        autoFocus
        placeholder="Tighten the hook — the current version reads like marketing. Cut scene 03 entirely. Move the proof scene to second-to-last."
        className="hairline mt-6 w-full resize-y border bg-surface p-4 font-mono text-xs leading-relaxed text-fg placeholder:text-fg-muted/80 focus:border-cyan focus:outline-none"
      />
      <div className="mt-6 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          ⌘⏎ to submit
        </p>
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || submitting}
          className={cn(
            "border-b pb-1 text-sm font-medium transition-colors",
            !value.trim() || submitting
              ? "cursor-not-allowed border-fg-muted/30 text-fg-muted/50"
              : "border-cyan text-cyan hover:text-fg"
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
