import { useState } from "react";
import { cn } from "../../lib/cn.js";
import {
  regenerateNarration,
  regenerateComposition,
  rerunRender,
} from "../../lib/agent-client.js";
import type { VideoFormat, VideoType } from "../../lib/types.js";

/**
 * First-class tool buttons in StageHeader. Lets the user fire focused
 * operations (regenerate narration, recompose, re-render) without
 * going through slash commands or chat.
 *
 * Narration uses the new runTool IPC so other scenes' WAVs stay
 * untouched. Composition + render currently delegate to the legacy
 * whole-stage invalidation handlers — they'll be replaced with their
 * own runTool wrappers in Phase 4.
 *
 * Disabled-with-tooltip when prerequisites are unmet so the user
 * always understands why a button is unavailable.
 */
export function ToolBar({
  projectId,
  sessionId,
  videoType,
  formats,
  hasScript,
  hasComposition,
  running,
  onRecomposeFallback,
  onRerenderFallback,
}: {
  projectId: string | undefined;
  sessionId: string | null;
  videoType: VideoType;
  formats: VideoFormat[];
  hasScript: boolean;
  hasComposition: boolean;
  running: boolean;
  /** Used when sessionId is missing — falls back to the legacy
   *  whole-stage invalidation handlers (slashHandlers.onRetryStage). */
  onRecomposeFallback: () => void;
  onRerenderFallback: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const canRunTool = !!projectId && !!sessionId;

  const narrationDisabled = running || !hasScript || !!pending || !canRunTool;
  const composeDisabled = running || !hasScript || !!pending;
  const renderDisabled = running || !hasComposition || !!pending;

  const handleNarration = async () => {
    if (narrationDisabled) return;
    if (!projectId || !sessionId) return;
    setPending("narration");
    try {
      await regenerateNarration(projectId, sessionId);
    } finally {
      setPending(null);
    }
  };

  const handleCompose = async () => {
    if (composeDisabled) return;
    if (!canRunTool) {
      onRecomposeFallback();
      return;
    }
    setPending("composition");
    try {
      await regenerateComposition(projectId!, sessionId!, { videoType, formats });
    } finally {
      setPending(null);
    }
  };

  const handleRender = async () => {
    if (renderDisabled) return;
    if (!canRunTool) {
      onRerenderFallback();
      return;
    }
    setPending("render");
    try {
      await rerunRender(projectId!, sessionId!, formats);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex shrink-0 items-baseline gap-1.5">
      <ToolButton
        onClick={handleNarration}
        disabled={narrationDisabled}
        loading={pending === "narration"}
        title={
          !hasScript
            ? "Needs a script first"
            : running
              ? "Agent is busy — wait for the current run to finish"
              : "Regenerate narration for every scene"
        }
        label="+ narration"
      />
      <ToolButton
        onClick={handleCompose}
        disabled={composeDisabled}
        loading={pending === "composition"}
        title={
          !hasScript
            ? "Needs a script first"
            : running
              ? "Agent is busy"
              : "Re-author the composition for every aspect"
        }
        label="+ composition"
      />
      <ToolButton
        onClick={handleRender}
        disabled={renderDisabled}
        loading={pending === "render"}
        title={
          !hasComposition
            ? "Needs a composition first"
            : running
              ? "Agent is busy"
              : "Re-render every format"
        }
        label="+ render"
      />
    </div>
  );
}

function ToolButton({
  onClick,
  disabled,
  loading,
  title,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
        loading
          ? "border-cyan/40 bg-cyan/8 text-cyan"
          : "border-mist-08 text-fg-muted hover:border-cyan/40 hover:text-cyan",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan/40 disabled:cursor-not-allowed disabled:opacity-40"
      )}
    >
      {loading ? `· ${label.replace(/^\+ /, "")}…` : label}
    </button>
  );
}
