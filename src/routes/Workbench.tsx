import {
  FORMAT_OPTIONS,
  VIDEO_TYPES,
  type VideoFormat,
  type VideoType,
} from "../lib/types.js";
import { cn } from "../lib/cn.js";
import { useWorkbenchSession } from "../lib/use-workbench-session.js";
import { StageTimeline } from "../components/agent/StageTimeline.js";
import { ActivityStream } from "../components/agent/ActivityStream.js";
import { RunMetricsBar } from "../components/agent/RunMetricsBar.js";
import { Composer } from "../components/agent/Composer.js";
import { ArtifactPanel } from "../components/agent/ArtifactPanel.js";
import { SessionSidebar } from "../components/agent/SessionSidebar.js";
import { EmptyComposerState } from "../components/agent/EmptyComposerState.js";

/**
 * Chat-shaped workbench with multiple sessions per project.
 *
 * State + run lifecycle live in `useWorkbenchSession` so this file is pure
 * composition. The same hook drives the new preview-first `Stage` route —
 * keeping the two surfaces in lock-step is the point of the extraction.
 */
export function WorkbenchRoute({
  projectIdOverride,
  variant,
}: {
  projectIdOverride?: string;
  variant?: "workbench" | "playground";
} = {}) {
  void variant;
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
    agent,
    typeMeta,
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

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Sessions sidebar (always-visible, leftmost) ────────────────── */}
      <SessionSidebar
        projectId={productId ?? ""}
        current={currentSession}
        sessions={sessions}
        onSelect={handleSelectSession}
        onCreateNew={handleCreateSession}
        onRename={handleRenameSession}
        onDelete={handleDeleteSession}
      />

      {/* ─── Workbench body (the rest of the columns) ──────────────────── */}
      {/* min-w-0 chain is critical: without it, a long bash command or file
          path inside ActivityStream forces every flex parent to expand to
          fit its intrinsic width, pushing ArtifactPanel off the right edge.
          With min-w-0 the children can actually shrink and `truncate`
          kicks in to add ellipsis. */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div className="hairline flex min-w-0 flex-1 flex-col border-r-0">

      {/* Inner header — session title (only shown when there's a session) */}
      {currentSession && (
        <header className="hairline flex items-baseline justify-between gap-8 border-b px-10 py-5">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              session
            </p>
            <h1 className="display-sm mt-1 truncate text-2xl text-fg">
              {currentSession.title}
            </h1>
          </div>
        </header>
      )}

      {/* Body — empty state when no events; full workbench once events exist */}
      {hasHistory ? (
        <div className="flex min-w-0 flex-1 overflow-hidden">
          <aside className="hairline flex w-[280px] shrink-0 flex-col gap-8 overflow-y-auto border-r px-6 py-8 stagger-children">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              scaffold
            </p>

            <Field eyebrow="01" title="Video type">
              <div className="grid grid-cols-1 gap-px border border-mist-10 bg-mist-10">
                {VIDEO_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setVideoType(t.id as VideoType)}
                    disabled={running}
                    className={cn(
                      "block bg-void px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      videoType === t.id ? "bg-elevated" : "enabled:hover:bg-surface"
                    )}
                  >
                    <span className="flex items-baseline justify-between">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={
                            videoType === t.id
                              ? "h-1.5 w-1.5 rounded-full bg-cyan"
                              : "h-1.5 w-1.5"
                          }
                        />
                        <span className="text-sm font-medium text-fg">{t.label}</span>
                      </span>
                      <span className="font-mono text-[10px] tabular text-fg-muted">
                        {t.defaultScenes}/{t.defaultDuration}s
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-fg-muted">{typeMeta.description}</p>
            </Field>

            <Field eyebrow="02" title="Formats">
              <div className="grid grid-cols-1 gap-px border border-mist-10 bg-mist-10">
                {FORMAT_OPTIONS.map((f) => {
                  const on = formats.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFormat(f.id as VideoFormat)}
                      disabled={running}
                      className={cn(
                        "flex items-center justify-between bg-void px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        on ? "bg-elevated" : "enabled:hover:bg-surface"
                      )}
                    >
                      <span className="flex items-baseline gap-2">
                        <span
                          className={on ? "h-1.5 w-1.5 rounded-full bg-cyan" : "h-1.5 w-1.5"}
                        />
                        <span className="text-sm font-medium text-fg">{f.label}</span>
                      </span>
                      <span className="font-mono text-[10px] tabular text-fg-muted">
                        {f.aspect}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <p className="mt-auto pt-6 font-mono text-[10px] leading-relaxed text-fg-muted/85">
              type into the chat to interrupt mid-run or follow up after a render.
            </p>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <StageTimeline stages={agent.stages} currentStageId={agent.currentStageId} />
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <ActivityStream
                activities={agent.activities}
                pendingPrompt={agent.pendingPrompt}
                onRespondToPrompt={handlePromptResponse}
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
          </section>

          <ArtifactPanel artifacts={agent.artifacts} projectId={productId} />
        </div>
      ) : (
        // ─── Empty state (no events yet) ─────────────────────────────────
        // Just the pill grid + composer. No scaffold rail, no stage timeline,
        // no metrics bar — the user picks a video type to begin.
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
      </div>
    </div>
  );
}

function Field({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        <span className="text-cyan">{eyebrow}</span>{" "}
        <span className="text-fg-muted">/ {title.toLowerCase()}</span>
      </p>
      {children}
    </div>
  );
}
