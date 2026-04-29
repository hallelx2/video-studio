import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ActivityStream } from "../agent/ActivityStream.js";
import { StageTimeline } from "../agent/StageTimeline.js";
import { RunMetricsBar } from "../agent/RunMetricsBar.js";
import type { AgentRunState } from "../../lib/agent-state.js";

/**
 * Out-of-the-way modal that surfaces everything a power user might want
 * to see — activity stream, stage timeline, run metrics — without those
 * surfaces fighting for attention on the main Stage. Opens only when the
 * user clicks the `⋯` button in StageHeader.
 *
 * Esc to close. Click on the backdrop to close.
 */
export function DetailsModal({
  open,
  onClose,
  agent,
  onRespondToPrompt,
}: {
  open: boolean;
  onClose: () => void;
  agent: AgentRunState;
  onRespondToPrompt: (response: string) => Promise<void>;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="hairline relative flex h-[80vh] w-[min(900px,90vw)] flex-col border bg-void shadow-2xl"
      >
        <header className="hairline flex items-baseline justify-between border-b px-6 py-3">
          <span className="font-display text-base font-semibold text-fg">Details</span>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
          >
            close · esc
          </button>
        </header>

        <StageTimeline stages={agent.stages} currentStageId={agent.currentStageId} />

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <ActivityStream
            activities={agent.activities}
            pendingPrompt={agent.pendingPrompt}
            onRespondToPrompt={onRespondToPrompt}
            agentState={agent}
          />
        </div>

        <RunMetricsBar
          status={agent.status}
          metrics={agent.metrics}
          toolCallCount={agent.metrics.toolCallCount}
          toolCallErrors={agent.metrics.toolCallErrors}
          assistantBlocks={agent.metrics.assistantBlocks}
        />
      </div>
    </div>,
    document.body
  );
}
