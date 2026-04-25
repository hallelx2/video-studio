import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn.js";
import { VIDEO_TYPES, type SessionMeta, type VideoType } from "../../lib/types.js";

/**
 * Persistent left sidebar — same pattern as ChatGPT, Claude.ai, NotebookLM,
 * OpenCode. Lists every session for the current project. Click a row to
 * switch; click `+ new session` at the top to spawn a fresh one.
 *
 * Width is fixed at 260px so the chat surface in the center keeps its
 * breathing room. The whole thing is one always-visible column inside the
 * workbench layout.
 */
export function SessionSidebar({
  projectId,
  current,
  sessions,
  onSelect,
  onCreateNew,
  onRename,
  onDelete,
}: {
  projectId: string;
  current: SessionMeta | null;
  sessions: SessionMeta[];
  onSelect: (sessionId: string) => void;
  onCreateNew: () => void;
  onRename: (sessionId: string, title: string) => void;
  onDelete: (sessionId: string) => void;
}) {
  const grouped = useMemo(() => groupByRecency(sessions), [sessions]);

  return (
    <aside className="hairline flex w-[260px] shrink-0 flex-col overflow-hidden border-r bg-ink">
      {/* Project header */}
      <header className="hairline border-b px-5 pb-4 pt-6">
        <Link
          to="/"
          className="font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
        >
          ← all projects
        </Link>
        <h2 className="display-sm mt-2 truncate text-xl text-paper" title={projectId}>
          {projectId}
        </h2>
        <p className="mt-1 font-mono text-[10px] tabular tracking-widest text-paper-mute">
          {sessions.length} session{sessions.length === 1 ? "" : "s"}
        </p>
      </header>

      {/* + New session */}
      <div className="hairline border-b px-3 py-3">
        <button
          type="button"
          onClick={onCreateNew}
          className={cn(
            "group flex w-full items-center gap-2 rounded-lg border border-paper-mute/15 bg-ink-raised px-3 py-2",
            "text-sm font-medium text-paper transition-colors",
            "hover:border-paper-mute/30 hover:bg-ink-edge"
          )}
        >
          <PlusGlyph className="h-3.5 w-3.5 text-paper-mute group-hover:text-cinnabar" />
          <span>New session</span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-paper-mute/60">
            ⌘N
          </span>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {sessions.length === 0 ? (
          <p className="px-3 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-paper-mute/70">
            no sessions yet
          </p>
        ) : (
          grouped.map((group) => (
            <section key={group.label} className="mb-4 last:mb-0">
              <h3 className="px-3 pb-1.5 pt-2 font-mono text-[10px] uppercase tracking-widest text-paper-mute/60">
                {group.label}
              </h3>
              <ul>
                {group.items.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    active={session.id === current?.id}
                    onSelect={() => onSelect(session.id)}
                    onRename={(title) => onRename(session.id, title)}
                    onDelete={() => onDelete(session.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  session: SessionMeta;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const videoTypeMeta = useMemo(
    () => VIDEO_TYPES.find((v) => v.id === (session.scaffold.videoType as VideoType)),
    [session.scaffold.videoType]
  );

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.title) onRename(trimmed);
    setEditing(false);
  };

  return (
    <li
      className={cn(
        "group/row mb-px rounded-lg transition-colors",
        active ? "bg-ink-edge" : "hover:bg-ink-raised"
      )}
    >
      <div
        className="relative flex items-stretch"
        onContextMenu={(e) => {
          // Right-click = rename (matches OpenCode)
          e.preventDefault();
          if (!editing) {
            setDraft(session.title);
            setEditing(true);
          }
        }}
      >
        <button
          type="button"
          onClick={() => !editing && onSelect()}
          disabled={editing}
          className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left"
        >
          <span className="mt-1 shrink-0">
            <span
              className={cn(
                "block h-1.5 w-1.5 rounded-full transition-colors",
                active ? "bg-cinnabar" : "bg-transparent"
              )}
            />
          </span>
          <span className="min-w-0 flex-1">
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft(session.title);
                    setEditing(false);
                  }
                  e.stopPropagation();
                }}
                className="block w-full bg-transparent font-sans text-sm text-paper focus:outline-none"
              />
            ) : (
              <span
                className={cn(
                  "block truncate font-sans text-sm",
                  active ? "text-paper" : "text-paper/90"
                )}
              >
                {session.title}
              </span>
            )}
            <span className="mt-0.5 flex items-baseline gap-2 font-mono text-[10px] text-paper-mute">
              <span className="truncate text-brass">
                {videoTypeMeta?.label ?? session.scaffold.videoType}
              </span>
              <span className="shrink-0 tabular text-paper-mute/70">·</span>
              <span className="shrink-0 tabular">{relativeTime(session.updatedAt)}</span>
            </span>
          </span>
        </button>

        {/* Hover-revealed row actions */}
        {!editing && (
          <span className="flex shrink-0 items-center gap-0.5 px-1.5 opacity-0 transition-opacity group-hover/row:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDraft(session.title);
                setEditing(true);
              }}
              className="rounded-md p-1 text-paper-mute transition-colors hover:bg-ink-edge hover:text-paper"
              title="Rename (or right-click)"
            >
              <PencilGlyph className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete session "${session.title}"?`)) onDelete();
              }}
              className="rounded-md p-1 text-paper-mute transition-colors hover:bg-alarm/15 hover:text-alarm"
              title="Delete"
            >
              <TrashGlyph className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

// ─── Glyphs ───────────────────────────────────────────────────────────────

function PlusGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path
        d="M6 2v8M2 6h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PencilGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path
        d="M2 10 L4 9.5 L9.5 4 L8 2.5 L2.5 8 Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path
        d="M2.5 3.5 L9.5 3.5 M4.5 3.5 V2.5 H7.5 V3.5 M3.5 3.5 V10 H8.5 V3.5"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface RecencyGroup {
  label: string;
  items: SessionMeta[];
}

function groupByRecency(sessions: SessionMeta[]): RecencyGroup[] {
  const now = Date.now();
  const today = startOfDay(now);
  const yesterday = today - 24 * 3600 * 1000;
  const last7 = today - 7 * 24 * 3600 * 1000;
  const last30 = today - 30 * 24 * 3600 * 1000;

  const buckets: { label: string; threshold: number }[] = [
    { label: "Today", threshold: today },
    { label: "Yesterday", threshold: yesterday },
    { label: "Last 7 days", threshold: last7 },
    { label: "Last 30 days", threshold: last30 },
    { label: "Older", threshold: 0 },
  ];

  const groups: Map<string, SessionMeta[]> = new Map();
  for (const session of sessions) {
    const ts = session.updatedAt;
    const bucket = buckets.find((b) => ts >= b.threshold);
    const label = bucket?.label ?? "Older";
    const arr = groups.get(label) ?? [];
    arr.push(session);
    groups.set(label, arr);
  }

  // Preserve bucket order, drop empty groups.
  return buckets
    .map((b) => ({ label: b.label, items: groups.get(b.label) ?? [] }))
    .filter((g) => g.items.length > 0);
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function relativeTime(ts: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  return `${month}mo ago`;
}
