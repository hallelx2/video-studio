import { useActivityVerb } from "../../lib/activity-verbs.js";
import type { ActivityState } from "../../lib/types.js";
import type { AgentRunState } from "../../lib/agent-state.js";

/**
 * Banner that lives above the SceneStrip and surfaces agent-wide state
 * the user needs to know about *without* opening the details modal:
 *
 * - errored:        red banner with the message + "try again" CTA
 * - awaiting input: amber banner with "approval needed" + "open" CTA
 * - running, no scenes yet (early stages): "starting…" with verb
 * - everything else: renders nothing
 *
 * The whole point: a non-technical user shouldn't have to click ⋯ to
 * discover that the agent crashed. The Canvas can be empty while
 * scenes form, but the user must always see *why* nothing's happening.
 */
export function StageStatus({
  agent,
  globalActivity,
  hasScenes,
  onRetry,
  onOpenDetails,
}: {
  agent: AgentRunState;
  globalActivity: ActivityState | null;
  hasScenes: boolean;
  onRetry: () => void;
  onOpenDetails: () => void;
}) {
  const errored = agent.status === "error" || !!agent.fatalError;
  const awaitingApproval = agent.status === "awaiting_input" && !!agent.pendingPrompt;
  const startingUp = agent.status === "running" && !hasScenes;

  if (errored) {
    return (
      <ErrorBanner
        message={agent.fatalError?.message ?? "Agent stopped unexpectedly."}
        scope={agent.fatalError?.scope ?? null}
        onRetry={onRetry}
        onOpenDetails={onOpenDetails}
      />
    );
  }
  if (awaitingApproval) {
    return (
      <ApprovalBanner
        question={agent.pendingPrompt!.question}
        onOpenDetails={onOpenDetails}
      />
    );
  }
  if (startingUp) {
    return <StartingBanner activity={globalActivity} />;
  }
  return null;
}

function ErrorBanner({
  message,
  scope,
  onRetry,
  onOpenDetails,
}: {
  message: string;
  scope: string | null;
  onRetry: () => void;
  onOpenDetails: () => void;
}) {
  // Trim the long stack-trace blobs that come from agent-exit messages —
  // the user just needs the headline, the full trace is one click away.
  const headline = compactErrorMessage(message);
  return (
    <div className="border-b border-alarm/30 bg-alarm/8 px-6 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-alarm">
            {scope ? `agent · ${scope}` : "agent stopped"}
          </p>
          <p className="mt-1 truncate font-display text-sm text-fg" title={message}>
            {headline}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-3">
          <button
            onClick={onOpenDetails}
            className="font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
          >
            see what happened →
          </button>
          <button
            onClick={onRetry}
            className="border border-alarm/50 bg-alarm/12 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-alarm transition-colors hover:bg-alarm/20"
          >
            try again
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalBanner({
  question,
  onOpenDetails,
}: {
  question: string;
  onOpenDetails: () => void;
}) {
  return (
    <div className="border-b border-cyan/30 bg-cyan/6 px-6 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan">
            approval needed
          </p>
          <p className="mt-1 truncate font-display text-sm text-fg" title={question}>
            {question}
          </p>
        </div>
        <button
          onClick={onOpenDetails}
          className="border border-cyan/50 bg-cyan/12 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20"
        >
          open →
        </button>
      </div>
    </div>
  );
}

function StartingBanner({ activity }: { activity: ActivityState | null }) {
  const { verb, cycleKey } = useActivityVerb(activity ?? "considering");
  return (
    <div className="hairline flex items-baseline justify-between gap-4 border-b px-6 py-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
          getting started
        </p>
        <p className="mt-1 font-display text-sm text-fg-muted">
          {verb ? (
            <span key={cycleKey} className="animate-verb-fade italic">
              {verb}
              <span className="ml-1 inline-block animate-verb-dots">…</span>
            </span>
          ) : (
            <span className="italic">Setting up…</span>
          )}
        </p>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
        scenes will appear once the script lands
      </p>
    </div>
  );
}

function compactErrorMessage(raw: string): string {
  // Strip ANSI escapes, then find the most signal-y line:
  //   1. anything starting with "Error:" / "TypeError:" / "ReferenceError:"
  //   2. anything containing a recognizable hint ("not installed",
  //      "Cannot find", "ENOENT", "permission denied")
  //   3. fall back to the first line that isn't a stack-trace frame
  //   4. if all else fails, the raw first line truncated to 140
  const stripped = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
  const lines = stripped.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  const errorRegex = /^(?:[A-Z][a-zA-Z]*Error|Uncaught|FATAL):/;
  const hintTokens = [
    "not installed",
    "cannot find",
    "Cannot find",
    "ENOENT",
    "EACCES",
    "permission denied",
    "ReferenceError",
    "SyntaxError",
    "exited with code",
  ];

  const direct = lines.find((l) => errorRegex.test(l));
  if (direct) return cap(direct);

  const hinted = lines.find((l) => hintTokens.some((t) => l.includes(t)));
  if (hinted) return cap(hinted);

  const nonTrace = lines.find((l) => !/^at /.test(l) && !/^\s*\d+\s*\|/.test(l));
  if (nonTrace) return cap(nonTrace);

  return cap(lines[0] ?? raw);
}

function cap(s: string): string {
  return s.length <= 140 ? s : s.slice(0, 137) + "…";
}
