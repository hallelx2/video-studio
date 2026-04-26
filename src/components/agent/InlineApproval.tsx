import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import type { PendingPrompt } from "../../lib/agent-state.js";
import {
  openExternal,
  readText,
  startPreview,
  stopPreview,
  writeText,
} from "../../lib/agent-client.js";

interface ScenePreview {
  id: string;
  narration: string;
  title?: string;
  subtitle?: string;
  durationSec?: number;
  kind?: string;
}

interface CompositionRef {
  aspect: string;
  path: string;
  indexHtml: string;
}

type SceneEdits = Record<
  string, // scene id
  { narration?: string; title?: string }
>;

/**
 * Inline approval card with EDITABLE scene narration. Click any scene's text
 * to tamper with it before approving — the edited script is written back to
 * disk before the agent proceeds. Approve unchanged for a quick OK.
 *
 * Free-form text typed into the chat composer below remains the path for
 * structural changes ("cut scene 3", "swap scenes 4 and 5") — the agent
 * re-drafts based on those notes.
 */
export function InlineApproval({
  prompt,
  onRespond,
}: {
  prompt: PendingPrompt;
  onRespond: (response: string) => void | Promise<void>;
}) {
  const promptKind = (prompt.payload as { kind?: string }).kind;
  const compositions = (prompt.payload as { compositions?: CompositionRef[] }).compositions;
  const isComposeApproval = promptKind === "compose-approval" && Array.isArray(compositions);
  const isClarification = promptKind === "clarification";

  if (isComposeApproval) {
    return <ComposeApproval prompt={prompt} compositions={compositions!} onRespond={onRespond} />;
  }

  if (isClarification) {
    return <ClarificationCard prompt={prompt} onRespond={onRespond} />;
  }

  const scenes = (prompt.payload as { preview?: { scenes?: ScenePreview[] } }).preview?.scenes ?? [];
  const total = (prompt.payload as { preview?: { totalDurationSec?: number } }).preview
    ?.totalDurationSec;
  const revision = (prompt.payload as { revision?: number }).revision;
  const scriptPath = (prompt.payload as { scriptPath?: string }).scriptPath;
  const isScriptApproval = scenes.length > 0;

  const [edits, setEdits] = useState<SceneEdits>({});
  const [submitting, setSubmitting] = useState(false);

  const editCount = Object.keys(edits).length;
  const hasEdits = editCount > 0;

  // Reset edits when a new prompt arrives (e.g. after a revision round).
  useEffect(() => {
    setEdits({});
  }, [prompt.id]);

  const updateScene = useCallback((sceneId: string, patch: { narration?: string; title?: string }) => {
    setEdits((prev) => {
      const original = scenes.find((s) => s.id === sceneId);
      if (!original) return prev;

      const next = { ...prev };
      const merged = { ...next[sceneId], ...patch };

      // Drop empty patches when value matches the original — keeps the badge accurate.
      const cleaned: { narration?: string; title?: string } = {};
      if (merged.narration !== undefined && merged.narration !== original.narration) {
        cleaned.narration = merged.narration;
      }
      if (merged.title !== undefined && merged.title !== original.title) {
        cleaned.title = merged.title;
      }

      if (Object.keys(cleaned).length === 0) {
        delete next[sceneId];
      } else {
        next[sceneId] = cleaned;
      }
      return next;
    });
  }, [scenes]);

  const handleApprove = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // If the user edited any scenes, write the modified script back BEFORE
      // sending "approve" so the agent picks up the new content when it
      // continues to narration.
      if (hasEdits && scriptPath) {
        const raw = await readText(scriptPath);
        if (raw) {
          try {
            const json = JSON.parse(raw) as { scenes?: ScenePreview[] };
            if (Array.isArray(json.scenes)) {
              for (const scene of json.scenes) {
                const patch = edits[scene.id];
                if (!patch) continue;
                if (patch.narration !== undefined) scene.narration = patch.narration;
                if (patch.title !== undefined) scene.title = patch.title;
              }
              await writeText(scriptPath, JSON.stringify(json, null, 2));
            }
          } catch {
            // If we can't parse the on-disk script, fall back to plain approve.
          }
        }
      }
      await onRespond("approve");
    } finally {
      setSubmitting(false);
    }
  }, [edits, hasEdits, onRespond, scriptPath, submitting]);

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
          {hasEdits && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-brass">
              {editCount} edited
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
        <ol className="mt-4 max-h-[50vh] overflow-y-auto stagger-children divide-y divide-brass-line/40">
          {scenes.map((scene, i) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              index={i}
              edit={edits[scene.id]}
              onChange={(patch) => updateScene(scene.id, patch)}
            />
          ))}
        </ol>
      )}

      <footer className="mt-4 flex items-center justify-end gap-8">
        <span className="mr-auto font-mono text-[10px] uppercase tracking-widest text-paper-mute/70">
          {hasEdits
            ? `${editCount} edit${editCount === 1 ? "" : "s"} — will save before approving`
            : "click any scene to tamper · type below for structural changes"}
        </span>
        {prompt.options.map((opt) => {
          if (opt === "approve") {
            return (
              <button
                key={opt}
                onClick={handleApprove}
                disabled={submitting}
                className={cn(
                  "border-b pb-1 text-sm font-medium transition-colors",
                  submitting
                    ? "cursor-not-allowed border-paper-mute/30 text-paper-mute/40"
                    : hasEdits
                      ? "border-cinnabar text-cinnabar hover:text-paper"
                      : "border-cinnabar text-cinnabar hover:text-paper"
                )}
              >
                {hasEdits ? "save & approve →" : "approve →"}
              </button>
            );
          }
          return (
            <ActionButton
              key={opt}
              option={opt}
              disabled={submitting}
              onClick={() => onRespond(opt)}
            />
          );
        })}
      </footer>
    </article>
  );
}

function SceneRow({
  scene,
  index,
  edit,
  onChange,
}: {
  scene: ScenePreview;
  index: number;
  edit: { narration?: string; title?: string } | undefined;
  onChange: (patch: { narration?: string; title?: string }) => void;
}) {
  const [editing, setEditing] = useState<"none" | "narration" | "title">("none");
  const isModified = !!edit;

  const currentNarration = edit?.narration ?? scene.narration;
  const currentTitle = edit?.title ?? scene.title;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tabular tracking-widest text-cinnabar">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            {scene.id}
          </span>
          {scene.kind && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-brass">
              {scene.kind}
            </span>
          )}
          {isModified && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
              modified
            </span>
          )}
        </div>
        {scene.durationSec !== undefined && (
          <span className="font-mono text-[10px] tabular text-paper-mute">
            {scene.durationSec.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Title — click to edit */}
      {(currentTitle || editing === "title") && (
        editing === "title" ? (
          <EditableField
            initial={currentTitle ?? ""}
            multiline={false}
            placeholder="Scene title"
            onCommit={(value) => {
              onChange({ title: value });
              setEditing("none");
            }}
            onCancel={() => setEditing("none")}
          />
        ) : (
          <button
            onClick={() => setEditing("title")}
            className="mt-2 block w-full text-left transition-colors hover:bg-ink-raised/30"
          >
            <h4 className="display-sm text-lg text-paper">{currentTitle}</h4>
          </button>
        )
      )}

      {scene.subtitle && (
        <p className="mt-1 text-sm text-paper-mute">{scene.subtitle}</p>
      )}

      {/* Narration — click to edit */}
      {editing === "narration" ? (
        <EditableField
          initial={currentNarration}
          multiline
          placeholder="Scene narration…"
          onCommit={(value) => {
            onChange({ narration: value });
            setEditing("none");
          }}
          onCancel={() => setEditing("none")}
        />
      ) : (
        <button
          onClick={() => setEditing("narration")}
          className="mt-2 block w-full text-left transition-colors hover:bg-ink-raised/30"
          title="Click to edit narration"
        >
          <p className="max-w-2xl font-display text-base italic leading-relaxed text-paper">
            "{currentNarration}"
          </p>
        </button>
      )}
    </li>
  );
}

function EditableField({
  initial,
  multiline,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  multiline: boolean;
  placeholder: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    if (ref.current && "select" in ref.current) ref.current.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onCommit(value);
      return;
    }
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      onCommit(value);
    }
  };

  const Element = multiline ? "textarea" : "input";

  return (
    <div className="mt-2">
      <Element
        // @ts-expect-error — both element types share a value prop
        ref={ref}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setValue(e.target.value)
        }
        onKeyDown={handleKeyDown}
        onBlur={() => onCommit(value)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        className={cn(
          "w-full resize-y bg-transparent font-display italic leading-relaxed text-paper outline-none",
          "border-b border-cinnabar pb-1",
          multiline ? "text-base" : "text-lg"
        )}
      />
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        ⏎ save · esc cancel
      </p>
    </div>
  );
}

function ActionButton({
  option,
  disabled,
  onClick,
}: {
  option: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tone = toneFor(option);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "border-b pb-1 text-sm font-medium transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        tone === "primary" && "border-cinnabar text-cinnabar hover:text-paper",
        tone === "danger" && "border-alarm text-alarm hover:text-paper",
        tone === "neutral" && "border-brass text-paper-mute hover:text-paper"
      )}
    >
      {option} →
    </button>
  );
}

// ─── Clarification flavor — agent asks a question before drafting ────────
// Different visual treatment from approval prompts: this is an inquiry, not
// a gate. Brass accent (not cinnabar — we're not asking for permission, we
// want input). Question in display font, options as soft chip buttons,
// optional context line above. The chat composer below the card handles
// free-text answers naturally — no embedded textarea needed here.

function ClarificationCard({
  prompt,
  onRespond,
}: {
  prompt: PendingPrompt;
  onRespond: (response: string) => void | Promise<void>;
}) {
  const context = (prompt.payload as { context?: string }).context ?? null;
  const [submitting, setSubmitting] = useState(false);

  const handlePick = async (value: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onRespond(value);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="hairline relative border-l-2 border-l-brass bg-brass/[0.04] py-4 pl-5 pr-4 enter-rise">
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="pulse-cinnabar h-1 w-1 self-center rounded-full bg-brass" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-brass">
            agent · clarifying question
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/70">
          one-shot
        </span>
      </header>

      {context && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper-mute">{context}</p>
      )}

      <h3 className="display-sm mt-3 max-w-3xl text-2xl text-paper">{prompt.question}</h3>

      {prompt.options.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {prompt.options.map((opt) => {
            const isSkip = /^skip/i.test(opt);
            return (
              <button
                key={opt}
                onClick={() => handlePick(opt)}
                disabled={submitting}
                className={cn(
                  "rounded-full border px-4 py-1.5 font-sans text-sm transition-colors",
                  submitting && "cursor-not-allowed opacity-50",
                  isSkip
                    ? "border-paper-mute/20 bg-transparent text-paper-mute hover:border-paper-mute/40 hover:text-paper"
                    : "border-brass/40 bg-brass/[0.06] text-paper hover:border-brass hover:bg-brass/15"
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-paper-mute">
        Pick an option above, or type a custom answer in the chat below — anything you send
        becomes the agent's direction for this question.
      </p>
    </article>
  );
}

function toneFor(option: string): "primary" | "danger" | "neutral" {
  const o = option.toLowerCase();
  if (
    o === "approve" ||
    o === "submit" ||
    o === "allow" ||
    o === "yes" ||
    o === "continue" ||
    o === "render"
  ) {
    return "primary";
  }
  if (o === "cancel" || o === "deny" || o === "reject" || o === "abort" || o === "no") {
    return "danger";
  }
  return "neutral";
}

// ─── Compose-approval flavor ──────────────────────────────────────────────
// After Stage 5 (compose) the agent pauses here. The user can launch the
// HyperFrames dev server for any aspect to see the actual GSAP timeline play
// in their browser before committing to a render. Type into the chat below
// for revision notes; click `render →` when satisfied.

function ComposeApproval({
  prompt,
  compositions,
  onRespond,
}: {
  prompt: PendingPrompt;
  compositions: CompositionRef[];
  onRespond: (response: string) => void | Promise<void>;
}) {
  const revision = (prompt.payload as { revision?: number }).revision;
  const [previewing, setPreviewing] = useState<{
    aspect: string;
    url: string;
  } | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePreview = useCallback(
    async (comp: CompositionRef) => {
      if (starting) return;
      setStarting(comp.aspect);
      try {
        const { url } = await startPreview(comp.path);
        setPreviewing({ aspect: comp.aspect, url });
        // Kick the user's default browser. The dev server takes ~1s to come up;
        // give it a beat so the URL doesn't 404 on first load.
        setTimeout(() => {
          openExternal(url).catch(() => undefined);
        }, 1200);
      } finally {
        setStarting(null);
      }
    },
    [starting]
  );

  // Auto-stop the preview when the user moves on (approve / cancel / revise).
  const cleanupPreview = useCallback(async () => {
    if (previewing) {
      await stopPreview().catch(() => undefined);
      setPreviewing(null);
    }
  }, [previewing]);

  // Stop on unmount
  useEffect(() => {
    return () => {
      stopPreview().catch(() => undefined);
    };
  }, []);

  const handleRespond = useCallback(
    async (option: string) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        await cleanupPreview();
        await onRespond(option);
      } finally {
        setSubmitting(false);
      }
    },
    [cleanupPreview, onRespond, submitting]
  );

  return (
    <article className="hairline relative border-l-2 border-l-cinnabar bg-cinnabar/[0.03] py-4 pl-5 pr-4 enter-rise">
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="pulse-cinnabar h-1 w-1 self-center rounded-full bg-cinnabar" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
            review · composition
          </span>
          {revision !== undefined && revision > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-brass">
              revision {revision}
            </span>
          )}
          {previewing && (
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cinnabar">
              <span className="pulse-cinnabar h-1 w-1 rounded-full bg-cinnabar" />
              dev server · {previewing.aspect}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          <span className="tabular text-paper">{compositions.length}</span> aspect
          {compositions.length === 1 ? "" : "s"}
        </span>
      </header>

      <h3 className="display-sm mt-2 text-xl text-paper">{prompt.question}</h3>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper-mute">
        Each aspect was authored as a HyperFrames composition. Launch the dev server to
        see the actual GSAP timeline play in your browser — no full render needed. Type
        notes below to ask the agent to adjust the composition; click <span className="text-cinnabar">render →</span> when it
        looks right.
      </p>

      <ul className="hairline mt-4 divide-y divide-brass-line/40 border bg-ink/30">
        {compositions.map((comp) => {
          const isActive = previewing?.aspect === comp.aspect;
          const isStarting = starting === comp.aspect;
          return (
            <li
              key={comp.aspect}
              className={cn(
                "flex items-baseline justify-between gap-6 px-4 py-3 transition-colors",
                isActive && "bg-ink-edge"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
                    aspect
                  </span>
                  <span className="font-display text-base font-semibold text-paper">
                    {comp.aspect}
                  </span>
                  {isActive && (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
                      running
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-paper-mute">
                  {comp.indexHtml}
                </p>
                {isActive && (
                  <p className="mt-1 font-mono text-[10px] text-cinnabar">{previewing.url}</p>
                )}
              </div>
              <div className="flex shrink-0 items-baseline gap-5">
                {isActive ? (
                  <>
                    <button
                      onClick={() => openExternal(previewing.url).catch(() => undefined)}
                      className="border-b border-brass pb-0.5 font-mono text-[10px] uppercase tracking-widest text-paper-mute hover:text-paper"
                    >
                      open again
                    </button>
                    <button
                      onClick={async () => {
                        await stopPreview().catch(() => undefined);
                        setPreviewing(null);
                      }}
                      className="border-b border-alarm pb-0.5 font-mono text-[10px] uppercase tracking-widest text-alarm hover:text-paper"
                    >
                      stop
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handlePreview(comp)}
                    disabled={isStarting || !!previewing}
                    className={cn(
                      "border-b pb-0.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                      isStarting
                        ? "border-paper-mute/30 text-paper-mute/40"
                        : previewing
                          ? "cursor-not-allowed border-paper-mute/30 text-paper-mute/30"
                          : "border-cinnabar text-cinnabar hover:text-paper"
                    )}
                  >
                    {isStarting ? "starting…" : "preview →"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="mt-4 flex items-center justify-end gap-8">
        <span className="mr-auto font-mono text-[10px] uppercase tracking-widest text-paper-mute/70">
          type below for revision notes · or render
        </span>
        {prompt.options.map((opt) => (
          <ActionButton
            key={opt}
            option={opt}
            disabled={submitting}
            onClick={() => handleRespond(opt)}
          />
        ))}
      </footer>
    </article>
  );
}
