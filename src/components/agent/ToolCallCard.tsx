import { useState } from "react";
import { cn } from "../../lib/cn.js";
import type { ToolCallActivity } from "../../lib/agent-state.js";
import { ToolStatusTitle } from "./ToolStatusTitle.js";

/**
 * One tool call, OpenCode-trigger-style.
 *
 *   Reading… vectorless/README.md                              · 0.4s
 *
 * - Title (verb form): animated swap from active to done
 * - Subtitle: smart-extracted label (path, command, query, etc)
 * - Trailing meta: elapsed time
 * - Click row to expand — full args + output
 */
export function ToolCallCard({ activity }: { activity: ToolCallActivity }) {
  const [open, setOpen] = useState(false);

  const verbs = verbsFor(activity.toolName);
  const subtitle = extractLabel(activity.input);
  const fullInput =
    typeof activity.input === "string"
      ? activity.input
      : JSON.stringify(activity.input, null, 2);

  const elapsedMs =
    activity.endedAt !== null ? activity.endedAt - activity.ts : Date.now() - activity.ts;

  const isRunning = activity.status === "running";
  const isError = activity.status === "error";

  return (
    <article
      className={cn(
        "transition-colors",
        isRunning && "bg-ink-raised/40",
        isError && "bg-alarm/[0.05]"
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-baseline gap-4 border-l-2 px-4 py-2 text-left transition-colors",
          isRunning && "border-l-cinnabar",
          !isRunning && !isError && "border-l-brass-line hover:border-l-brass",
          isError && "border-l-alarm"
        )}
      >
        {/* Title (active/done verb swap) + subtitle (label) */}
        <span className="flex min-w-0 flex-1 items-baseline gap-3">
          <ToolStatusTitle
            active={isRunning}
            activeText={verbs.active}
            doneText={verbs.done}
            className={cn(
              "shrink-0 font-display text-[15px] font-semibold",
              isRunning && "text-paper",
              isError && "text-alarm",
              !isRunning && !isError && "text-paper"
            )}
          />
          {subtitle && (
            <span className="min-w-0 truncate font-mono text-xs text-paper-mute">
              {subtitle}
            </span>
          )}
        </span>

        {/* Trailing meta: status pill + elapsed */}
        <span className="flex shrink-0 items-baseline gap-3">
          {isError && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-alarm">
              error
            </span>
          )}
          <span className="font-mono text-[10px] tabular text-paper-mute">
            {formatMs(elapsedMs)}
          </span>
          <span
            className={cn(
              "font-mono text-[10px] tabular tracking-widest text-paper-mute/70 transition-transform",
              open && "rotate-90"
            )}
            aria-hidden
          >
            ▸
          </span>
        </span>
      </button>

      {/* Expanded details */}
      {open && (
        <div className="enter-rise space-y-2 px-6 pb-3 pt-1">
          {fullInput && fullInput !== "{}" && (
            <Detail label="args">
              <pre className="hairline max-h-64 overflow-auto border bg-ink-raised p-3 font-mono text-[11px] leading-relaxed text-paper">
                {fullInput}
              </pre>
            </Detail>
          )}
          {activity.output !== null && activity.output.length > 0 && (
            <Detail label={`output · ${formatBytes(activity.output.length)}`}>
              <pre
                className={cn(
                  "hairline max-h-80 overflow-auto border p-3 font-mono text-[11px] leading-relaxed",
                  isError
                    ? "border-alarm/30 bg-alarm/[0.06] text-alarm"
                    : "bg-ink-raised text-paper"
                )}
              >
                {activity.output}
              </pre>
            </Detail>
          )}
          {activity.output === null && !isRunning && (
            <p className="font-mono text-[11px] text-paper-mute/70">(no output captured)</p>
          )}
        </div>
      )}
    </article>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        {label}
      </p>
      {children}
    </div>
  );
}

// ─── Verb mapping for known tools ──────────────────────────────────────────
// Active form ends with an em-dash + ellipsis to feel in-progress.
// Done form is a plain past-tense verb.

interface Verbs {
  active: string;
  done: string;
}

const VERBS: Record<string, Verbs> = {
  Bash: { active: "Running…", done: "Ran" },
  Read: { active: "Reading…", done: "Read" },
  Write: { active: "Writing…", done: "Wrote" },
  Edit: { active: "Editing…", done: "Edited" },
  Glob: { active: "Finding…", done: "Found" },
  Grep: { active: "Searching…", done: "Searched" },
  WebFetch: { active: "Fetching…", done: "Fetched" },
  WebSearch: { active: "Searching…", done: "Searched" },
  Skill: { active: "Loading skill…", done: "Loaded skill" },
  TodoWrite: { active: "Planning…", done: "Planned" },
  NotebookEdit: { active: "Editing notebook…", done: "Edited notebook" },
};

function verbsFor(toolName: string): Verbs {
  if (VERBS[toolName]) return VERBS[toolName];
  return { active: `${toolName}…`, done: toolName };
}

// ─── Smart label extraction (OpenCode pattern) ────────────────────────────
// Try a list of common keys in priority order. First non-empty wins.

const LABEL_KEYS = [
  "command",
  "file_path",
  "filePath",
  "path",
  "pattern",
  "query",
  "url",
  "description",
  "skill",
  "name",
  "prompt",
] as const;

function extractLabel(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") return input;
  if (typeof input !== "object") return String(input);

  const obj = input as Record<string, unknown>;
  for (const key of LABEL_KEYS) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  // Last-resort: stringify but truncate
  const json = JSON.stringify(obj);
  return json.length > 80 ? json.slice(0, 77) + "…" : json;
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
