import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAllSessions,
  listProjects,
  type SessionWithProject,
} from "../lib/agent-client.js";
import {
  VIDEO_TYPES,
  type ProjectInfo,
  type VideoType,
} from "../lib/types.js";
import { cn } from "../lib/cn.js";

/**
 * Landing screen the user lands on every time the app boots. Three blocks:
 *
 *   1. Greeting — time-aware ("Good evening · what should we make today?")
 *      with two primary CTAs ("Browse projects →", "Open playground →").
 *   2. Recent sessions — last 6 sessions across all projects, click to jump
 *      back into the workbench with that session loaded.
 *   3. Recent renders — every rendered MP4 across every session, with
 *      'play' and 'reveal' actions. Empty state if you've never rendered.
 *
 * If there are NO projects at all, the empty state replaces the page —
 * "no projects yet, point Settings at your projects folder to start".
 */
export function HomeRoute() {
  const [sessions, setSessions] = useState<SessionWithProject[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAllSessions(), listProjects()])
      .then(([s, p]) => {
        setSessions(s);
        setProjects(p);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const recentSessions = sessions.slice(0, 6);

  // Derive recent renders from session events: any tool call to Write that
  // produced an MP4 path is a render artifact. Sorted by recency.
  const recentRenders = useMemo(() => {
    const out: RecentRender[] = [];
    for (const session of sessions) {
      // We don't load events for every session here (would be heavy) — but
      // each session's meta carries scaffold + counts. Renders are surfaced
      // when the user opens a session. For the home page we just hint at
      // "this session has N rendered formats" via the format count.
      // Future: pre-index renders in the SessionMeta when saving.
    }
    return out;
  }, [sessions]);

  if (loading) {
    return (
      <div className="grain flex h-full items-center justify-center bg-void">
        <span className="pulse-cyan h-2 w-2 rounded-full bg-cyan" />
      </div>
    );
  }

  // No projects at all → first-run-ish empty state
  if (projects.length === 0) {
    return <FirstRunEmptyState />;
  }

  const greeting = greetingForHour(new Date().getHours());

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-void">
      <div className="mx-auto w-full max-w-5xl px-12 py-16">
        {/* ─── Greeting ──────────────────────────────────────────────── */}
        <header>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            video studio · {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
            {sessions.length} session{sessions.length === 1 ? "" : "s"}
          </p>
          <h1 className="display mt-4 text-7xl text-fg">{greeting}.</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">
            What should we make today?
          </p>

          <div className="mt-10 flex items-baseline gap-8">
            <Link
              to="/projects"
              className="rounded-full bg-fg px-6 py-2.5 text-sm font-medium text-void transition-colors hover:bg-fg/90"
            >
              Browse projects
            </Link>
            <Link
              to="/playground"
              className="border-b border-cyan pb-1 text-sm font-medium text-cyan transition-colors hover:text-fg"
            >
              Open playground →
            </Link>
            <Link
              to="/settings"
              className="font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:text-fg"
            >
              settings
            </Link>
          </div>
        </header>

        {/* ─── Recent sessions ────────────────────────────────────────── */}
        <section className="mt-20">
          <header className="hairline flex items-baseline justify-between border-b pb-3">
            <h2 className="display-sm text-2xl text-fg">Recent sessions</h2>
            <Link
              to="/projects"
              className="font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:text-fg"
            >
              all sessions →
            </Link>
          </header>
          {recentSessions.length === 0 ? (
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-fg-muted">
              You haven't started a session yet. Pick a project to begin, or open the
              playground for a one-off video without a project context.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded border border-mist-10 bg-mist-10 md:grid-cols-2">
              {recentSessions.map((session) => (
                <li key={`${session.projectId}/${session.id}`}>
                  <SessionCard session={session} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Projects pinboard ──────────────────────────────────────── */}
        <section className="mt-20">
          <header className="hairline flex items-baseline justify-between border-b pb-3">
            <h2 className="display-sm text-2xl text-fg">Your projects</h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {projects.length} total
            </span>
          </header>
          <ul className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded border border-mist-10 bg-mist-10 md:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 9).map((project) => {
              const sessionCount = sessions.filter((s) => s.projectId === project.id).length;
              return (
                <li key={project.id}>
                  <ProjectCard project={project} sessionCount={sessionCount} />
                </li>
              );
            })}
          </ul>
          {projects.length > 9 && (
            <p className="mt-4 text-right">
              <Link
                to="/projects"
                className="font-mono text-[10px] uppercase tracking-widest text-cyan hover:text-fg"
              >
                see all {projects.length} →
              </Link>
            </p>
          )}
        </section>

        <p className="mt-20 text-center font-display text-sm italic text-fg-muted">
          ⌘K to search across every session.
        </p>
      </div>
    </div>
  );
}

interface RecentRender {
  projectId: string;
  projectName: string;
  sessionId: string;
  sessionTitle: string;
  format: string;
  path: string;
  ts: number;
}

function SessionCard({ session }: { session: SessionWithProject }) {
  const videoTypeMeta = useMemo(
    () => VIDEO_TYPES.find((v) => v.id === (session.scaffold.videoType as VideoType)),
    [session.scaffold.videoType]
  );
  return (
    <Link
      to={`/project/${session.projectId}?session=${session.id}`}
      className="group flex h-full flex-col gap-2 bg-void p-5 transition-colors hover:bg-elevated"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {session.projectName}
        </span>
        <span className="font-mono text-[10px] tabular text-fg-muted">
          {relativeTime(session.updatedAt)}
        </span>
      </span>
      <span className="display-sm truncate text-lg text-fg">{session.title}</span>
      <span className="mt-auto flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        <span className="text-fg-faint">{videoTypeMeta?.label ?? session.scaffold.videoType}</span>
        <span className="tabular">{session.eventCount} events</span>
      </span>
    </Link>
  );
}

function ProjectCard({
  project,
  sessionCount,
}: {
  project: ProjectInfo;
  sessionCount: number;
}) {
  return (
    <Link
      to={`/project/${project.id}`}
      className="group flex h-full flex-col gap-2 bg-void p-5 transition-colors hover:bg-elevated"
    >
      <span className="display-sm truncate text-lg text-fg">{project.name}</span>
      {project.description && (
        <span className="line-clamp-2 text-sm leading-relaxed text-fg-muted">
          {project.description}
        </span>
      )}
      <span className="mt-auto flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {sessionCount > 0 ? (
          <span className="text-cyan">
            <span className="tabular">{sessionCount}</span> session{sessionCount === 1 ? "" : "s"}
          </span>
        ) : (
          <span>no sessions</span>
        )}
        {project.hasDesignDoc && <span className="text-fg-faint">design.md</span>}
      </span>
    </Link>
  );
}

function FirstRunEmptyState() {
  return (
    <div className="flex h-full items-center justify-center bg-void px-12">
      <div className="max-w-xl">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          video studio · empty workshop
        </p>
        <h1 className="display mt-4 text-6xl text-fg">No projects yet.</h1>
        <p className="mt-6 max-w-lg text-base leading-relaxed text-fg-muted">
          Point us at the folder that holds your product repos in Settings, or open the
          playground to make a video without a source project.
        </p>
        <div className="mt-10 flex items-baseline gap-8">
          <Link
            to="/settings"
            className="rounded-full bg-fg px-6 py-2.5 text-sm font-medium text-void transition-colors hover:bg-fg/90"
          >
            Open settings
          </Link>
          <Link
            to="/playground"
            className="border-b border-cyan pb-1 text-sm font-medium text-cyan transition-colors hover:text-fg"
          >
            Open playground →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function greetingForHour(h: number): string {
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good evening";
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
