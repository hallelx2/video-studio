import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import { Popover } from "../ui/Popover.js";
import { VIDEO_TYPES, type SessionMeta, type VideoType } from "../../lib/types.js";

/**
 * Session switcher — sits in the workbench header. Shows the current session's
 * title; click to open a popover with all sessions for this project + a
 * "New session" action at the top.
 *
 * Multiple sessions per project let the user iterate on, e.g., a hackathon
 * demo cut and a separate product-launch cut for the same source repo.
 *
 * Each row shows the session's video type and last-touched time. Hover
 * exposes rename + delete affordances.
 */
export function SessionSwitcher({
  current,
  sessions,
  onSelect,
  onCreateNew,
  onRename,
  onDelete,
}: {
  current: SessionMeta | null;
  sessions: SessionMeta[];
  onSelect: (sessionId: string) => void;
  onCreateNew: () => void;
  onRename: (sessionId: string, title: string) => void;
  onDelete: (sessionId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="start"
      className="w-[420px]"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex max-w-full items-center gap-2 rounded-full border border-paper-mute/15 bg-ink px-3 py-1.5",
            "font-mono text-[11px] tracking-wide transition-colors",
            "hover:border-paper-mute/30 hover:bg-ink-edge"
          )}
          title="Switch session"
        >
          <FolderGlyph className="h-3 w-3 shrink-0 text-paper-mute" />
          <span className="max-w-[260px] truncate text-paper">
            {current ? current.title : "no session"}
          </span>
          <ChevronDown
            className={cn("h-3 w-3 shrink-0 text-paper-mute transition-transform", open && "rotate-180")}
          />
        </button>
      )}
    >
      <SessionMenu
        sessions={sessions}
        currentId={current?.id ?? null}
        onSelect={(id) => {
          onSelect(id);
          setOpen(false);
        }}
        onCreateNew={() => {
          onCreateNew();
          setOpen(false);
        }}
        onRename={onRename}
        onDelete={onDelete}
      />
    </Popover>
  );
}

function SessionMenu({
  sessions,
  currentId,
  onSelect,
  onCreateNew,
  onRename,
  onDelete,
}: {
  sessions: SessionMeta[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <header className="flex items-center justify-between border-b border-paper-mute/10 px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          sessions · {sessions.length}
        </span>
        <button
          type="button"
          onClick={onCreateNew}
          className="border-b border-cinnabar pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cinnabar transition-colors hover:text-paper"
        >
          new session →
        </button>
      </header>

      {sessions.length === 0 ? (
        <p className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-paper-mute/70">
          no sessions yet
        </p>
      ) : (
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              active={session.id === currentId}
              onSelect={() => onSelect(session.id)}
              onRename={(title) => onRename(session.id, title)}
              onDelete={() => onDelete(session.id)}
            />
          ))}
        </ul>
      )}
    </div>
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
        "group rounded-md transition-colors",
        active ? "bg-ink-edge" : "hover:bg-ink-edge/60"
      )}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => !editing && onSelect()}
          className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left"
          disabled={editing}
        >
          <span className="mt-1 shrink-0">
            {active ? (
              <DotMark className="h-2.5 w-2.5 text-cinnabar" />
            ) : (
              <span className="block h-2.5 w-2.5" />
            )}
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
              <span className="block truncate font-sans text-sm text-paper">{session.title}</span>
            )}
            <span className="mt-0.5 flex items-baseline gap-3 font-mono text-[10px] text-paper-mute">
              <span className="text-brass">
                {videoTypeMeta?.label ?? session.scaffold.videoType}
              </span>
              <span className="tabular">{session.scaffold.formats.length} fmt</span>
              <span className="tabular">{session.eventCount} events</span>
              <span className="ml-auto tabular">{relativeTime(session.updatedAt)}</span>
            </span>
          </span>
        </button>

        {!editing && (
          <span className="flex shrink-0 items-center gap-1 px-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDraft(session.title);
                setEditing(true);
              }}
              className="rounded-md p-1 text-paper-mute transition-colors hover:bg-ink hover:text-paper"
              title="Rename"
            >
              <PencilGlyph className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete session "${session.title}"?`)) onDelete();
              }}
              className="rounded-md p-1 text-paper-mute transition-colors hover:bg-alarm/20 hover:text-alarm"
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

function FolderGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path
        d="M1.5 3 L4.5 3 L5.5 4 L10.5 4 L10.5 9.5 L1.5 9.5 Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function DotMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <circle cx="6" cy="6" r="3" fill="currentColor" />
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
