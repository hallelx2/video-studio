import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  cancelAgent,
  generateVideo,
  getConfig,
  onAgentEvent,
  respondToPrompt,
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
import { PromptDock } from "../components/agent/PromptDock.js";

/**
 * Workbench — generation surface for one project.
 *
 * Right pane is now a proper agent inspector built around AG-UI patterns:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  StageTimeline (always visible — 6-stage pipeline)       │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  ActivityStream (filterable: text / tools / progress …) │
 *   │  with full-takeover PromptApprovalPanel on HITL events   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  RunMetricsBar (status · elapsed · tools · tokens · $)   │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Raw events are kept in state; the structured AgentRunState is derived
 * via deriveAgentState() — pure projection, deterministic.
 */
export function WorkbenchRoute() {
  const { productId } = useParams<{ productId: string }>();

  const [videoType, setVideoType] = useState<VideoType>("product-launch");
  const [formats, setFormats] = useState<VideoFormat[]>(["linkedin", "x"]);
  const [brief, setBrief] = useState("");

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);

  // Hydrate defaults from config on first mount.
  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setVideoType(cfg.defaultVideoType);
        setFormats(cfg.defaultFormats);
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

  // Derive structured state from the raw event log on every render.
  const agent = useMemo(() => deriveAgentState(events), [events]);

  const toggleFormat = (f: VideoFormat) => {
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const handleGenerate = useCallback(async () => {
    if (!productId) return;
    setEvents([]);
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
  }, [productId, videoType, formats, brief]);

  const handleCancel = useCallback(async () => {
    await cancelAgent();
    setRunning(false);
  }, []);

  const handlePromptResponse = useCallback(async (response: string) => {
    if (!agent.pendingPrompt) return;
    await respondToPrompt(agent.pendingPrompt.id, response);
  }, [agent.pendingPrompt]);

  const canGenerate = !running && formats.length > 0 && !!productId;
  const typeMeta = useMemo(() => VIDEO_TYPES.find((t) => t.id === videoType)!, [videoType]);

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
        <div className="flex items-center gap-8">
          {!running && (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={cn(
                "border-b pb-1 text-sm font-medium transition-colors",
                canGenerate
                  ? "border-cinnabar text-cinnabar hover:text-paper"
                  : "cursor-not-allowed border-paper-mute/30 text-paper-mute/50"
              )}
            >
              generate video →
            </button>
          )}
          {running && (
            <button
              onClick={handleCancel}
              className="font-mono text-[10px] uppercase tracking-widest text-alarm transition-colors hover:text-paper"
            >
              cancel run
            </button>
          )}
        </div>
      </header>

      {/* ─── Body: left rail (controls) + right pane (agent inspector) ─── */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hairline flex w-[360px] shrink-0 flex-col gap-10 overflow-y-auto border-r px-8 py-10 stagger-children">
          <Field eyebrow="01" title="Video type">
            <div className="grid grid-cols-1 gap-px border border-brass-line bg-brass-line">
              {VIDEO_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setVideoType(t.id as VideoType)}
                  disabled={running}
                  className={cn(
                    "block bg-ink px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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
                      "flex items-center justify-between bg-ink px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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

          <Field eyebrow="03" title="Brief (optional)">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={6}
              placeholder="Anything the agent should know — angle, audience, references…"
              disabled={running}
              className="hairline w-full resize-none border bg-ink-raised p-3 font-mono text-xs text-paper placeholder:text-paper-mute/60 focus:border-cinnabar focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
          </Field>
        </aside>

        {/* ─── Agent inspector ─────────────────────────────────────────── */}
        <section className="relative flex flex-1 flex-col overflow-hidden">
          <StageTimeline stages={agent.stages} currentStageId={agent.currentStageId} />
          <div className="relative flex-1 overflow-hidden">
            <ActivityStream activities={agent.activities} />
            {events.length === 0 && !running && <EmptyHero typeMeta={typeMeta} />}
          </div>
          {agent.pendingPrompt && (
            <PromptDock prompt={agent.pendingPrompt} onRespond={handlePromptResponse} />
          )}
          <RunMetricsBar
            status={agent.status}
            metrics={agent.metrics}
            toolCallCount={agent.metrics.toolCallCount}
            toolCallErrors={agent.metrics.toolCallErrors}
            assistantBlocks={agent.metrics.assistantBlocks}
          />
        </section>
      </div>

      <footer className="hairline border-t px-12 py-3 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        <div className="flex items-center justify-between">
          <Link to="/" className="transition-colors hover:text-paper">
            ← projects
          </Link>
          <span className="tabular">
            {formats.length} format{formats.length === 1 ? "" : "s"} ·{" "}
            {typeMeta.defaultScenes} scenes · ~{typeMeta.defaultDuration}s
          </span>
        </div>
      </footer>
    </div>
  );
}

function EmptyHero({ typeMeta }: { typeMeta: { label: string; defaultScenes: number; defaultDuration: number } }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/95">
      <div className="max-w-md text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          the workshop is quiet
        </p>
        <p className="display-sm mt-4 text-3xl text-paper">
          Press <span className="text-cinnabar">generate video</span>.
        </p>
        <p className="mt-6 text-xs leading-relaxed text-paper-mute">
          The agent reads your project, drafts a {typeMeta.defaultScenes}-scene{" "}
          <span className="text-paper">{typeMeta.label.toLowerCase()}</span> script (~{typeMeta.defaultDuration}s),
          and pauses for your approval before spending any time on narration or rendering.
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
