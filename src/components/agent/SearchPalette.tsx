import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/cn.js";
import {
  getAllSessions,
  type SessionWithProject,
} from "../../lib/agent-client.js";
import { VIDEO_TYPES, type VideoType } from "../../lib/types.js";

/**
 * Global Cmd+K command palette. Lists every session across every project,
 * filterable by free-text. Click a result → deep-link to that project's
 * workbench with the session pre-selected via ?session= URL param.
 *
 * Mounted in App.tsx so the keyboard shortcut works from anywhere in the app.
 * Keyboard:
 *   ↑ / ↓     navigate
 *   ⏎         open
 *   esc       close
 *   ⌘K        toggle (when not already open)
 */
export function SearchPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [sessions, setSessions] = useState<SessionWithProject[]>([]);
  const [loading, setLoading] = useState(false);

  // Load on open. Reset on close.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setQuery("");
    setActiveIndex(0);
    getAllSessions()
      .then((rows) => setSessions(rows))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [open]);

  // Focus input on open.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sessions;
    const q = query.toLowerCase();
    return sessions.filter((s) => {
      if (s.title.toLowerCase().includes(q)) return true;
      if (s.projectName.toLowerCase().includes(q)) return true;
      if (s.projectId.toLowerCase().includes(q)) return true;
      if (s.scaffold.videoType.toLowerCase().includes(q)) return true;
      const formats = s.scaffold.formats.join(" ").toLowerCase();
      if (formats.includes(q)) return true;
      return false;
    });
  }, [sessions, query]);

  // Reset highlight when the list shape changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length, query]);

  // Auto-scroll the active item into view.
  useEffect(() => {
    const node = listRef.current?.children?.[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const open_session = (row: SessionWithProject) => {
    navigate(`/project/${row.projectId}?session=${row.id}`);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[activeIndex];
      if (target) open_session(target);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search sessions"
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/70 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        // Click outside the panel closes
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full max-w-2xl overflow-hidden rounded-2xl border border-paper-mute/15 bg-ink-raised shadow-2xl shadow-ink/80",
          "enter-rise"
        )}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-paper-mute/10 px-5 py-4">
          <SearchIcon className="h-4 w-4 text-paper-mute" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search sessions across all projects…"
            className="w-full bg-transparent font-sans text-base text-paper placeholder:text-paper-mute/55 focus:outline-none"
            type="search"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/80">
            esc
          </span>
        </div>

        {/* Body */}
        {loading ? (
          <p className="px-5 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-paper-mute/85">
            loading sessions…
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-paper-mute/85">
            {sessions.length === 0
              ? "no sessions yet · type / in a project to start one"
              : `no matches for "${query}"`}
          </p>
        ) : (
          <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1.5">
            {filtered.map((row, i) => (
              <li key={`${row.projectId}/${row.id}`}>
                <PaletteRow
                  row={row}
                  active={i === activeIndex}
                  query={query}
                  onHover={() => setActiveIndex(i)}
                  onSelect={() => open_session(row)}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-paper-mute/10 px-5 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            {filtered.length} of {sessions.length}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/80">
            ↑↓ nav · ⏎ open · esc close
          </span>
        </footer>
      </div>
    </div>
  );
}

function PaletteRow({
  row,
  active,
  query,
  onHover,
  onSelect,
}: {
  row: SessionWithProject;
  active: boolean;
  query: string;
  onHover: () => void;
  onSelect: () => void;
}) {
  const videoTypeMeta = useMemo(
    () => VIDEO_TYPES.find((v) => v.id === (row.scaffold.videoType as VideoType)),
    [row.scaffold.videoType]
  );

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        "group flex w-full items-start gap-4 px-5 py-3 text-left transition-colors",
        active ? "bg-ink-edge" : "hover:bg-ink-edge/60"
      )}
    >
      <span className="mt-1.5 shrink-0">
        <span
          className={cn(
            "block h-1.5 w-1.5 rounded-full transition-colors",
            active ? "bg-cinnabar" : "bg-paper-mute/30"
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-sans text-sm text-paper">
          <Highlight text={row.title} query={query} />
        </span>
        <span className="mt-0.5 flex items-baseline gap-2 font-mono text-[10px] text-paper-mute">
          <span className="truncate text-paper-mute">
            <Highlight text={row.projectName} query={query} />
          </span>
          <span>·</span>
          <span className="truncate text-brass">
            <Highlight text={videoTypeMeta?.label ?? row.scaffold.videoType} query={query} />
          </span>
          <span>·</span>
          <span className="tabular">
            {row.eventCount} event{row.eventCount === 1 ? "" : "s"}
          </span>
          <span className="ml-auto tabular">{relativeTime(row.updatedAt)}</span>
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "self-center font-mono text-base transition-opacity",
          active ? "text-cinnabar opacity-100" : "text-paper-mute opacity-0 group-hover:opacity-100"
        )}
      >
        →
      </span>
    </button>
  );
}

/** Bold the matching segment of `text` against `query` (case-insensitive). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <>
      {before}
      <span className="text-paper">
        <strong className="font-semibold">{match}</strong>
      </span>
      {after}
    </>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={className} aria-hidden>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
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
