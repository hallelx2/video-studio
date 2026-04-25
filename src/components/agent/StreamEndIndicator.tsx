import { cn } from "../../lib/cn.js";
import {
  formatDuration,
  type AgentRunState,
} from "../../lib/agent-state.js";
import { openPath, revealInFolder } from "../../lib/agent-client.js";

/**
 * Punctuation marker at the bottom of the activity stream when the run has
 * reached a terminal state. Hypatia's stream-end pattern: a small visual
 * boundary that says 'this turn is over' so the user knows whether to
 * type a follow-up, retry, or address an error.
 *
 * States:
 *   - complete + success  → done line with elapsed + tool/message totals
 *                           and clickable links to the rendered MP4s
 *   - complete + needs_input  → awaiting decision (suppressed when an
 *                           InlineApproval is already rendering)
 *   - complete + failed   → soft 'stopped' marker
 *   - error (fatal)       → alarm marker with the message and the failing
 *                           stage
 *
 * Suppressed entirely while running / idle / mid-flight — the metrics bar
 * already carries that signal.
 */
export function StreamEndIndicator({
  state,
  hasInlineApproval,
}: {
  state: AgentRunState;
  hasInlineApproval: boolean;
}) {
  if (state.status === "idle" || state.status === "running") return null;

  // If an inline approval is rendering at the bottom, that IS the end-of-stream
  // signal — don't double-mark.
  if (state.status === "awaiting_input" && hasInlineApproval) return null;

  if (state.status === "error" || state.fatalError) {
    return <ErrorMarker state={state} />;
  }

  if (state.status === "complete" && state.result) {
    if (state.result.status === "success") {
      return <SuccessMarker state={state} />;
    }
    if (state.result.status === "needs_input") {
      // Already-completed needs-input runs (cancelled at a gate) get a quiet marker.
      return <CancelledMarker state={state} />;
    }
    return <FailedMarker state={state} />;
  }

  return null;
}

// ─── Variants ─────────────────────────────────────────────────────────────

function SuccessMarker({ state }: { state: AgentRunState }) {
  const elapsed =
    state.metrics.startedAt !== null && state.metrics.endedAt !== null
      ? state.metrics.endedAt - state.metrics.startedAt
      : null;
  const outputs = state.result?.artifacts?.outputs ?? [];
  const warnings = state.result?.artifacts?.warnings ?? [];

  return (
    <Frame
      tone="success"
      label="done"
      meta={
        <>
          {elapsed !== null && <Stat>{formatDuration(elapsed)}</Stat>}
          <Stat>
            {state.metrics.toolCallCount} tool{state.metrics.toolCallCount === 1 ? "" : "s"}
          </Stat>
          <Stat>
            {state.metrics.assistantBlocks} message
            {state.metrics.assistantBlocks === 1 ? "" : "s"}
          </Stat>
        </>
      }
    >
      {state.result?.message && (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-paper">{state.result.message}</p>
      )}

      {outputs.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-px overflow-hidden rounded border border-paper-mute/15 bg-paper-mute/15">
          {outputs.map((o) => (
            <li
              key={o.format + o.path}
              className="flex items-center justify-between gap-3 bg-ink px-3 py-2"
            >
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
                  {o.format}
                </span>
                <span className="min-w-0 truncate font-mono text-[10px] text-paper-mute">
                  {o.path}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-4">
                <button
                  onClick={() => openPath(o.path).catch(() => undefined)}
                  className="border-b border-cinnabar pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cinnabar hover:text-paper"
                >
                  play →
                </button>
                <button
                  onClick={() => revealInFolder(o.path).catch(() => undefined)}
                  className="font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
                >
                  reveal
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-brass hover:text-paper">
            {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 pl-2">
            {warnings.map((w, i) => (
              <li key={i} className="font-mono text-[11px] text-paper-mute">
                · {w}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Frame>
  );
}

function CancelledMarker({ state }: { state: AgentRunState }) {
  return (
    <Frame tone="muted" label="cancelled" meta={null}>
      <p className="mt-2 text-sm text-paper-mute">
        {state.result?.message ?? "You declined the agent's prompt. Type below to resume with new direction, or pick another video type."}
      </p>
    </Frame>
  );
}

function FailedMarker({ state }: { state: AgentRunState }) {
  return (
    <Frame tone="alarm" label="run failed" meta={null}>
      <p className="mt-2 break-words font-mono text-xs leading-relaxed text-alarm">
        {state.result?.message ?? "The agent stopped without delivering a render."}
      </p>
    </Frame>
  );
}

function ErrorMarker({ state }: { state: AgentRunState }) {
  const scope = state.fatalError?.scope;
  const message =
    state.fatalError?.message ??
    state.result?.message ??
    "An unrecoverable error halted the run.";
  return (
    <Frame
      tone="alarm"
      label="stopped"
      meta={scope ? <Stat>{scope}</Stat> : null}
    >
      <p className="mt-2 break-words font-mono text-xs leading-relaxed text-alarm">{message}</p>
    </Frame>
  );
}

// ─── Frame primitives ─────────────────────────────────────────────────────

function Frame({
  tone,
  label,
  meta,
  children,
}: {
  tone: "success" | "muted" | "alarm";
  label: string;
  meta: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "mt-6 rounded-md border-l-2 bg-ink-raised/40 px-5 py-3",
        tone === "success" && "border-l-cinnabar",
        tone === "muted" && "border-l-brass",
        tone === "alarm" && "border-l-alarm"
      )}
    >
      <header className="flex items-baseline gap-3">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest",
            tone === "success" && "text-cinnabar",
            tone === "muted" && "text-brass",
            tone === "alarm" && "text-alarm"
          )}
        >
          {label}
        </span>
        <span className="hairline h-px flex-1 border-t" aria-hidden />
        {meta && (
          <span className="flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            {meta}
          </span>
        )}
      </header>
      {children}
    </article>
  );
}

function Stat({ children }: { children: React.ReactNode }) {
  return <span className="tabular text-paper">{children}</span>;
}
