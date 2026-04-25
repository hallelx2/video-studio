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

/**
 * Workbench — generation surface for one project.
 *
 * Layout per DESIGN.md:
 *   - Top header: project title + run state + cancel
 *   - Left rail: video type + formats + brief (the "what to make" panel)
 *   - Right top: script preview (populated when the agent emits the script)
 *   - Right bottom: live agent stream
 *
 * NOTE: this is a functional stub. Phase 8 polishes typography rhythm,
 * the prompt-approval surface, and the live render preview tile.
 */
export function WorkbenchRoute() {
  const { productId } = useParams<{ productId: string }>();

  const [videoType, setVideoType] = useState<VideoType>("product-launch");
  const [formats, setFormats] = useState<VideoFormat[]>(["linkedin", "x"]);
  const [brief, setBrief] = useState("");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<Extract<AgentEvent, { type: "prompt" }> | null>(
    null
  );
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
      if (event.type === "prompt") setPendingPrompt(event);
      if (event.type === "result") setRunning(false);
      if (event.type === "error" && event.recoverable === false) setRunning(false);
    });
    return unsubscribe;
  }, []);

  // Auto-scroll the agent stream.
  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  const toggleFormat = (f: VideoFormat) => {
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const handleGenerate = useCallback(async () => {
    if (!productId) return;
    setEvents([]);
    setPendingPrompt(null);
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
      <header className="hairline flex items-center justify-between border-b px-12 py-6">
        <div className="flex items-baseline gap-6">
          <Link
            to="/"
            className="font-mono text-[11px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
          >
            ← projects
          </Link>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
              workbench
            </p>
            <h1 className="display-sm mt-1 text-3xl text-paper">{productId}</h1>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <RunIndicator running={running} />
          {running ? (
            <button
              onClick={handleCancel}
              className="border-b border-alarm pb-1 text-sm text-alarm transition-colors hover:text-paper"
            >
              cancel run
            </button>
          ) : (
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
        </div>
      </header>

      {/* ─── Body: left rail (controls) + right stack (script + stream) ─── */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hairline flex w-[360px] shrink-0 flex-col gap-10 overflow-y-auto border-r px-8 py-10">
          <Field eyebrow="01" title="Video type">
            <div className="grid grid-cols-1 gap-px border border-brass-line bg-brass-line">
              {VIDEO_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setVideoType(t.id as VideoType)}
                  className={cn(
                    "block bg-ink px-4 py-3 text-left transition-colors",
                    videoType === t.id ? "bg-ink-edge" : "hover:bg-ink-raised"
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
                    className={cn(
                      "flex items-center justify-between bg-ink px-4 py-3 text-left transition-colors",
                      on ? "bg-ink-edge" : "hover:bg-ink-raised"
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
              className="hairline w-full resize-none border bg-ink-raised p-3 font-mono text-xs text-paper placeholder:text-paper-mute/60 focus:border-cinnabar focus:outline-none"
            />
          </Field>
        </aside>

        <section className="flex flex-1 flex-col overflow-hidden">
          {/* Live agent stream — fills the right side. Phase 8 splits this
              with a script preview + render tile. */}
          <div ref={streamRef} className="flex-1 overflow-y-auto px-12 py-8 font-mono text-xs">
            {events.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="display-sm text-2xl text-paper-mute/60">
                  Press <span className="text-cinnabar">generate</span> to begin.
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {events.map((e, i) => (
                  <EventLine key={i} event={e} />
                ))}
              </ul>
            )}
          </div>

          {pendingPrompt && (
            <div className="hairline border-t bg-ink-raised px-12 py-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
                approval requested
              </p>
              <p className="mt-2 text-base text-paper">{pendingPrompt.question}</p>
              <div className="mt-5 flex gap-6">
                {(pendingPrompt.options ?? ["approve", "request-changes"]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handlePromptResponse(opt)}
                    className="border-b border-cinnabar pb-1 text-sm text-cinnabar transition-colors hover:text-paper"
                  >
                    {opt} →
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RunIndicator({ running }: { running: boolean }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
      {running ? (
        <>
          <span className="pulse-cinnabar h-1.5 w-1.5 rounded-full bg-cinnabar" />
          <span className="text-cinnabar">running</span>
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-paper-mute/40" />
          <span className="text-paper-mute">idle</span>
        </>
      )}
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
      return { tag: event.isError ? "tool-err" : "tool-out", body: event.text ?? "", tone: event.isError ? "alarm" : "default" };
    case "agent_log":
      return { tag: event.level, body: event.text, tone: "default" };
    case "result":
      return {
        tag: "done",
        body: event.message ?? `status: ${event.status}`,
        tone: event.status === "success" ? "accent" : event.status === "failed" ? "alarm" : "default",
      };
    case "error":
      return { tag: "error", body: event.message, tone: "alarm" };
    case "raw":
      return { tag: "raw", body: event.text, tone: "default" };
  }
}
