import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  cancelAgent,
  createSession as ipcCreateSession,
  deleteSession as ipcDeleteSession,
  generateVideo,
  getConfig,
  invalidateStage,
  isAgentRunning,
  listSessions as ipcListSessions,
  loadSession as ipcLoadSession,
  onAgentEvent,
  renameSession as ipcRenameSession,
  respondToPrompt,
  saveConfig,
  saveSession as ipcSaveSession,
  stopPreview,
} from "./agent-client.js";
import { usePreview } from "./preview-context.js";
import {
  DEFAULT_CONFIG,
  MODEL_OPTIONS,
  VIDEO_TYPES,
  type AgentEvent,
  type AppConfig,
  type SessionMeta,
  type SessionScaffold,
  type VideoFormat,
  type VideoType,
} from "./types.js";
import { deriveAgentState, type AgentRunState } from "./agent-state.js";
import { SLASH_COMMANDS, type CommandHandlers } from "../components/agent/slash-commands.js";

/**
 * Owns every piece of session/run state for a project workbench: scaffold,
 * sessions list, event log, agent run lifecycle, slash-command handlers,
 * preview pane wiring. Returned as one object so the JSX can destructure
 * exactly what it needs and we keep `WorkbenchRoute` (legacy) and `Stage`
 * (preview-first) consuming identical behavior — no drift between the two
 * surfaces.
 *
 * This was originally inlined inside `routes/Workbench.tsx`. Hoisting it
 * is a behavior-preserving refactor — every closure, effect dep, and call
 * order is preserved. Diffing the two surfaces post-refactor should show
 * only JSX changes.
 */
export function useWorkbenchSession({
  projectIdOverride,
}: {
  projectIdOverride?: string;
} = {}): UseWorkbenchSessionReturn {
  const params = useParams<{ productId: string }>();
  const productId = projectIdOverride ?? params.productId;
  const [searchParams, setSearchParams] = useSearchParams();
  const preview = usePreview();
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

      const existing = await ipcListSessions(productId).catch(() => [] as SessionMeta[]);
      setSessions(existing);

      if (existing.length > 0) {
        const requested = requestedSessionId
          ? existing.find((s) => s.id === requestedSessionId)
          : undefined;
        const target: SessionMeta = requested ?? existing[0];
        const loaded = await ipcLoadSession(productId, target.id);
        setCurrentSessionId(target.id);
        if (loaded) {
          setVideoType(loaded.meta.scaffold.videoType);
          setFormats(loaded.meta.scaffold.formats);
          setModelId(loaded.meta.scaffold.modelId);
          setEvents(loaded.events);
        }
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const handleCreateSessionRef = useRef<(() => void) | null>(null);
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

  // ─── Debounced session save on every event change ───────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!sessionReady || !productId || !currentSessionId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const scaffold: SessionScaffold = { videoType, formats, modelId };
      ipcSaveSession(productId, currentSessionId, events, scaffold)
        .then(() => {
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

  const handlePickVideoType = useCallback(
    async (picked: VideoType) => {
      if (!productId) return;
      const cfg = configRef.current ?? DEFAULT_CONFIG;
      const scaffold: SessionScaffold = {
        videoType: picked,
        formats: cfg.defaultFormats,
        modelId: modelId ?? cfg.selectedModel,
      };

      let sessionIdForRun = currentSessionId;
      if (!sessionIdForRun) {
        const created = await ipcCreateSession(productId, scaffold);
        sessionIdForRun = created.meta.id;
        setSessions((prev) => [created.meta, ...prev]);
        setCurrentSessionId(sessionIdForRun);
      }

      setVideoType(picked);
      setFormats(scaffold.formats);

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
        const aspect = workspaceDir.split(/[\\/]/).pop() || "preview";
        void preview.openIframe({ workspace: workspaceDir, aspect }).catch(() => undefined);
      },
      onSwitchModel: (hint: string) => {
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
      onRetryStage: (stage) => {
        if (!productId) return;
        const intentLabels = {
          rerender: "↻ Re-render only (stage 6)",
          recompose: "↻ Recompose + render (stage 5+)",
          renarrate: "↻ Regenerate narration (stage 4+)",
          redraft: "↻ Re-draft script (stage 3+)",
        } as const;
        const verbLabels = {
          rerender: "re-rendering (stage 6)",
          recompose: "re-composing (stage 5+)",
          renarrate: "regenerating narration (stage 4+)",
          redraft: "re-drafting script (stage 3+)",
        } as const;
        void (async () => {
          try {
            pushUserMessage(intentLabels[stage], "follow-up");

            const { removed } = await invalidateStage(productId, stage);
            const head = `**${verbLabels[stage]}** — wiped ${removed.length} cached artifact${removed.length === 1 ? "" : "s"}.`;
            const tail =
              removed.length === 0
                ? ""
                : "\n\n" +
                  removed
                    .slice(0, 8)
                    .map((p) => `- \`${p.replace(/\\/g, "/")}\``)
                    .join("\n") +
                  (removed.length > 8 ? `\n- … +${removed.length - 8} more` : "");
            setEvents((prev) => [
              ...prev,
              {
                type: "agent_text",
                messageId: `retry-${stage}-${Date.now()}`,
                text: head + tail,
              },
            ]);
            const brief =
              briefRef.current ||
              `Continue: ${stage} the existing project — pipeline state was just invalidated.`;
            await startRun(brief);
          } catch (err) {
            setEvents((prev) => [
              ...prev,
              {
                type: "error",
                message: `${verbLabels[stage]} failed before run: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                recoverable: true,
              },
            ]);
          }
        })();
      },
    }),
    [
      agent.artifacts,
      agent.pendingPrompt,
      handleCreateSession,
      handleModelChange,
      handlePromptResponse,
      handleStop,
      preview,
      productId,
      pushUserMessage,
      startRun,
    ]
  );

  const typeMeta = useMemo(() => VIDEO_TYPES.find((t) => t.id === videoType)!, [videoType]);
  const hasHistory = events.length > 0;

  return {
    productId,
    sessions,
    currentSession,
    currentSessionId,
    videoType,
    formats,
    modelId,
    personaId,
    events,
    running,
    briefRef,
    agent,
    typeMeta,
    hasHistory,
    preview,
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
    pushUserMessage,
    slashHandlers,
  };
}

export interface UseWorkbenchSessionReturn {
  productId: string | undefined;
  sessions: SessionMeta[];
  currentSession: SessionMeta | null;
  currentSessionId: string | null;
  videoType: VideoType;
  formats: VideoFormat[];
  modelId: string;
  personaId: string;
  events: AgentEvent[];
  running: boolean;
  briefRef: React.MutableRefObject<string>;
  agent: AgentRunState;
  typeMeta: (typeof VIDEO_TYPES)[number];
  hasHistory: boolean;
  preview: ReturnType<typeof usePreview>;
  setVideoType: (v: VideoType) => void;
  toggleFormat: (f: VideoFormat) => void;
  handleModelChange: (id: string) => void;
  handlePersonaChange: (id: string) => void;
  handleSelectSession: (id: string) => Promise<void>;
  handleCreateSession: () => Promise<void>;
  handleRenameSession: (id: string, title: string) => Promise<void>;
  handleDeleteSession: (id: string) => Promise<void>;
  handleComposerSubmit: (text: string) => Promise<void>;
  handlePromptResponse: (response: string) => Promise<void>;
  handlePickVideoType: (picked: VideoType) => Promise<void>;
  handleStop: () => Promise<void>;
  pushUserMessage: (
    text: string,
    kind: "brief" | "interrupt" | "approval-response" | "follow-up"
  ) => void;
  slashHandlers: CommandHandlers;
}
