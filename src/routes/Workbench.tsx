import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  cancelAgent,
  generateVideo,
  getConfig,
  isAgentRunning,
  onAgentEvent,
  respondToPrompt,
  stopPreview,
} from "../lib/agent-client.js";
import {
  FORMAT_OPTIONS,
  VIDEO_TYPES,
  type AgentEvent,
  type VideoFormat,
  type VideoType,
} from "../lib/types.js";
import { cn } from "../lib/cn.js";
import { deriveAgentState } from "../lib/agent-state.js";
import { StageTimeline } from "../components/agent/StageTimeline.js";
import { ActivityStream } from "../components/agent/ActivityStream.js";
import { RunMetricsBar } from "../components/agent/RunMetricsBar.js";
import { Composer } from "../components/agent/Composer.js";
import { ArtifactPanel } from "../components/agent/ArtifactPanel.js";

/**
 * Chat-shaped workbench.
 *
 * Right pane is a conversation with an always-live composer at the bottom.
 * The user can type at any time; behavior adapts to the agent's current state:
 *
 *   - idle / complete / error : send starts a new run
 *   - running                 : send cancels the current run, restarts with combined brief
 *   - awaiting_input          : send becomes revision notes for the pending prompt
 *
 * Approval buttons render INLINE at the end of the activity stream when there's
 * a pending prompt — not in a separate dock. The user can also just type into
 * the composer and the text becomes revision notes (the agent task accepts any
 * non-{approve,cancel} response as notes).
 */
export function WorkbenchRoute() {
  const { productId } = useParams<{ productId: string }>();

  const [videoType, setVideoType] = useState<VideoType>("product-launch");
  const [formats, setFormats] = useState<VideoFormat[]>(["linkedin", "x"]);

  /** Brief carried across runs — the "context" the agent reads when invoked. */
  const briefRef = useRef<string>("");

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);

  // Hydrate defaults from config + sync with the bridge's actual run state.
  // The local `running` flag can drift if the renderer remounts (HMR, route
  // changes) while the main-process bridge still has a live child.
  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setVideoType(cfg.defaultVideoType);
        setFormats(cfg.defaultFormats);
      })
      .catch(() => undefined);
    isAgentRunning()
      .then((r) => {
        if (r) setRunning(true);
      })
      .catch(() => undefined);
  }, []);

  // Subscribe to agent events.
  useEffect(() => {
    const unsubscribe = onAgentEvent((event) => {
      setEvents((prev) => [...prev, event]);
      if (event.type === "result") setRunning(false);
      if (event.type === "error" && event.recoverable === false) setRunning(false);
    });
    return unsubscribe;
  }, []);

  const agent = useMemo(() => deriveAgentState(events), [events]);

  const toggleFormat = (f: VideoFormat) => {
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  /** Push a synthetic user_message event so it appears in the stream. */
  const pushUserMessage = useCallback(
    (text: string, kind: "brief" | "interrupt" | "approval-response" | "follow-up") => {
      setEvents((prev) => [...prev, { type: "user_message", text, kind }]);
    },
    []
  );

  /** Kick off a generate run with the current brief + extra context. */
  const startRun = useCallback(
    async (brief: string) => {
      if (!productId) return;
      briefRef.current = brief;
      setRunning(true);
      try {
        await generateVideo({
          projectId: productId,
          videoType,
          formats,
          brief: brief.trim() || undefined,
        });
      } catch (err) {
        setEvents((prev) => [
          ...prev,
          { type: "error", message: String(err), scope: "renderer", recoverable: false },
        ]);
        setRunning(false);
      }
    },
    [productId, videoType, formats]
  );

  /** Respond to the agent's pending prompt. Free text becomes revision notes. */
  const handlePromptResponse = useCallback(
    async (response: string) => {
      if (!agent.pendingPrompt) return;
      // Show user-side intent in the stream when it's free-form notes.
      if (response !== "approve" && response !== "cancel" && response.trim()) {
        pushUserMessage(response, "approval-response");
      }
      await respondToPrompt(agent.pendingPrompt.id, response);
    },
    [agent.pendingPrompt, pushUserMessage]
  );

  /** Composer submit — state-aware dispatch. */
  const handleComposerSubmit = useCallback(
    async (text: string) => {
      // 1. Awaiting input — send as revision notes / answer.
      if (agent.pendingPrompt) {
        await handlePromptResponse(text);
        return;
      }

      // 2. Always check the BRIDGE's actual state, not just our local flag.
      // The local flag can drift if the renderer remounts mid-run, leaving us
      // thinking we're idle when there's still a child process.
      const actuallyRunning = await isAgentRunning().catch(() => false);

      // 3. Running — interrupt and restart with combined brief.
      if (actuallyRunning) {
        pushUserMessage(text, "interrupt");
        await cancelAgent();
        setRunning(false);
        const combined = [briefRef.current, text].filter(Boolean).join("\n\n[INTERRUPT] ");
        await startRun(combined);
        return;
      }

      // 4. Idle / complete / error — start a fresh run.
      // History is NEVER cleared (Hypatia pattern). New runs append; the user
      // sees the full conversation across runs in one continuous stream.
      const hasPriorRun = events.some((e) => e.type === "result" || e.type === "error");
      const isFollowUp = hasPriorRun;
      pushUserMessage(text, isFollowUp ? "follow-up" : "brief");

      // Carry context forward across runs.
      const nextBrief = isFollowUp
        ? [briefRef.current, text].filter(Boolean).join("\n\n[FOLLOW-UP] ")
        : text;

      await startRun(nextBrief);
    },
    [agent.pendingPrompt, events, handlePromptResponse, pushUserMessage, startRun]
  );

  const handleStop = useCallback(async () => {
    await cancelAgent();
    await stopPreview().catch(() => undefined);
    setRunning(false);
  }, []);

  const typeMeta = useMemo(() => VIDEO_TYPES.find((t) => t.id === videoType)!, [videoType]);
  const hasHistory = events.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="hairline flex items-baseline justify-between border-b px-12 py-7">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            workbench
          </p>
          <h1 className="display-sm mt-1 text-4xl text-paper">{productId}</h1>
        </div>
        <Link
          to="/"
          className="font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
        >
          ← all projects
        </Link>
      </header>

      {/* ─── Body: scaffold rail (left) + chat inspector (right) ────────── */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hairline flex w-[300px] shrink-0 flex-col gap-8 overflow-y-auto border-r px-7 py-8 stagger-children">
          <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            scaffold
          </p>

          <Field eyebrow="01" title="Video type">
            <div className="grid grid-cols-1 gap-px border border-brass-line bg-brass-line">
              {VIDEO_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setVideoType(t.id as VideoType)}
                  disabled={running}
                  className={cn(
                    "block bg-ink px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    videoType === t.id ? "bg-ink-edge" : "enabled:hover:bg-ink-raised"
                  )}
                >
                  <span className="flex items-baseline justify-between">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={
                          videoType === t.id
                            ? "h-1.5 w-1.5 rounded-full bg-cinnabar"
                            : "h-1.5 w-1.5"
                        }
                      />
                      <span className="text-sm font-medium text-paper">{t.label}</span>
                    </span>
                    <span className="font-mono text-[10px] tabular text-paper-mute">
                      {t.defaultScenes}/{t.defaultDuration}s
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-paper-mute">{typeMeta.description}</p>
          </Field>

          <Field eyebrow="02" title="Formats">
            <div className="grid grid-cols-1 gap-px border border-brass-line bg-brass-line">
              {FORMAT_OPTIONS.map((f) => {
                const on = formats.includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFormat(f.id)}
                    disabled={running}
                    className={cn(
                      "flex items-center justify-between bg-ink px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      on ? "bg-ink-edge" : "enabled:hover:bg-ink-raised"
                    )}
                  >
                    <span className="flex items-baseline gap-2">
                      <span
                        className={on ? "h-1.5 w-1.5 rounded-full bg-cinnabar" : "h-1.5 w-1.5"}
                      />
                      <span className="text-sm font-medium text-paper">{f.label}</span>
                    </span>
                    <span className="font-mono text-[10px] tabular text-paper-mute">
                      {f.aspect}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          <p className="mt-auto pt-6 font-mono text-[10px] leading-relaxed text-paper-mute/70">
            scaffold pre-fills the agent's defaults. type into the chat to give a
            specific brief, interrupt mid-run, or follow up after a render.
          </p>
        </aside>

        {/* ─── Chat inspector ──────────────────────────────────────────── */}
        <section className="flex flex-1 flex-col overflow-hidden">
          <StageTimeline stages={agent.stages} currentStageId={agent.currentStageId} />
          <div className="relative flex-1 overflow-hidden">
            <ActivityStream
              activities={agent.activities}
              pendingPrompt={agent.pendingPrompt}
              onRespondToPrompt={handlePromptResponse}
            />
            {!hasHistory && !running && <EmptyHero typeMeta={typeMeta} project={productId ?? ""} />}
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
            onSubmit={handleComposerSubmit}
            onStop={handleStop}
            projectName={productId ?? "this project"}
          />
        </section>

        {/* ─── Artifact panel (auto-shows when files exist) ──────────────── */}
        <ArtifactPanel artifacts={agent.artifacts} />
      </div>
    </div>
  );
}

function EmptyHero({
  typeMeta,
  project,
}: {
  typeMeta: { label: string; defaultScenes: number; defaultDuration: number };
  project: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/95 px-12">
      <div className="max-w-lg">
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          ready · workbench · {project}
        </p>
        <p className="display mt-4 text-5xl text-paper">
          What should we make?
        </p>
        <p className="mt-6 text-sm leading-relaxed text-paper-mute">
          Type below to brief the agent. The scaffold on the left is pre-set to a{" "}
          <span className="text-paper">{typeMeta.label.toLowerCase()}</span> —{" "}
          {typeMeta.defaultScenes} scenes, ~{typeMeta.defaultDuration}s — but the chat
          overrides everything. You can interrupt mid-run, request changes inline, and
          follow up after a render.
        </p>
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
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        <span className="text-cinnabar">{eyebrow}</span>{" "}
        <span className="text-paper-mute">/ {title.toLowerCase()}</span>
      </p>
      {children}
    </div>
  );
}
