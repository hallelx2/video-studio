import {
  CircleCheck,
  Ban,
  AlertTriangle,
  Play,
  ExternalLink,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/cn.js";
import {
  formatDuration,
  type AgentRunState,
} from "../../lib/agent-state.js";
import { openPath, revealInFolder } from "../../lib/agent-client.js";
import { usePreview } from "../../lib/preview-context.js";

/**
 * Punctuation marker at the bottom of the activity stream when the run has
 * reached a terminal state. A small framed card that says "this turn is over"
 * — the user knows whether to type a follow-up, retry, or address an error.
 *
 * States:
 *   - complete + success     → CircleCheck on a cyan-glowing card with elapsed
 *                              + tool/message totals and clickable links to
 *                              the rendered MP4s.
 *   - complete + needs_input → quiet Ban marker (suppressed when an
 *                              InlineApproval is rendering already).
 *   - complete + failed      → muted Ban marker.
 *   - error (fatal)          → AlertTriangle on a brutalist-shadowed card.
 *
 * Suppressed entirely while running / idle — the metrics bar already carries
 * that signal.
 */
export function StreamEndIndicator({
  state,
  hasInlineApproval,
}: {
  state: AgentRunState;
  hasInlineApproval: boolean;
}) {
  if (state.status === "idle" || state.status === "running") return null;
  if (state.status === "awaiting_input" && hasInlineApproval) return null;

  if (state.status === "error" || state.fatalError) {
    return <ErrorMarker state={state} />;
  }

  if (state.status === "complete" && state.result) {
    if (state.result.status === "success") return <SuccessMarker state={state} />;
    if (state.result.status === "needs_input") return <CancelledMarker state={state} />;
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
      icon={CircleCheck}
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
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-fg">{state.result.message}</p>
      )}

      {outputs.length > 0 && <OutputsList outputs={outputs} />}

      {warnings.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-fg-faint hover:text-fg">
            {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 pl-2">
            {warnings.map((w, i) => (
              <li key={i} className="font-mono text-[11px] text-fg-muted">
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
    <Frame tone="muted" icon={Ban} label="cancelled" meta={null}>
      <p className="mt-2 text-[13px] text-fg-muted">
        {state.result?.message ??
          "You declined the agent's prompt. Type below to resume with new direction, or pick another video type."}
      </p>
    </Frame>
  );
}

function FailedMarker({ state }: { state: AgentRunState }) {
  return (
    <Frame tone="alarm" icon={Ban} label="run failed" meta={null}>
      <p className="mt-2 break-words font-mono text-[12px] leading-relaxed text-alarm">
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

  // The bridge folds the recent stderr tail into the message after a double
  // newline. Split so the headline renders as text and the tail as a mono
  // pre-block — much more useful than one blob.
  const [headline, ...tailParts] = message.split(/\n\n/);
  const tail = tailParts.join("\n\n");

  return (
    <Frame
      tone="alarm"
      icon={AlertTriangle}
      label="stopped"
      meta={scope ? <Stat>{scope}</Stat> : null}
      brutalist
    >
      <p className="mt-2 break-words text-[13px] leading-relaxed text-alarm">{headline}</p>
      {tail && (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-alarm/30 bg-alarm/[0.06] p-3 font-mono text-[11px] leading-relaxed text-alarm">
          {tail}
        </pre>
      )}
    </Frame>
  );
}

// ─── Frame primitives ─────────────────────────────────────────────────────

function Frame({
  tone,
  icon: Icon,
  label,
  meta,
  brutalist = false,
  children,
}: {
  tone: "success" | "muted" | "alarm";
  icon: LucideIcon;
  label: string;
  meta: React.ReactNode;
  brutalist?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "mt-6 rounded border p-4 transition-shadow",
        // Tone — borders & backgrounds
        tone === "success" && [
          "border-cyan/30 bg-cyan/[0.04]",
          // Bioluminescent halo behind the success card — the "render
          // delivered" cinematic moment.
          "[background-image:radial-gradient(ellipse_at_top_left,var(--color-cyan-glow)_0%,transparent_55%),linear-gradient(0deg,transparent,transparent)]",
        ],
        tone === "muted" && "border-mist-10 bg-surface/40",
        tone === "alarm" && "border-alarm/40 bg-alarm/[0.04]",
        brutalist && "shadow-brutalist"
      )}
    >
      <header className="flex items-baseline gap-3">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1",
            tone === "success" && "bg-cyan/[0.12] text-cyan ring-cyan/40",
            tone === "muted" && "bg-mist-04 text-fg-muted ring-mist-10",
            tone === "alarm" && "bg-alarm/[0.10] text-alarm ring-alarm/30"
          )}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.18em]",
            tone === "success" && "text-cyan",
            tone === "muted" && "text-fg-faint",
            tone === "alarm" && "text-alarm"
          )}
        >
          {label}
        </span>
        <span className="h-px flex-1 bg-mist-08" aria-hidden />
        {meta && (
          <span className="flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {meta}
          </span>
        )}
      </header>
      {children}
    </article>
  );
}

function Stat({ children }: { children: React.ReactNode }) {
  return <span className="tabular text-fg">{children}</span>;
}

/**
 * Per-format outputs list. Each row gets:
 *   - Play (inline)  : open the MP4 in the slide-in PreviewPanel.
 *   - In player      : pop out to the OS's default video player.
 *   - Reveal         : show the file in Finder / Explorer.
 *
 * The user picks which surface they want; the inline player is the default
 * because they shouldn't have to leave Composio to watch what they rendered.
 */
function OutputsList({
  outputs,
}: {
  outputs: Array<{ format: string; path: string }>;
}) {
  const { openVideo } = usePreview();
  return (
    <ul className="mt-3 overflow-hidden rounded border border-mist-10 divide-y divide-mist-08">
      {outputs.map((o) => (
        <li
          key={o.format + o.path}
          className="flex items-center justify-between gap-3 bg-surface/60 px-3 py-2"
        >
          <span className="flex min-w-0 items-baseline gap-3">
            <span className="inline-flex shrink-0 items-baseline rounded-full border border-cyan/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan">
              {o.format}
            </span>
            <span className="min-w-0 truncate font-mono text-[11px] text-fg-muted">{o.path}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <ActionButton
              icon={Play}
              label="play"
              onClick={() => openVideo({ filePath: o.path, format: o.format })}
              title="Play inline in the preview panel"
              tone="cyan"
            />
            <ActionButton
              icon={ExternalLink}
              label="open"
              onClick={() => openPath(o.path).catch(() => undefined)}
              title="Open in your default video player"
            />
            <ActionButton
              icon={FolderOpen}
              label="reveal"
              onClick={() => revealInFolder(o.path).catch(() => undefined)}
              title="Show in Finder / Explorer"
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  title,
  tone = "muted",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  title: string;
  tone?: "muted" | "cyan";
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
        tone === "cyan" &&
          "border-cyan/30 text-cyan hover:border-cyan/60 hover:bg-cyan/[0.06]",
        tone === "muted" &&
          "border-mist-08 text-fg-muted hover:border-mist-12 hover:bg-mist-04 hover:text-fg"
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
