import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import type { PendingPrompt } from "../../lib/agent-state.js";
import { Dock, DockHeader, DockBody, DockTray } from "./Dock.js";

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
  preview?: { scenes?: ScenePreview[]; totalDurationSec?: number };
  revision?: number;
}

/**
 * Bottom-anchored HITL surface. The user can still see the agent activity
 * stream above the dock — the dock doesn't dominate.
 *
 * Three flavors detected from the prompt payload:
 *   - script approval     (scenes preview)
 *   - revision notes      (multiline textarea)
 *   - generic question    (just buttons)
 */
export function PromptDock({
  prompt,
  onRespond,
}: {
  prompt: PendingPrompt;
  onRespond: (response: string) => void | Promise<void>;
}) {
  const isScriptApproval = hasScenes(prompt.payload);
  const isMultiline = (prompt.payload as { multiline?: boolean }).multiline === true;
  const revision = (prompt.payload as { revision?: number }).revision;

  const meta = (() => {
    if (isScriptApproval) {
      const scenes = (prompt.payload as ScriptPayload).preview?.scenes ?? [];
      const total = (prompt.payload as ScriptPayload).preview?.totalDurationSec ?? 0;
      const parts: string[] = [`${scenes.length} scenes`];
      if (total) parts.push(`≈ ${total.toFixed(1)}s`);
      if (revision && revision > 0) parts.push(`revision ${revision}`);
      return parts.join(" · ");
    }
    if (revision && revision > 0) return `revision ${revision}`;
    return undefined;
  })();

  return (
    <Dock kind={isScriptApproval ? "review" : "question"}>
      <DockHeader
        eyebrow={isScriptApproval ? "review · script" : "agent paused"}
        title={prompt.question}
        meta={meta}
        active
      />
      {isScriptApproval ? (
        <ScriptReviewBody payload={prompt.payload as ScriptPayload} />
      ) : isMultiline ? (
        <MultilineBody onRespond={onRespond} />
      ) : (
        <DockBody>
          <p className="text-sm leading-relaxed text-paper-mute">
            The agent is paused, waiting for your decision.
          </p>
        </DockBody>
      )}
      {!isMultiline && (
        <DockTray>
          {prompt.options.map((opt) => (
            <ActionButton key={opt} option={opt} onClick={() => onRespond(opt)} />
          ))}
        </DockTray>
      )}
    </Dock>
  );
}

function ScriptReviewBody({ payload }: { payload: ScriptPayload }) {
  const scenes = payload.preview?.scenes ?? [];

  if (scenes.length === 0) {
    return (
      <DockBody>
        <p className="font-mono text-xs text-paper-mute">
          No script preview available. The script was written to{" "}
          <span className="text-paper">{payload.scriptPath ?? "?"}</span> — open it before approving.
        </p>
      </DockBody>
    );
  }

  return (
    <DockBody scrollable>
      <ol className="stagger-children divide-y divide-brass-line/40">
        {scenes.map((scene, i) => (
          <li key={scene.id} className="py-4 first:pt-0 last:pb-0">
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
              <h3 className="display-sm mt-2 text-xl text-paper">{scene.title}</h3>
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
    </DockBody>
  );
}

function MultilineBody({
  onRespond,
}: {
  onRespond: (response: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onRespond(value);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <DockBody>
        <p className="text-sm leading-relaxed text-paper-mute">
          Tell the agent what to change — scene numbers, lines that should differ, voice notes.
        </p>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={5}
          placeholder="Tighten the hook — the current version reads like marketing. Cut scene 03 entirely…"
          className="hairline mt-3 w-full resize-y border bg-ink-raised p-3 font-mono text-xs leading-relaxed text-paper placeholder:text-paper-mute/60 focus:border-cinnabar focus:outline-none"
        />
      </DockBody>
      <DockTray>
        <span className="mr-auto font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          ⌘⏎ to submit
        </span>
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
      </DockTray>
    </>
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

function hasScenes(payload: Record<string, unknown>): boolean {
  const preview = (payload as { preview?: { scenes?: unknown[] } }).preview;
  return Array.isArray(preview?.scenes) && preview.scenes.length > 0;
}
