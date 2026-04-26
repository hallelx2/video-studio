import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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
  openExternal,
  renameSession as ipcRenameSession,
  respondToPrompt,
  saveConfig,
  saveSession as ipcSaveSession,
  startPreview,
  stopPreview,
} from "../lib/agent-client.js";
import {
  DEFAULT_CONFIG,
  FORMAT_OPTIONS,
  MODEL_OPTIONS,
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
import { SessionSidebar } from "../components/agent/SessionSidebar.js";
import { EmptyComposerState } from "../components/agent/EmptyComposerState.js";
import {
  SLASH_COMMANDS,
  type CommandHandlers,
} from "../components/agent/slash-commands.js";

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
  const [searchParams, setSearchParams] = useSearchParams();
  /** Optional ?session=<id> from the search palette. Cleared after consumption. */
  const requestedSessionId = searchParams.get("session");

  // ─── Scaffold state ─────────────────────────────────────────────────
  const [videoType, setVideoType] = useState<VideoType>("product-launch");
  const [formats, setFormats] = useState<VideoFormat[]>(["linkedin", "x"]);
  const [modelId, setModelId] = useState<string>(DEFAULT_CONFIG.selectedModel);
  const [personaId, setPersonaId] = useState<string>(DEFAULT_CONFIG.selectedPersona);
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
      setModelId(cfg.selectedModel ?? DEFAULT_CONFIG.selectedModel);
      setPersonaId(cfg.selectedPersona ?? DEFAULT_CONFIG.selectedPersona);

      // List existing sessions. If none exist, leave currentSessionId null —
      // the empty state with pills will show. The user creates a session by
      // clicking a pill or the '+ new session' button in the sidebar.
      const existing = await ipcListSessions(productId).catch(() => [] as SessionMeta[]);
      setSessions(existing);

      if (existing.length > 0) {
        // If we got here from the search palette with ?session=<id>, prefer
        // that target. Otherwise pick the most-recently-touched session.
        const target =
          (requestedSessionId && existing.find((s) => s.id === requestedSessionId)) ??
          existing[0];
        const loaded = await ipcLoadSession(productId, target.id);
        setCurrentSessionId(target.id);
        if (loaded) {
          setVideoType(loaded.meta.scaffold.videoType);
          setFormats(loaded.meta.scaffold.formats);
          setModelId(loaded.meta.scaffold.modelId);
          setEvents(loaded.events);
        }
      }

      // Drop the ?session= param now that it's been consumed — keeps the
      // URL clean and prevents a re-mount from snapping back to the same
      // session if the user has since switched.
      if (requestedSessionId) {
        setSearchParams({}, { replace: true });
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

  // ─── Global keyboard shortcuts ──────────────────────────────────────
  // ⌘N / Ctrl+N → new session. Suppressed when typing in editable elements.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== "n") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      handleCreateSessionRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const handleCreateSessionRef = useRef<(() => void) | null>(null);

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

  const handlePersonaChange = useCallback((id: string) => {
    setPersonaId(id);
    const next = { ...(configRef.current ?? DEFAULT_CONFIG), selectedPersona: id };
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

  // Keep the ref in sync with the latest callback so the global ⌘N keyboard
  // shortcut (registered once) always invokes the current closure.
  useEffect(() => {
    handleCreateSessionRef.current = () => {
      void handleCreateSession();
    };
  }, [handleCreateSession]);

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
    async (
      brief: string,
      overrides?: {
        videoType?: VideoType;
        formats?: VideoFormat[];
        modelId?: string;
        personaId?: string;
      }
    ) => {
      if (!productId) return;
      briefRef.current = brief;
      setRunning(true);
      try {
        await generateVideo({
          projectId: productId,
          videoType: overrides?.videoType ?? videoType,
          formats: overrides?.formats ?? formats,
          brief: brief.trim() || undefined,
          model: overrides?.modelId ?? modelId,
          persona: overrides?.personaId ?? personaId,
        });
      } catch (err) {
        setEvents((prev) => [
          ...prev,
          { type: "error", message: String(err), scope: "renderer", recoverable: false },
        ]);
        setRunning(false);
      }
    },
    [productId, videoType, formats, modelId, personaId]
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

  /**
   * Pill click in the empty state: pick a video type, set it as the session's
   * scaffold, create a session if there isn't one, and start the build.
   * Single-click flow — no further configuration needed.
   */
  const handlePickVideoType = useCallback(
    async (picked: VideoType) => {
      if (!productId) return;
      const cfg = configRef.current ?? DEFAULT_CONFIG;
      const scaffold: SessionScaffold = {
        videoType: picked,
        formats: cfg.defaultFormats,
        modelId: modelId ?? cfg.selectedModel,
      };

      // If we don't have a current session yet, spin one up.
      let sessionIdForRun = currentSessionId;
      if (!sessionIdForRun) {
        const created = await ipcCreateSession(productId, scaffold);
        sessionIdForRun = created.meta.id;
        setSessions((prev) => [created.meta, ...prev]);
        setCurrentSessionId(sessionIdForRun);
      }

      setVideoType(picked);
      setFormats(scaffold.formats);

      // Synthesize a brief and kick off the run. Pass the picked type as an
      // override so we don't race React's state batching.
      const typeMeta = VIDEO_TYPES.find((t) => t.id === picked)!;
      const synthesized = `Build a ${typeMeta.label.toLowerCase()} for this project (${scaffold.formats.join(", ")}). Use the standard arc — no extra direction needed.`;
      pushUserMessage(synthesized, "brief");
      await startRun(synthesized, {
        videoType: picked,
        formats: scaffold.formats,
        modelId: scaffold.modelId,
      });
    },
    [productId, currentSessionId, modelId, pushUserMessage, startRun]
  );

  const handleStop = useCallback(async () => {
    await cancelAgent();
    await stopPreview().catch(() => undefined);
    setRunning(false);
  }, []);

  // ─── Slash command handlers ─────────────────────────────────────────
  const slashHandlers: CommandHandlers = useMemo(
    () => ({
      onHelp: () => {
        // Push a synthetic agent_text event listing every command. Markdown
        // renders it in the stream so it persists with the session.
        const lines = ["**Slash commands**\n"];
        for (const cmd of SLASH_COMMANDS) {
          const aliases =
            cmd.aliases && cmd.aliases.length > 0
              ? ` *(${cmd.aliases.map((a) => `/${a}`).join(", ")})*`
              : "";
          lines.push(`- \`/${cmd.name}\`${aliases} — ${cmd.description}`);
        }
        const helpText = lines.join("\n");
        setEvents((prev) => [
          ...prev,
          { type: "agent_text", messageId: `help-${Date.now()}`, text: helpText },
        ]);
      },
      onNewSession: () => {
        void handleCreateSession();
      },
      onClear: () => {
        if (!window.confirm("Clear this session's events? The session itself stays.")) return;
        setEvents([]);
        briefRef.current = "";
      },
      onStop: () => {
        void handleStop();
      },
      onApprove: () => {
        if (!agent.pendingPrompt) return;
        void handlePromptResponse("approve");
      },
      onCancel: () => {
        if (!agent.pendingPrompt) return;
        void handlePromptResponse("cancel");
      },
      onPreview: () => {
        const composition = agent.artifacts.find((a) => a.kind === "composition");
        if (!composition) return;
        const idx = Math.max(
          composition.path.lastIndexOf("/"),
          composition.path.lastIndexOf("\\")
        );
        const workspaceDir = idx === -1 ? composition.path : composition.path.slice(0, idx);
        void (async () => {
          try {
            const { url } = await startPreview(workspaceDir);
            await openExternal(url);
          } catch {
            // ignore — bridge already surfaces the error event
          }
        })();
      },
      onSwitchModel: (hint: string) => {
        // Match by family alias first ("opus" → first opus model), then by id substring.
        const lower = hint.toLowerCase().trim();
        if (!lower) return;
        const byFamily = MODEL_OPTIONS.find((m) => m.family === lower);
        if (byFamily) {
          handleModelChange(byFamily.id);
          return;
        }
        const byId = MODEL_OPTIONS.find(
          (m) => m.id.toLowerCase().includes(lower) || m.label.toLowerCase().includes(lower)
        );
        if (byId) handleModelChange(byId.id);
      },
    }),
    [agent.artifacts, agent.pendingPrompt, handleCreateSession, handleModelChange, handlePromptResponse, handleStop]
  );

  const typeMeta = useMemo(() => VIDEO_TYPES.find((t) => t.id === videoType)!, [videoType]);
  const hasHistory = events.length > 0;

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
      <div className="flex flex-1 overflow-hidden">
        <div className="hairline flex flex-1 flex-col border-r-0">

      {/* Inner header — session title (only shown when there's a session) */}
      {currentSession && (
        <header className="hairline flex items-baseline justify-between gap-8 border-b px-10 py-5">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
              session
            </p>
            <h1 className="display-sm mt-1 truncate text-2xl text-paper">
              {currentSession.title}
            </h1>
          </div>
        </header>
      )}

      {/* Body — empty state when no events; full workbench once events exist */}
      {hasHistory ? (
        <div className="flex flex-1 overflow-hidden">
          <aside className="hairline flex w-[280px] shrink-0 flex-col gap-8 overflow-y-auto border-r px-6 py-8 stagger-children">
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
              type into the chat to interrupt mid-run or follow up after a render.
            </p>
          </aside>

          <section className="flex flex-1 flex-col overflow-hidden">
            <StageTimeline stages={agent.stages} currentStageId={agent.currentStageId} />
            <div className="relative flex-1 overflow-hidden">
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

          <ArtifactPanel artifacts={agent.artifacts} />
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
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        <span className="text-cinnabar">{eyebrow}</span>{" "}
        <span className="text-paper-mute">/ {title.toLowerCase()}</span>
      </p>
      {children}
    </div>
  );
}
