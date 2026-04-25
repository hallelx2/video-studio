import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Play, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { generateVideo, onAgentEvent, onAgentLog, respondToPrompt } from "../lib/agent-client.js";
import type { AgentEvent, VideoFormat } from "../lib/types.js";
import { cn } from "../lib/cn.js";

const FORMAT_OPTIONS: { id: VideoFormat; label: string; aspect: string }[] = [
  { id: "linkedin", label: "LinkedIn Square", aspect: "1:1 · 1080×1080" },
  { id: "x", label: "X / Twitter", aspect: "16:9 · 1920×1080" },
  { id: "youtube", label: "YouTube", aspect: "16:9 · 1920×1080" },
  { id: "hero", label: "Website Hero", aspect: "16:9 · loop" },
];

export function WorkbenchRoute() {
  const { productId } = useParams<{ productId: string }>();
  const [selectedFormats, setSelectedFormats] = useState<VideoFormat[]>(["linkedin", "x"]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<AgentEvent | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlistenEvent: (() => void) | undefined;
    let unlistenLog: (() => void) | undefined;

    onAgentEvent((event) => {
      setEvents((prev) => [...prev, event]);
      if (event.type === "prompt") setPendingPrompt(event);
      if (event.type === "result") setRunning(false);
      if (event.type === "error" && !event.recoverable) setRunning(false);
    }).then((fn) => { unlistenEvent = fn; });

    onAgentLog((log) => {
      setEvents((prev) => [...prev, { type: "raw", text: `[${log.level}] ${log.text}` }]);
    }).then((fn) => { unlistenLog = fn; });

    return () => {
      unlistenEvent?.();
      unlistenLog?.();
    };
  }, []);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  const handleGenerate = useCallback(async () => {
    if (!productId) return;
    setEvents([]);
    setRunning(true);
    setPendingPrompt(null);
    try {
      await generateVideo({ product: productId, formats: selectedFormats });
    } catch (err) {
      setEvents((prev) => [...prev, { type: "error", message: String(err) }]);
      setRunning(false);
    }
  }, [productId, selectedFormats]);

  const handlePromptResponse = useCallback(async (response: string) => {
    if (!pendingPrompt?.id) return;
    await respondToPrompt(pendingPrompt.id, response);
    setPendingPrompt(null);
  }, [pendingPrompt]);

  const toggleFormat = (f: VideoFormat) => {
    setSelectedFormats((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-900 px-8 py-5">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-zinc-500 transition hover:text-zinc-200">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight capitalize">{productId}</h1>
            <p className="text-xs text-zinc-500">Workbench</p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={running || selectedFormats.length === 0}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition",
            running
              ? "cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-500"
              : "border-blue-600/30 bg-blue-600 text-white hover:bg-blue-500"
          )}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? "Generating..." : "Generate video"}
        </button>
      </header>

      <div className="grid flex-1 grid-cols-[280px_1fr] gap-0 overflow-hidden">
        <aside className="overflow-y-auto border-r border-zinc-900 p-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Formats</h2>
          <div className="flex flex-col gap-2">
            {FORMAT_OPTIONS.map((opt) => {
              const selected = selectedFormats.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleFormat(opt.id)}
                  className={cn(
                    "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition",
                    selected
                      ? "border-blue-600/40 bg-blue-950/20"
                      : "border-zinc-900 bg-zinc-950/50 hover:border-zinc-800"
                  )}
                >
                  <span className="text-sm font-medium text-zinc-200">{opt.label}</span>
                  <span className="mt-0.5 font-mono text-xs text-zinc-500">{opt.aspect}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex flex-col overflow-hidden">
          <div ref={streamRef} className="flex-1 overflow-y-auto p-6 font-mono text-xs">
            {events.length === 0 && (
              <div className="flex h-full items-center justify-center text-zinc-600">
                Click <span className="mx-1 font-sans text-zinc-400">Generate video</span> to start the agent.
              </div>
            )}
            {events.map((e, i) => (
              <EventLine key={i} event={e} />
            ))}
          </div>

          {pendingPrompt && (
            <div className="border-t border-zinc-900 bg-zinc-950/90 p-6 backdrop-blur">
              <h3 className="mb-2 text-sm font-medium text-zinc-200">{pendingPrompt.question}</h3>
              <div className="flex gap-2">
                {(pendingPrompt.options ?? ["continue"]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handlePromptResponse(opt)}
                    className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-800"
                  >
                    {opt}
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

function EventLine({ event }: { event: AgentEvent }) {
  const icon = {
    progress: <Loader2 className="h-3 w-3 text-blue-400" />,
    prompt: <AlertCircle className="h-3 w-3 text-yellow-400" />,
    error: <AlertCircle className="h-3 w-3 text-red-400" />,
    result: <CheckCircle2 className="h-3 w-3 text-green-400" />,
  }[event.type as string] ?? null;

  const text =
    event.type === "agent_text"
      ? event.text
      : event.type === "agent_tool_use"
        ? `tool: ${event.tool}`
        : event.message ?? event.text ?? JSON.stringify(event);

  return (
    <div className="flex gap-2 py-1 text-zinc-400">
      <span className="pt-0.5 text-zinc-700">{event.type}</span>
      {icon && <span className="pt-0.5">{icon}</span>}
      <span className="flex-1 whitespace-pre-wrap text-zinc-300">{text}</span>
    </div>
  );
}
