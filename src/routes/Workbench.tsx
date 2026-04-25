import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Pulse } from "../components/ui/Pulse.js";
import { RenderProgress } from "../components/ui/RenderProgress.js";
import { TabStrip } from "../components/ui/TabStrip.js";

type RightPanel = "stream" | "script";

interface ScriptPreview {
  scenes?: Array<{ id: string; narration: string; title?: string; durationSec?: number }>;
  totalDurationSec?: number;
}

export function WorkbenchRoute() {
  const { productId } = useParams<{ productId: string }>();

  const [videoType, setVideoType] = useState<VideoType>("product-launch");
  const [formats, setFormats] = useState<VideoFormat[]>(["linkedin", "x"]);
  const [brief, setBrief] = useState("");

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<Extract<AgentEvent, { type: "prompt" }> | null>(
    null
  );
  const [scriptPreview, setScriptPreview] = useState<ScriptPreview | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>("stream");

  const streamRef = useRef<HTMLDivElement>(null);

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

      if (event.type === "progress") {
        if (typeof event.progress === "number") setProgress(event.progress);
        setPhase(event.phase);
      }
      if (event.type === "prompt") {
        setPendingPrompt(event);
        // Capture the script preview if the prompt payload carries one
        const preview = (event.payload?.preview as ScriptPreview | undefined) ?? null;
        if (preview && preview.scenes) {
          setScriptPreview(preview);
          setRightPanel("script");
        }
      }
      if (event.type === "result") {
        setRunning(false);
        setProgress(1);
      }
      if (event.type === "error" && event.recoverable === false) {
        setRunning(false);
      }
    });
    return unsubscribe;
  }, []);

  // Auto-scroll the agent stream when new events arrive (only when stream is visible).
  useEffect(() => {
    if (rightPanel !== "stream") return;
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [events, rightPanel]);

  const toggleFormat = (f: VideoFormat) => {
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const handleGenerate = useCallback(async () => {
    if (!productId) return;
    setEvents([]);
    setPendingPrompt(null);
    setScriptPreview(null);
    setProgress(0);
    setPhase(null);
    setRightPanel("stream");
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

  const handlePromptResponse = useCallback(
    async (response: string) => {
      if (!pendingPrompt) return;
      await respondToPrompt(pendingPrompt.id, response);
      setPendingPrompt(null);
    },
    [pendingPrompt]
  );

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

        <div className="flex w-[360px] items-center justify-end gap-8">
          {running && <RenderProgress progress={progress} phase={phase} className="w-full" />}
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
              cancel
            </button>
          )}
        </div>
      </header>

      {/* ─── Body: left rail (controls) + right stack ─────────────────── */}
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

        <section className="flex flex-1 flex-col overflow-hidden">
          <TabStrip<RightPanel>
            tabs={[
              { id: "stream", label: "Agent stream", badge: events.length > 0 ? String(events.length) : undefined },
              { id: "script", label: "Script", badge: scriptPreview?.scenes ? `${scriptPreview.scenes.length} scenes` : undefined },
            ]}
            active={rightPanel}
            onChange={setRightPanel}
            className="px-12"
          />

          {rightPanel === "stream" ? (
            <div ref={streamRef} className="flex-1 overflow-y-auto px-12 py-8 font-mono text-xs">
              {events.length === 0 ? (
                <EmptyStream />
              ) : (
                <ul className="space-y-1.5">
                  {events.map((e, i) => (
                    <EventLine key={i} event={e} />
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ScriptPanel preview={scriptPreview} />
          )}

          {pendingPrompt && (
            <div className="hairline border-t bg-ink-raised px-12 py-6 enter-rise">
              <div className="flex items-center gap-3">
                <Pulse />
                <p className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
                  approval requested
                </p>
              </div>
              <p className="mt-3 text-base leading-relaxed text-paper">{pendingPrompt.question}</p>
              <div className="mt-5 flex gap-6">
                {(pendingPrompt.options ?? ["approve", "request-changes"]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handlePromptResponse(opt)}
                    className={cn(
                      "border-b pb-1 text-sm transition-colors",
                      opt === "approve" || opt === "submit"
                        ? "border-cinnabar text-cinnabar hover:text-paper"
                        : opt === "cancel"
                          ? "border-alarm text-alarm hover:text-paper"
                          : "border-paper-mute text-paper-mute hover:border-paper hover:text-paper"
                    )}
                  >
                    {opt} →
                  </button>
                ))}
              </div>
            </div>
          )}
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

// ─── Sub-components ───────────────────────────────────────────────────────

function EmptyStream() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          the workshop is quiet
        </p>
        <p className="display-sm mt-4 text-2xl text-paper-mute/70">
          Press <span className="text-cinnabar">generate</span> to begin.
        </p>
        <p className="mt-6 text-xs leading-relaxed text-paper-mute">
          The agent will read your project, draft a script, and pause for your approval before
          spending any time on narration or rendering.
        </p>
      </div>
    </div>
  );
}

function ScriptPanel({ preview }: { preview: ScriptPreview | null }) {
  if (!preview || !preview.scenes || preview.scenes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          script will appear once the agent drafts it
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-12 py-10 enter-rise">
      <div className="mx-auto max-w-3xl stagger-children">
        {preview.scenes.map((scene, i) => (
          <article key={scene.id} className="hairline mb-px border-b py-6">
            <div className="flex items-baseline justify-between gap-6 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
              <span className="tabular text-cinnabar">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex items-baseline gap-3">
                <span>{scene.id}</span>
                {scene.durationSec && (
                  <span className="tabular text-paper-mute">{scene.durationSec.toFixed(1)}s</span>
                )}
              </span>
            </div>
            {scene.title && (
              <h3 className="display-sm mt-3 text-2xl text-paper">{scene.title}</h3>
            )}
            <p className="mt-3 max-w-2xl font-display text-lg italic leading-relaxed text-paper">
              "{scene.narration}"
            </p>
          </article>
        ))}
        {preview.totalDurationSec && (
          <p className="hairline mt-px border-t pt-4 text-right font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            total · <span className="tabular text-paper">{preview.totalDurationSec.toFixed(1)}s</span>
          </p>
        )}
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

function EventLine({ event }: { event: AgentEvent }) {
  const { tag, body, tone } = describe(event);
  return (
    <li className="grid grid-cols-[auto_1fr] gap-3 leading-relaxed">
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-widest",
          tone === "accent" ? "text-cinnabar" : tone === "alarm" ? "text-alarm" : "text-paper-mute"
        )}
      >
        {tag}
      </span>
      <span
        className={cn(
          "whitespace-pre-wrap break-words",
          tone === "alarm" ? "text-alarm" : "text-paper"
        )}
      >
        {body}
      </span>
    </li>
  );
}

function describe(event: AgentEvent): { tag: string; body: string; tone: "default" | "accent" | "alarm" } {
  switch (event.type) {
    case "progress":
      return { tag: event.phase, body: event.message ?? "", tone: "default" };
    case "prompt":
      return { tag: "prompt", body: event.question, tone: "accent" };
    case "agent_text":
      return { tag: "agent", body: event.text, tone: "default" };
    case "agent_tool_use":
      return {
        tag: "tool",
        body: `${event.tool} ${typeof event.input === "string" ? event.input : JSON.stringify(event.input)}`,
        tone: "default",
      };
    case "agent_tool_result":
      return {
        tag: event.isError ? "tool-err" : "tool-out",
        body: event.text ?? "",
        tone: event.isError ? "alarm" : "default",
      };
    case "agent_log":
      return { tag: event.level, body: event.text, tone: "default" };
    case "result":
      return {
        tag: "done",
        body: event.message ?? `status: ${event.status}`,
        tone:
          event.status === "success" ? "accent" : event.status === "failed" ? "alarm" : "default",
      };
    case "error":
      return { tag: "error", body: event.message, tone: "alarm" };
    case "raw":
      return { tag: "raw", body: event.text, tone: "default" };
  }
}
