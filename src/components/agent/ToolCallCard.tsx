import { useState } from "react";
import {
  FileText,
  PenLine,
  Pencil,
  Terminal,
  Search,
  FolderSearch,
  Globe,
  Sparkles,
  ListChecks,
  NotebookPen,
  Wrench,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/cn.js";
import type { ToolCallActivity } from "../../lib/agent-state.js";
import { ToolStatusTitle } from "./ToolStatusTitle.js";
import { StreamRow, RowBadge } from "./StreamRow.js";

/**
 * One tool call. Compact when collapsed (verb + target + elapsed), expands
 * into an artifact-aware preview (file diff, command + output, etc.).
 *
 *   ◯ Read    vectorless/README.md        · 0.4s   ▸
 *
 * Running rows light up with the bioluminescent cyan halo and a top-edge
 * stripe. Errors land hard with the signature 4×4 brutalist offset shadow.
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

  const Icon = iconFor(activity.toolName);
  const tone = isError ? "alarm" : isRunning ? "running" : "tool";

  return (
    <article className="min-w-0">
      <StreamRow
        tone={tone}
        icon={<Icon className="h-3.5 w-3.5" strokeWidth={1.75} />}
        running={isRunning}
        brutalist={isError}
        expanded={open}
        onClick={() => setOpen((v) => !v)}
        ariaLabel={isRunning ? verbs.active : verbs.done}
        header={
          <span className="flex min-w-0 items-baseline gap-2.5">
            <ToolStatusTitle
              active={isRunning}
              activeText={verbs.active}
              doneText={verbs.done}
              // Wrapper carries typography + base color. The shimmer is
              // pushed down to the leaf text spans via runningClassName so
              // background-clip: text doesn't leak the gradient beyond the
              // verb and read as "the whole row is shimmering".
              className={cn(
                "shrink-0 text-[13px] font-medium tracking-tight",
                isError ? "text-alarm" : "text-fg"
              )}
              runningClassName={!isError ? "text-shimmer-cyan" : undefined}
            />
            {subtitle && (
              // The subtitle stays calm — shimmer is reserved for the verb
              // (the part that changes when the tool finishes). Two shimmer
              // animations side-by-side made the whole row read as "div is
              // shimmering" instead of "this verb is in flight".
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono text-[12px]",
                  isRunning ? "text-cyan/70" : "text-fg-muted"
                )}
              >
                {subtitle}
              </span>
            )}
          </span>
        }
        status={
          <>
            {isError && <RowBadge tone="alarm">error</RowBadge>}
            <span
              className={cn(
                "font-mono text-[10px] tabular",
                isRunning ? "text-cyan/85" : "text-fg-muted/85"
              )}
            >
              {formatMs(elapsedMs)}
            </span>
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-fg-muted/70 transition-transform duration-200",
                open && "rotate-90 text-fg"
              )}
              strokeWidth={2}
              aria-hidden
            />
          </>
        }
      >
        {/* Body intentionally empty when collapsed — header carries the row. */}
        <span className="sr-only">{verbs.done}</span>
      </StreamRow>

      {/* Expanded artifact — sits flush under the row, indented to align with
          the icon disc + content column for visual continuity. */}
      {open && (
        <div className="enter-rise mt-1 pl-[40px] pr-3 pb-3">
          <div className="space-y-3 rounded border border-mist-08 bg-surface/60 p-4">
            <ArtifactDetails activity={activity} fullInput={fullInput} />
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Artifact-aware detail rendering ──────────────────────────────────────
// For Read/Write/Edit/Bash, render the content as a proper artifact preview
// instead of just dumping JSON.

function ArtifactDetails({
  activity,
  fullInput,
}: {
  activity: ToolCallActivity;
  fullInput: string;
}) {
  const input = activity.input as Record<string, unknown> | null;
  const isError = activity.status === "error";

  switch (activity.toolName) {
    case "Read":
      return <ReadDetails activity={activity} input={input} />;
    case "Write":
      return <WriteDetails activity={activity} input={input} />;
    case "Edit":
      return <EditDetails activity={activity} input={input} />;
    case "Bash":
      return <BashDetails activity={activity} input={input} isError={isError} />;
    default:
      return <DefaultDetails activity={activity} fullInput={fullInput} isError={isError} />;
  }
}

function ReadDetails({
  activity,
  input,
}: {
  activity: ToolCallActivity;
  input: Record<string, unknown> | null;
}) {
  const path = (input?.file_path as string | undefined) ?? "(unknown path)";
  const offset = input?.offset as number | undefined;
  const limit = input?.limit as number | undefined;
  return (
    <>
      <Path label="file" path={path}>
        {(offset || limit) && (
          <span className="font-mono text-[10px] tabular text-fg-muted">
            {offset ? `lines ${offset}+` : ""}
            {limit ? ` (${limit} max)` : ""}
          </span>
        )}
      </Path>
      {activity.output && (
        <Detail
          label={`content · ${formatBytes(activity.output.length)} · ${activity.output.split("\n").length} lines`}
        >
          <CodeBlock language={extOf(path)} content={activity.output} />
        </Detail>
      )}
    </>
  );
}

function WriteDetails({
  activity,
  input,
}: {
  activity: ToolCallActivity;
  input: Record<string, unknown> | null;
}) {
  const path = (input?.file_path as string | undefined) ?? "(unknown path)";
  const content = (input?.content as string | undefined) ?? "";
  return (
    <>
      <Path label="wrote" path={path} />
      {content && (
        <Detail
          label={`content · ${formatBytes(content.length)} · ${content.split("\n").length} lines`}
        >
          <CodeBlock language={extOf(path)} content={content} />
        </Detail>
      )}
      {activity.output && (
        <Detail label="result">
          <pre className="rounded border border-mist-10 bg-surface p-3 font-mono text-[11px] text-fg-muted">
            {activity.output}
          </pre>
        </Detail>
      )}
    </>
  );
}

function EditDetails({
  activity,
  input,
}: {
  activity: ToolCallActivity;
  input: Record<string, unknown> | null;
}) {
  const path = (input?.file_path as string | undefined) ?? "(unknown path)";
  const oldStr = (input?.old_string as string | undefined) ?? "";
  const newStr = (input?.new_string as string | undefined) ?? "";
  const replaceAll = input?.replace_all === true;
  return (
    <>
      <Path label="edit" path={path}>
        {replaceAll && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
            replace all
          </span>
        )}
      </Path>
      <div className="grid grid-cols-2 gap-2">
        <Detail label={`removed · ${oldStr.split("\n").length} lines`}>
          <CodeBlock content={oldStr} tone="alarm" />
        </Detail>
        <Detail label={`added · ${newStr.split("\n").length} lines`}>
          <CodeBlock content={newStr} tone="accent" />
        </Detail>
      </div>
    </>
  );
}

function BashDetails({
  activity,
  input,
  isError,
}: {
  activity: ToolCallActivity;
  input: Record<string, unknown> | null;
  isError: boolean;
}) {
  const command = (input?.command as string | undefined) ?? "";
  const description = input?.description as string | undefined;
  return (
    <>
      {description && <p className="text-[12px] italic text-fg-muted">{description}</p>}
      {command && (
        <Detail label="command">
          <CodeBlock language="bash" content={command} />
        </Detail>
      )}
      {activity.output && (
        <Detail label={`output · ${formatBytes(activity.output.length)}`}>
          <CodeBlock content={activity.output} tone={isError ? "alarm" : undefined} />
        </Detail>
      )}
    </>
  );
}

function DefaultDetails({
  activity,
  fullInput,
  isError,
}: {
  activity: ToolCallActivity;
  fullInput: string;
  isError: boolean;
}) {
  return (
    <>
      {fullInput && fullInput !== "{}" && (
        <Detail label="args">
          <CodeBlock language="json" content={fullInput} />
        </Detail>
      )}
      {activity.output !== null && activity.output.length > 0 && (
        <Detail label={`output · ${formatBytes(activity.output.length)}`}>
          <CodeBlock content={activity.output} tone={isError ? "alarm" : undefined} />
        </Detail>
      )}
      {activity.output === null && activity.status !== "running" && (
        <p className="font-mono text-[11px] text-fg-muted/85">(no output captured)</p>
      )}
    </>
  );
}

function Path({
  label,
  path,
  children,
}: {
  label: string;
  path: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{path}</span>
      {children}
    </div>
  );
}

function CodeBlock({
  language,
  content,
  tone,
}: {
  language?: string;
  content: string;
  tone?: "accent" | "alarm";
}) {
  return (
    <pre
      className={cn(
        "max-h-80 overflow-auto rounded border p-3 font-mono text-[11px] leading-relaxed",
        tone === "accent" && "border-cyan/30 bg-cyan/[0.04] text-fg",
        tone === "alarm" && "border-alarm/30 bg-alarm/[0.06] text-alarm",
        !tone && "border-mist-10 bg-surface text-fg"
      )}
      data-language={language}
    >
      {content}
    </pre>
  );
}

function extOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "txt";
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

// ─── Verb mapping for known tools ──────────────────────────────────────────

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

// ─── Tool icon map ────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, LucideIcon> = {
  Read: FileText,
  Write: PenLine,
  Edit: Pencil,
  Bash: Terminal,
  Glob: FolderSearch,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Search,
  Skill: Sparkles,
  TodoWrite: ListChecks,
  NotebookEdit: NotebookPen,
};

function iconFor(toolName: string): LucideIcon {
  return TOOL_ICONS[toolName] ?? Wrench;
}

// ─── Smart label extraction (OpenCode pattern) ────────────────────────────

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
