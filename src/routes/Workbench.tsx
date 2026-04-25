import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  cancelAgent,
  createSession as ipcCreateSession,
  deleteSession as ipcDeleteSession,
  generateVideo,
  getConfig,
  isAgentRunning,
  listSessions as ipcListSessions,
  loadSession as ipcLoadSession,
  onAgentEvent,
  renameSession as ipcRenameSession,
  respondToPrompt,
  saveConfig,
  saveSession as ipcSaveSession,
  stopPreview,
} from "../lib/agent-client.js";
import {
  DEFAULT_CONFIG,
  FORMAT_OPTIONS,
  VIDEO_TYPES,
  type AgentEvent,
  type AppConfig,
  type SessionMeta,
  type SessionScaffold,
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
import { SessionSwitcher } from "../components/agent/SessionSwitcher.js";

/**
 * Chat-shaped workbench with multiple sessions per project.
 *
 * Each project can hold many sessions — one per video the user is working on.
 * A session bundles the scaffold (videoType / formats / model) with its event
 * log, so switching sessions restores the entire state.
 *
 * Persistence:
 * - On mount: list sessions for this project. Load most recent, or create
 *   a fresh one if none exist.
 * - On every event arrival: debounced save (300ms) to the current session.
 * - On scaffold change (videoType / formats / model): immediate save.
 *
 * The Composer is always live; behavior adapts to agent state. The center
 * pane's empty hero exposes a 'Build' action so the user can kick off a
 * default run without typing — chat is reserved for actual instructions.
 */
export function WorkbenchRoute() {
  const { productId } = useParams<{ productId: string }>();

  // ─── Scaffold state ─────────────────────────────────────────────────
  const [videoType, setVideoType] = useState<VideoType>("product-launch");
  const [formats, setFormats] = useState<VideoFormat[]>(["linkedin", "x"]);
  const [modelId, setModelId] = useState<string>(DEFAULT_CONFIG.selectedModel);
  const configRef = useRef<AppConfig | null>(null);

  // ─── Session state ──────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  // Becomes true after first session is loaded — gates persistence so we
  // don't clobber a session before its events have been hydrated.
  const [sessionReady, setSessionReady] = useState(false);

  // ─── Run state ──────────────────────────────────────────────────────
  const briefRef = useRef<string>("");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId]
  );

  // ─── Bootstrap: hydrate config + load sessions ──────────────────────
  useEffect(() => {
    if (!productId) return;

    const bootstrap = async () => {
      const cfg = await getConfig().catch(() => DEFAULT_CONFIG);
      configRef.current = cfg;

      // List existing sessions
      const existing = await ipcListSessions(productId).catch(() => [] as SessionMeta[]);

      if (existing.length === 0) {
        // No sessions yet — create one with current config defaults.
        const scaffold: SessionScaffold = {
          videoType: cfg.defaultVideoType,
          formats: cfg.defaultFormats,
          modelId: cfg.selectedModel ?? DEFAULT_CONFIG.selectedModel,
        };
        const created = await ipcCreateSession(productId, scaffold);
        setSessions([created.meta]);
        setCurrentSessionId(created.meta.id);
        setVideoType(scaffold.videoType);
        setFormats(scaffold.formats);
        setModelId(scaffold.modelId);
        setEvents([]);
      } else {
        // Load the most recent session
        const mostRecent = existing[0];
        const loaded = await ipcLoadSession(productId, mostRecent.id);
        setSessions(existing);
        setCurrentSessionId(mostRecent.id);
        if (loaded) {
          setVideoType(loaded.meta.scaffold.videoType);
          setFormats(loaded.meta.scaffold.formats);
          setModelId(loaded.meta.scaffold.modelId);
          setEvents(loaded.events);
        }
      }

      setSessionReady(true);
    };

    bootstrap().catch(() => undefined);

    isAgentRunning()
      .then((r) => {
        if (r) setRunning(true);
      })
      .catch(() => undefined);
  }, [productId]);

  // ─── Subscribe to agent events ──────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAgentEvent((event) => {
      setEvents((prev) => [...prev, event]);
      if (event.type === "result") setRunning(false);
      if (event.type === "error" && event.recoverable === false) setRunning(false);
    });
    return unsubscribe;
  }, []);

  // ─── Debounced session save on every event change ───────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!sessionReady || !productId || !currentSessionId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const scaffold: SessionScaffold = { videoType, formats, modelId };
      ipcSaveSession(productId, currentSessionId, events, scaffold)
        .then(() => {
          // Refresh meta in our local list so updatedAt + eventCount reflect reality.
          setSessions((prev) =>
            prev.map((s) =>
              s.id === currentSessionId
                ? {
                    ...s,
                    scaffold,
                    updatedAt: Date.now(),
                    eventCount: events.length,
                  }
                : s
            )
          );
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [events, videoType, formats, modelId, sessionReady, productId, currentSessionId]);

  const agent = useMemo(() => deriveAgentState(events), [events]);

  // ─── Scaffold mutations ─────────────────────────────────────────────
  const toggleFormat = useCallback((f: VideoFormat) => {
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }, []);

  const handleModelChange = useCallback((id: string) => {
    setModelId(id);
    const next = { ...(configRef.current ?? DEFAULT_CONFIG), selectedModel: id };
    configRef.current = next;
    saveConfig(next).catch(() => undefined);
  }, []);

  // ─── Session actions ────────────────────────────────────────────────
  const handleSelectSession = useCallback(
    async (id: string) => {
      if (!productId) return;
      const file = await ipcLoadSession(productId, id);
      if (!file) return;
      setCurrentSessionId(id);
      setVideoType(file.meta.scaffold.videoType);
      setFormats(file.meta.scaffold.formats);
      setModelId(file.meta.scaffold.modelId);
      setEvents(file.events);
      briefRef.current = "";
    },
    [productId]
  );

  const handleCreateSession = useCallback(async () => {
    if (!productId) return;
    const cfg = configRef.current ?? DEFAULT_CONFIG;
    const scaffold: SessionScaffold = {
      videoType: cfg.defaultVideoType,
      formats: cfg.defaultFormats,
      modelId: modelId ?? cfg.selectedModel,
    };
    const created = await ipcCreateSession(productId, scaffold);
    setSessions((prev) => [created.meta, ...prev]);
    setCurrentSessionId(created.meta.id);
    setVideoType(scaffold.videoType);
    setFormats(scaffold.formats);
    setEvents([]);
    briefRef.current = "";
  }, [productId, modelId]);

  const handleRenameSession = useCallback(
    async (id: string, title: string) => {
      if (!productId) return;
      await ipcRenameSession(productId, id, title);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title, updatedAt: Date.now() } : s))
      );
    },
    [productId]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      if (!productId) return;
      await ipcDeleteSession(productId, id);
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (currentSessionId === id) {
        // Switch to most recent remaining, or create a fresh one.
        if (remaining.length > 0) {
          await handleSelectSession(remaining[0].id);
        } else {
          await handleCreateSession();
        }
      }
    },
    [productId, sessions, currentSessionId, handleSelectSession, handleCreateSession]
  );

  // ─── Run helpers ────────────────────────────────────────────────────
  const pushUserMessage = useCallback(
    (text: string, kind: "brief" | "interrupt" | "approval-response" | "follow-up") => {
      setEvents((prev) => [...prev, { type: "user_message", text, kind }]);
    },
    []
  );

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
          model: modelId,
        });
      } catch (err) {
        setEvents((prev) => [
          ...prev,
          { type: "error", message: String(err), scope: "renderer", recoverable: false },
        ]);
        setRunning(false);
      }
    },
    [productId, videoType, formats, modelId]
  );

  const handlePromptResponse = useCallback(
    async (response: string) => {
      if (!agent.pendingPrompt) return;
      if (response !== "approve" && response !== "cancel" && response.trim()) {
        pushUserMessage(response, "approval-response");
      }
      await respondToPrompt(agent.pendingPrompt.id, response);
    },
    [agent.pendingPrompt, pushUserMessage]
  );

  /** Submit from the chat composer — state-aware dispatch. */
  const handleComposerSubmit = useCallback(
    async (text: string) => {
      if (agent.pendingPrompt) {
        await handlePromptResponse(text);
        return;
      }

      const actuallyRunning = await isAgentRunning().catch(() => false);
      if (actuallyRunning) {
        pushUserMessage(text, "interrupt");
        await cancelAgent();
        setRunning(false);
        const combined = [briefRef.current, text].filter(Boolean).join("\n\n[INTERRUPT] ");
        await startRun(combined);
        return;
      }

      const hasPriorRun = events.some((e) => e.type === "result" || e.type === "error");
      const isFollowUp = hasPriorRun;
      pushUserMessage(text, isFollowUp ? "follow-up" : "brief");

      const nextBrief = isFollowUp
        ? [briefRef.current, text].filter(Boolean).join("\n\n[FOLLOW-UP] ")
        : text;

      await startRun(nextBrief);
    },
    [agent.pendingPrompt, events, handlePromptResponse, pushUserMessage, startRun]
  );

  /** Build directly from the scaffold — no chat input required. */
  const handleBuild = useCallback(async () => {
    if (!productId) return;
    const typeMeta = VIDEO_TYPES.find((t) => t.id === videoType)!;
    const synthesized = `Build a ${typeMeta.label.toLowerCase()} for this project (${formats.join(", ")}). Use the standard arc — no extra direction needed.`;
    pushUserMessage(synthesized, "brief");
    await startRun(synthesized);
  }, [productId, videoType, formats, pushUserMessage, startRun]);

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
      <header className="hairline flex items-baseline justify-between gap-8 border-b px-12 py-7">
        <div className="flex items-baseline gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
              workbench
            </p>
            <h1 className="display-sm mt-1 text-4xl text-paper">{productId}</h1>
          </div>
          <div className="self-end pb-1.5">
            <SessionSwitcher
              current={currentSession}
              sessions={sessions}
              onSelect={handleSelectSession}
              onCreateNew={handleCreateSession}
              onRename={handleRenameSession}
              onDelete={handleDeleteSession}
            />
          </div>
        </div>
        <Link
          to="/"
          className="font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
        >
          ← all projects
        </Link>
      </header>

      {/* ─── Body ──────────────────────────────────────────────────────── */}
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
            click <span className="text-paper">build</span> to start with these defaults, or
            type into the chat to give a specific brief.
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
            {!hasHistory && !running && (
              <EmptyHero
                typeMeta={typeMeta}
                project={productId ?? ""}
                formats={formats}
                onBuild={handleBuild}
              />
            )}
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
            onModelChange={handleModelChange}
            onSubmit={handleComposerSubmit}
            onStop={handleStop}
            projectName={productId ?? "this project"}
          />
        </section>

        <ArtifactPanel artifacts={agent.artifacts} />
      </div>
    </div>
  );
}

function EmptyHero({
  typeMeta,
  project,
  formats,
  onBuild,
}: {
  typeMeta: { label: string; defaultScenes: number; defaultDuration: number };
  project: string;
  formats: VideoFormat[];
  onBuild: () => void | Promise<void>;
}) {
  const canBuild = formats.length > 0 && project.length > 0;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/95 px-12">
      <div className="max-w-xl">
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          ready · {project}
        </p>
        <p className="display mt-4 text-5xl text-paper">What should we make?</p>
        <p className="mt-6 text-sm leading-relaxed text-paper-mute">
          Scaffold is set to a <span className="text-paper">{typeMeta.label.toLowerCase()}</span>{" "}
          — {typeMeta.defaultScenes} scenes, ~{typeMeta.defaultDuration}s, rendering{" "}
          <span className="tabular text-paper">{formats.length}</span> format
          {formats.length === 1 ? "" : "s"}. Hit <span className="text-paper">build</span> to start
          with these defaults, or type into the chat below to give a specific brief.
        </p>
        <div className="mt-8 flex items-baseline gap-6">
          <button
            type="button"
            onClick={onBuild}
            disabled={!canBuild}
            className={cn(
              "rounded-full px-6 py-2.5 text-sm font-medium transition-colors",
              canBuild
                ? "bg-paper text-ink hover:bg-paper/90"
                : "cursor-not-allowed bg-paper-mute/10 text-paper-mute/40"
            )}
          >
            build with these settings
          </button>
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/70">
            or type a brief below ↓
          </span>
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
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        <span className="text-cinnabar">{eyebrow}</span>{" "}
        <span className="text-paper-mute">/ {title.toLowerCase()}</span>
      </p>
      {children}
    </div>
  );
}
