import { useMemo, useState } from "react";
import { useWorkbenchSession } from "../lib/use-workbench-session.js";
import { useSceneState } from "../lib/scene-state.js";
import { SessionSidebar } from "../components/agent/SessionSidebar.js";
import { ArtifactPanel } from "../components/agent/ArtifactPanel.js";
import { Composer } from "../components/agent/Composer.js";
import { EmptyComposerState } from "../components/agent/EmptyComposerState.js";
import { StageHeader } from "../components/stage/StageHeader.js";
import { Canvas } from "../components/stage/Canvas.js";
import { SceneStrip } from "../components/stage/SceneStrip.js";
import { RenderStrip } from "../components/stage/RenderStrip.js";
import { DetailsModal } from "../components/stage/DetailsModal.js";
import { StageStatus } from "../components/stage/StageStatus.js";
import { StageRibbon } from "../components/stage/StageRibbon.js";
import { StageInlineApproval } from "../components/stage/StageInlineApproval.js";

/**
 * Preview-first studio layout. Replaces Workbench's chat-shaped main
 * surface with: header (project + format pills + ⋯), Canvas (active
 * scene's composition iframe, letterboxed), SceneStrip (horizontal
 * carousel below canvas), RenderStrip (rendered MP4s), CommandBar
 * (pinned bottom). Activity stream / tools / logs all live inside
 * DetailsModal — out of the way until needed.
 *
 * Same `useWorkbenchSession` hook as the legacy Workbench drives every
 * piece of state, so the two surfaces can't drift on event handling
 * or persistence semantics.
 */
export function StageRoute({
  projectIdOverride,
}: {
  projectIdOverride?: string;
} = {}) {
  const session = useWorkbenchSession({ projectIdOverride });
  const {
    productId,
    sessions,
    currentSession,
    videoType,
    formats,
    modelId,
    personaId,
    running,
    events,
    agent,
    hasHistory,
    setVideoType,
    toggleFormat,
    handleModelChange,
    handlePersonaChange,
    handleSelectSession,
    handleCreateSession,
    handleRenameSession,
    handleDeleteSession,
    handleComposerSubmit,
    handlePromptResponse,
    handlePickVideoType,
    handleStop,
    slashHandlers,
  } = session;

  const { scenes, globalActivity, latestCompositionPath } = useSceneState(events);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // ArtifactPanel defaults collapsed to a slim icon rail. The panel sits
  // on the right edge competing with the Canvas for width — keeping it
  // closed by default reclaims ~360px so the canvas can breathe. Click
  // the rail's icon to expand the full panel inline.
  const [artifactsExpanded, setArtifactsExpanded] = useState(false);

  // Default the active scene to the first one once scenes hydrate.
  const activeScene = useMemo(() => {
    if (scenes.length === 0) return null;
    if (activeSceneId) {
      const found = scenes.find((s) => s.id === activeSceneId);
      if (found) return found;
    }
    return scenes[0];
  }, [scenes, activeSceneId]);

  const formatHint = formats[0] ?? "linkedin";
  // Workspace path is the dirname of the script.json that produced the scenes,
  // if we have one; useful for the empty-canvas placeholder copy.
  const workspacePath = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type !== "agent_tool_use" || e.tool !== "Write") continue;
      const inp = e.input as { file_path?: string } | null;
      const fp = inp?.file_path;
      if (typeof fp === "string" && /script\.json$/i.test(fp)) {
        const idx = Math.max(fp.lastIndexOf("/"), fp.lastIndexOf("\\"));
        return idx >= 0 ? fp.slice(0, idx) : null;
      }
    }
    return null;
  }, [events]);

  const verbForGlobal = globalActivity ? capitalize(globalActivity) : null;

  return (
    <div className="flex h-full overflow-hidden">
      <SessionSidebar
        projectId={productId ?? ""}
        current={currentSession}
        sessions={sessions}
        onSelect={handleSelectSession}
        onCreateNew={handleCreateSession}
        onRename={handleRenameSession}
        onDelete={handleDeleteSession}
      />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div className="hairline flex min-w-0 flex-1 flex-col border-r-0">
          <StageHeader
            projectName={productId ?? "this project"}
            sessionTitle={currentSession?.title}
            videoType={videoType}
            formats={formats}
            running={running}
            globalActivity={verbForGlobal}
            onChangeVideoType={setVideoType}
            onToggleFormat={toggleFormat}
            onOpenDetails={() => setDetailsOpen(true)}
          />

          {hasHistory ? (
            <>
              <StageStatus
                agent={agent}
                globalActivity={globalActivity}
                hasScenes={scenes.length > 0}
                onRetry={() => slashHandlers.onRetryStage("redraft")}
                onOpenDetails={() => setDetailsOpen(true)}
              />
              <StageRibbon
                stages={agent.stages}
                currentStageId={agent.currentStageId}
                onOpenDetails={() => setDetailsOpen(true)}
              />
              {agent.pendingPrompt && (
                <StageInlineApproval
                  prompt={agent.pendingPrompt}
                  onRespond={handlePromptResponse}
                  onOpenDetails={() => setDetailsOpen(true)}
                />
              )}
              <Canvas
                activeScene={activeScene}
                formatHint={formatHint}
                workspacePath={workspacePath}
                fallbackCompositionPath={latestCompositionPath}
              />
              <SceneStrip
                scenes={scenes}
                activeSceneId={activeScene?.id ?? null}
                onSelectScene={setActiveSceneId}
                onRewrite={() => slashHandlers.onRetryStage("redraft")}
                onReRecord={() => slashHandlers.onRetryStage("renarrate")}
                onRestage={() => slashHandlers.onRetryStage("recompose")}
                disabled={running}
              />
              <RenderStrip
                agent={agent}
                onRenderAgain={() => slashHandlers.onRetryStage("rerender")}
                disabled={running}
              />
              <Composer
                status={agent.status}
                hasPendingPrompt={!!agent.pendingPrompt}
                hasHistory={hasHistory}
                modelId={modelId}
                personaId={personaId}
                artifacts={agent.artifacts}
                onModelChange={handleModelChange}
                onPersonaChange={handlePersonaChange}
                onSubmit={handleComposerSubmit}
                onStop={handleStop}
                projectName={productId ?? "this project"}
                slashHandlers={slashHandlers}
              />
            </>
          ) : (
            <section className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <EmptyComposerState
                  projectName={productId ?? "this project"}
                  onPick={handlePickVideoType}
                />
              </div>
              <Composer
                status={agent.status}
                hasPendingPrompt={!!agent.pendingPrompt}
                hasHistory={false}
                modelId={modelId}
                personaId={personaId}
                artifacts={agent.artifacts}
                onModelChange={handleModelChange}
                onPersonaChange={handlePersonaChange}
                onSubmit={handleComposerSubmit}
                onStop={handleStop}
                projectName={productId ?? "this project"}
                slashHandlers={slashHandlers}
              />
            </section>
          )}
        </div>

        {artifactsExpanded ? (
          <div className="relative flex h-full">
            <button
              onClick={() => setArtifactsExpanded(false)}
              aria-label="Collapse artifacts panel"
              title="Collapse"
              className="absolute -left-3 top-3 z-10 flex h-6 w-6 items-center justify-center border border-mist-08 bg-void font-mono text-[11px] text-fg-muted hover:border-mist-12 hover:text-fg"
            >
              ›
            </button>
            <ArtifactPanel artifacts={agent.artifacts} projectId={productId} />
          </div>
        ) : (
          <button
            onClick={() => setArtifactsExpanded(true)}
            aria-label="Expand artifacts panel"
            title={`${agent.artifacts.length} artifact${agent.artifacts.length === 1 ? "" : "s"}`}
            className="hairline flex w-12 shrink-0 flex-col items-center gap-3 border-l py-4 font-mono text-[10px] uppercase tracking-widest text-fg-faint transition-colors hover:text-fg-muted"
          >
            <span className="text-fg-muted">‹</span>
            <span
              style={{ writingMode: "vertical-rl" }}
              className="rotate-180 select-none"
            >
              artifacts {agent.artifacts.length > 0 ? `· ${agent.artifacts.length}` : ""}
            </span>
          </button>
        )}
      </div>

      <DetailsModal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        agent={agent}
        onRespondToPrompt={handlePromptResponse}
      />
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
