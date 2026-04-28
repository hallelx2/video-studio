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
import { usePreview } from "../../lib/preview-context.js";

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
  const isStageFailure = promptKind === "stage-failure";

  if (isStageFailure) {
    return <StageFailureCard prompt={prompt} onRespond={onRespond} />;
  }

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
    <article
      className={cn(
        "hairline relative border-l-2 py-4 pl-5 pr-4 enter-rise transition-[opacity,filter] duration-200",
        submitting
          ? "border-l-mist-10 bg-fg-faint/[0.04] opacity-75 pointer-events-none"
          : "border-l-cyan bg-cyan/[0.03]"
      )}
      aria-busy={submitting}
    >
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span
            className={cn(
              "pulse-cyan h-1 w-1 self-center rounded-full",
              submitting ? "bg-fg-faint" : "bg-cyan"
            )}
          />
          <span
            className={cn(
              "font-mono text-[10px] uppercase tracking-widest",
              submitting ? "text-fg-faint" : "text-cyan"
            )}
          >
            {submitting
              ? "submitted · agent resuming"
              : isScriptApproval
                ? "review · script"
                : "agent paused"}
          </span>
          {revision !== undefined && revision > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
              revision {revision}
            </span>
          )}
          {hasEdits && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
              {editCount} edited
            </span>
          )}
        </div>
        {isScriptApproval && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            <span className="tabular text-fg">{scenes.length}</span> scenes
            {total ? (
              <>
                {" · "}
                <span className="tabular text-fg">≈ {total.toFixed(1)}s</span>
              </>
            ) : null}
          </span>
        )}
      </header>

      <h3 className="display-sm mt-2 text-xl text-fg">{prompt.question}</h3>

      {isScriptApproval && (
        <ol className="mt-4 max-h-[50vh] overflow-y-auto stagger-children divide-y divide-mist-10/40">
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
        <span className="mr-auto font-mono text-[10px] uppercase tracking-widest text-fg-muted/85">
          {submitting
            ? "approved — waiting for the next stage to start…"
            : hasEdits
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
                    ? "cursor-not-allowed border-mist-10/40 text-fg-faint"
                    : "border-cyan text-cyan hover:text-fg"
                )}
              >
                {submitting ? "approving…" : hasEdits ? "save & approve →" : "approve →"}
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
          <span className="font-mono text-[10px] tabular tracking-widest text-cyan">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {scene.id}
          </span>
          {scene.kind && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
              {scene.kind}
            </span>
          )}
          {isModified && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
              modified
            </span>
          )}
        </div>
        {scene.durationSec !== undefined && (
          <span className="font-mono text-[10px] tabular text-fg-muted">
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
            className="mt-2 block w-full text-left transition-colors hover:bg-surface/30"
          >
            <h4 className="display-sm text-lg text-fg">{currentTitle}</h4>
          </button>
        )
      )}

      {scene.subtitle && (
        <p className="mt-1 text-sm text-fg-muted">{scene.subtitle}</p>
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
          className="mt-2 block w-full text-left transition-colors hover:bg-surface/30"
          title="Click to edit narration"
        >
          <p className="max-w-2xl font-display text-base italic leading-relaxed text-fg">
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
          "w-full resize-y bg-transparent font-display italic leading-relaxed text-fg outline-none",
          "border-b border-cyan pb-1",
          multiline ? "text-base" : "text-lg"
        )}
      />
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        ⏎ save · esc cancel
      </p>
    </div>
  );
}

function ActionButton({
  option,
  disabled,
  inflight,
  onClick,
}: {
  option: string;
  disabled?: boolean;
  /** True when this specific option is the one being submitted — swaps
   *  the label to "<verb>ing…" so the user sees their click landed. */
  inflight?: boolean;
  onClick: () => void;
}) {
  const tone = toneFor(option);
  const label = inflight ? `${option}ing…` : `${option} →`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "border-b pb-1 text-sm font-medium transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        inflight && "border-mist-10/40 text-fg-faint",
        !inflight && tone === "primary" && "border-cyan text-cyan hover:text-fg",
        !inflight && tone === "danger" && "border-alarm text-alarm hover:text-fg",
        !inflight && tone === "neutral" && "border-mist-10 text-fg-muted hover:text-fg"
      )}
    >
      {label}
    </button>
  );
}

// ─── Clarification flavor — agent asks a question before drafting ────────
// Different visual treatment from approval prompts: this is an inquiry, not
// a gate. Mist accent (not cyan — we're not asking for permission, we
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
  const [chosen, setChosen] = useState<string | null>(null);

  const handlePick = async (value: string) => {
    if (submitting) return;
    setChosen(value);
    setSubmitting(true);
    try {
      await onRespond(value);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article
      className={cn(
        "hairline relative border-l-2 py-4 pl-5 pr-4 enter-rise transition-[opacity,filter] duration-200",
        submitting
          ? "border-l-fg-muted/40 bg-fg-muted/[0.05] opacity-75 pointer-events-none"
          : "border-l-mist-10 bg-fg-faint/[0.04]"
      )}
      aria-busy={submitting}
    >
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span
            className={cn(
              "pulse-cyan h-1 w-1 self-center rounded-full",
              submitting ? "bg-fg-muted/60" : "bg-fg-faint"
            )}
          />
          <span
            className={cn(
              "font-mono text-[10px] uppercase tracking-widest",
              submitting ? "text-fg-muted" : "text-fg-faint"
            )}
          >
            {submitting
              ? `answered · ${chosen ?? "reply sent"}`
              : "agent · clarifying question"}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted/85">
          one-shot
        </span>
      </header>

      {context && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">{context}</p>
      )}

      <h3 className="display-sm mt-3 max-w-3xl text-2xl text-fg">{prompt.question}</h3>

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
                    ? "border-fg-muted/20 bg-transparent text-fg-muted hover:border-fg-muted/40 hover:text-fg"
                    : "border-mist-10/40 bg-fg-faint/[0.06] text-fg hover:border-mist-10 hover:bg-fg-faint/15"
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-fg-muted">
        Pick an option above, or type a custom answer in the chat below — anything you send
        becomes the agent's direction for this question.
      </p>
    </article>
  );
}

// ─── Stage failure flavor ────────────────────────────────────────────────
// Surfaces when withReviewAndRetry asks the user what to do after a stage
// blew up. The agent's markdown review already rendered above this card as
// regular agent_text — this component is just the "retry / cancel" gate.
//
// Alarm-bordered to mirror the failure state, with the stage name + attempt
// counter in the header so the user knows where in the pipeline they are.

function StageFailureCard({
  prompt,
  onRespond,
}: {
  prompt: PendingPrompt;
  onRespond: (response: string) => void | Promise<void>;
}) {
  const stage = (prompt.payload as { stage?: string }).stage ?? "unknown stage";
  const attempt = (prompt.payload as { attempt?: number }).attempt;
  const maxAttempts = (prompt.payload as { maxAttempts?: number }).maxAttempts;
  const error = (prompt.payload as { error?: string }).error ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const handlePick = async (value: string) => {
    if (submitting) return;
    setChosen(value);
    setSubmitting(true);
    try {
      await onRespond(value);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article
      className={cn(
        "hairline relative border-l-2 py-4 pl-5 pr-4 enter-rise transition-[opacity,filter] duration-200",
        submitting
          ? "border-l-fg-muted/40 bg-fg-muted/[0.05] opacity-75 pointer-events-none"
          : "border-l-alarm bg-alarm/[0.05]"
      )}
      aria-busy={submitting}
    >
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span
            className={cn(
              "pulse-cyan h-1 w-1 self-center rounded-full",
              submitting ? "bg-fg-muted/60" : "bg-alarm"
            )}
          />
          <span
            className={cn(
              "font-mono text-[10px] uppercase tracking-widest",
              submitting ? "text-fg-muted" : "text-alarm"
            )}
          >
            {submitting
              ? `${chosen ?? "responding"} · agent resuming`
              : `${stage} · failed`}
          </span>
          {attempt !== undefined && maxAttempts !== undefined && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              attempt {attempt}/{maxAttempts}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted/85">
          recoverable
        </span>
      </header>

      <h3 className="display-sm mt-2 max-w-3xl text-xl text-fg">{prompt.question}</h3>

      {error && (
        <pre className="hairline mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-alarm/20 bg-alarm/[0.04] p-2 font-mono text-[11px] leading-relaxed text-alarm">
          {error}
        </pre>
      )}

      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-fg-muted">
        The agent's review is above. Fix the underlying issue (install the
        missing package, free up disk, etc) and click <span className="text-fg">retry</span> — the cache means only the
        unfinished work re-runs. Or <span className="text-fg">cancel</span> to pause the pipeline and start a fresh
        message.
      </p>

      <footer className="mt-4 flex items-center justify-end gap-8">
        <span className="mr-auto font-mono text-[10px] uppercase tracking-widest text-fg-muted/85">
          {submitting
            ? "waiting for the agent to resume…"
            : "click retry once you've fixed it"}
        </span>
        {prompt.options.map((opt) => (
          <ActionButton
            key={opt}
            option={opt}
            disabled={submitting}
            inflight={submitting && chosen === opt}
            onClick={() => handlePick(opt)}
          />
        ))}
      </footer>
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
  // Preview previously auto-loaded the iframe in the slide-in PreviewPanel
  // — but the user wants to be the one who opens the browser, not have
  // an in-app surface pop in unannounced. We now start the dev server and
  // hand the URL to the OS default browser via `openExternal`. The
  // PreviewProvider is still consulted so we don't double-spawn the
  // server when one is already running for this aspect.
  const { current: preview, close } = usePreview();
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState<{ aspect: string; url: string } | null>(
    () => {
      // If the slide-in is already showing this aspect (legacy state from a
      // prior session click), surface that as the active preview so the
      // pill mirrors reality.
      if (preview && preview.kind === "iframe") {
        return { aspect: preview.aspect, url: preview.url };
      }
      return null;
    }
  );
  const [starting, setStarting] = useState<string | null>(null);

  const handlePreview = useCallback(
    async (comp: CompositionRef) => {
      if (starting) return;
      // Same aspect already running? Just re-launch the browser tab.
      if (previewing && previewing.aspect === comp.aspect) {
        await openExternal(previewing.url).catch(() => undefined);
        return;
      }
      setStarting(comp.aspect);
      try {
        // Tear down any prior in-app slide-in iframe so we don't keep two
        // dev servers running for the same workspace.
        if (preview && preview.kind === "iframe") {
          await close();
        }
        const { url } = await startPreview(comp.path);
        setPreviewing({ aspect: comp.aspect, url });
        await openExternal(url).catch(() => undefined);
      } finally {
        setStarting(null);
      }
    },
    [starting, previewing, preview, close]
  );

  const handleStopPreview = useCallback(async () => {
    setPreviewing(null);
    await stopPreview().catch(() => undefined);
  }, []);

  const handleRespond = useCallback(
    async (option: string) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        // Close the preview when the user moves on so the dev server is
        // released and a future preview can claim the same port cleanly.
        await close();
        await onRespond(option);
      } finally {
        setSubmitting(false);
      }
    },
    [close, onRespond, submitting]
  );

  return (
    <article
      className={cn(
        "hairline relative border-l-2 py-4 pl-5 pr-4 enter-rise transition-[opacity,filter] duration-200",
        submitting
          ? "border-l-mist-10 bg-fg-faint/[0.04] opacity-75 pointer-events-none"
          : "border-l-cyan bg-cyan/[0.03]"
      )}
      aria-busy={submitting}
    >
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span
            className={cn(
              "pulse-cyan h-1 w-1 self-center rounded-full",
              submitting ? "bg-fg-faint" : "bg-cyan"
            )}
          />
          <span
            className={cn(
              "font-mono text-[10px] uppercase tracking-widest",
              submitting ? "text-fg-faint" : "text-cyan"
            )}
          >
            {submitting ? "submitted · render queued" : "review · composition"}
          </span>
          {revision !== undefined && revision > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
              revision {revision}
            </span>
          )}
          {previewing && !submitting && (
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cyan">
              <span className="pulse-cyan h-1 w-1 rounded-full bg-cyan" />
              dev server · {previewing.aspect}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          <span className="tabular text-fg">{compositions.length}</span> aspect
          {compositions.length === 1 ? "" : "s"}
        </span>
      </header>

      <h3 className="display-sm mt-2 text-xl text-fg">{prompt.question}</h3>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        Each aspect was authored as a HyperFrames composition. Launch the dev server to
        see the actual GSAP timeline play in your browser — no full render needed. Type
        notes below to ask the agent to adjust the composition; click <span className="text-cyan">render →</span> when it
        looks right.
      </p>

      <ul className="hairline mt-4 divide-y divide-mist-10/40 border bg-void/30">
        {compositions.map((comp) => {
          const isActive = previewing?.aspect === comp.aspect;
          const isStarting = starting === comp.aspect;
          return (
            <li
              key={comp.aspect}
              className={cn(
                "flex items-baseline justify-between gap-6 px-4 py-3 transition-colors",
                isActive && "bg-elevated"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    aspect
                  </span>
                  <span className="font-display text-base font-semibold text-fg">
                    {comp.aspect}
                  </span>
                  {isActive && (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
                      running
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-fg-muted">
                  {comp.indexHtml}
                </p>
                {isActive && (
                  <p className="mt-1 font-mono text-[10px] text-cyan">{previewing.url}</p>
                )}
              </div>
              <div className="flex shrink-0 items-baseline gap-5">
                {isActive ? (
                  <>
                    <button
                      onClick={() => previewing && openExternal(previewing.url).catch(() => undefined)}
                      className="border-b border-cyan pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan hover:text-fg"
                      title="Open the dev server in your default browser again"
                    >
                      open in browser ↗
                    </button>
                    <button
                      onClick={() => void handleStopPreview()}
                      className="border-b border-alarm pb-0.5 font-mono text-[10px] uppercase tracking-widest text-alarm hover:text-fg"
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
                        ? "border-fg-muted/30 text-fg-muted/40"
                        : previewing
                          ? "cursor-not-allowed border-fg-muted/30 text-fg-muted/30"
                          : "border-cyan text-cyan hover:text-fg"
                    )}
                    title="Start the dev server and open in your default browser"
                  >
                    {isStarting ? "starting…" : "preview in browser ↗"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="mt-4 flex items-center justify-end gap-8">
        <span className="mr-auto font-mono text-[10px] uppercase tracking-widest text-fg-muted/85">
          {submitting
            ? "rendering — waiting for the next stage to start…"
            : "type below for revision notes · or render"}
        </span>
        {prompt.options.map((opt) => (
          <ActionButton
            key={opt}
            option={opt}
            disabled={submitting}
            onClick={() => handleRespond(opt)}
            inflight={submitting && opt === "render"}
          />
        ))}
      </footer>
    </article>
  );
}
