import { useState } from "react";
import { cn } from "../../lib/cn.js";
import type { ToolCallActivity } from "../../lib/agent-state.js";

/**
 * One tool call — paired use + result. Args and output are collapsible since
 * they often run hundreds of lines (Read on a big file, Bash with a long log).
 */
export function ToolCallCard({ activity }: { activity: ToolCallActivity }) {
  const [argsOpen, setArgsOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);

  const inputPreview = formatInputPreview(activity.input);
  const fullInput =
    typeof activity.input === "string"
      ? activity.input
      : JSON.stringify(activity.input, null, 2);

  const elapsedMs =
    activity.endedAt !== null ? activity.endedAt - activity.ts : Date.now() - activity.ts;

  return (
    <article
      className={cn(
        "hairline border-l-2 pl-5 pr-2 py-3 transition-colors",
        activity.status === "running" && "border-l-cinnabar bg-ink-raised/40",
        activity.status === "complete" && "border-l-brass-line",
        activity.status === "error" && "border-l-alarm bg-alarm/[0.04]"
      )}
    >
      {/* Header line: tool · status · timing */}
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            tool
          </span>
          <span className="font-display text-base font-semibold text-paper">
            {activity.toolName}
          </span>
          {activity.status === "running" && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-cinnabar">
              <span className="pulse-cinnabar h-1 w-1 rounded-full bg-cinnabar" />
              running
            </span>
          )}
          {activity.status === "error" && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-alarm">
              errored
            </span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular text-paper-mute">
          {formatMs(elapsedMs)}
        </span>
      </header>

      {/* One-line preview that's always visible */}
      <p className="mt-2 truncate font-mono text-xs text-paper-mute">{inputPreview}</p>

      {/* Args details — collapsible */}
      {fullInput && fullInput.length > 0 && (
        <details
          open={argsOpen}
          onToggle={(e) => setArgsOpen((e.target as HTMLDetailsElement).open)}
          className="mt-2"
        >
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-paper-mute hover:text-paper">
            {argsOpen ? "− args" : "+ args"}
          </summary>
          <pre className="hairline mt-2 max-h-64 overflow-auto border bg-ink-raised p-3 font-mono text-[11px] leading-relaxed text-paper">
            {fullInput}
          </pre>
        </details>
      )}

      {/* Output — collapsible, only shown after the call completes */}
      {activity.output !== null && activity.output.length > 0 && (
        <details
          open={outputOpen}
          onToggle={(e) => setOutputOpen((e.target as HTMLDetailsElement).open)}
          className="mt-1.5"
        >
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-paper-mute hover:text-paper">
            {outputOpen ? "− output" : `+ output · ${formatBytes(activity.output.length)}`}
          </summary>
          <pre
            className={cn(
              "hairline mt-2 max-h-80 overflow-auto border p-3 font-mono text-[11px] leading-relaxed",
              activity.status === "error"
                ? "border-alarm/30 bg-alarm/[0.06] text-alarm"
                : "bg-ink-raised text-paper"
            )}
          >
            {activity.output}
          </pre>
        </details>
      )}
    </article>
  );
}

function formatInputPreview(input: unknown): string {
  if (input === null || input === undefined) return "(no args)";
  if (typeof input === "string") return input;
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    // Common Claude tool args — surface the most important field
    if ("command" in obj && typeof obj.command === "string") return obj.command;
    if ("file_path" in obj && typeof obj.file_path === "string") return obj.file_path;
    if ("path" in obj && typeof obj.path === "string") return obj.path;
    if ("pattern" in obj && typeof obj.pattern === "string") return obj.pattern;
    if ("url" in obj && typeof obj.url === "string") return obj.url;
    if ("prompt" in obj && typeof obj.prompt === "string") return obj.prompt;
    return JSON.stringify(obj);
  }
  return String(input);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}b`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}kb`;
  return `${(n / (1024 * 1024)).toFixed(1)}mb`;
}
