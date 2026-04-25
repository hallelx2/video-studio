import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects } from "../lib/agent-client.js";
import type { ProjectInfo } from "../lib/types.js";

/**
 * Projects route — left rail lists projects, main stage shows the selected
 * project's metadata. Per DESIGN.md: asymmetric, ~28% rail, no centered hero,
 * no card grid.
 *
 * NOTE: this is a functional stub. Phase 8 will polish typography rhythm,
 * empty states, animations, and the main-stage detail view.
 */
export function ProjectsRoute() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then((p) => {
        setProjects(p);
        if (p.length > 0) setActiveId(p[0].id);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const active = projects.find((p) => p.id === activeId) ?? null;

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ─── Left rail (~360px) ─────────────────────────────────────────── */}
      <aside className="hairline flex w-[360px] shrink-0 flex-col border-r bg-ink">
        <div className="px-8 pb-6 pt-10">
          <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            video studio
          </p>
          <h2 className="display-sm mt-2 text-3xl text-paper">Projects</h2>
        </div>

        <nav className="flex-1 overflow-y-auto px-4">
          {loading && <RailSkeleton />}
          {error && <p className="px-4 text-xs text-alarm">{error}</p>}
          {!loading && projects.length === 0 && (
            <p className="px-4 text-xs leading-relaxed text-paper-mute">
              No projects found. Open <Link to="/settings" className="text-cinnabar underline-offset-4 hover:underline">settings</Link> and pick the folder that holds your product repos.
            </p>
          )}
          <ul className="stagger-children">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setActiveId(p.id)}
                  className="group flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-ink-raised"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={
                        activeId === p.id
                          ? "h-1.5 w-1.5 rounded-full bg-cinnabar"
                          : "h-1.5 w-1.5 rounded-full bg-transparent"
                      }
                    />
                    <span className="text-sm font-medium text-paper">{p.name}</span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-paper-mute opacity-0 transition-opacity group-hover:opacity-100">
                    open →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <footer className="hairline border-t px-8 py-5 font-mono text-[11px] tabular text-paper-mute">
          <div className="flex justify-between">
            <span>{String(projects.length).padStart(2, "0")} projects</span>
            <Link to="/settings" className="hover:text-paper transition-colors">settings →</Link>
          </div>
        </footer>
      </aside>

      {/* ─── Main stage ─────────────────────────────────────────────────── */}
      <section className="flex flex-1 flex-col overflow-hidden px-16 py-10">
        {active ? (
          <div key={active.id} className="enter-rise">
            <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
              workbench
            </p>
            <h1 className="display mt-3 text-7xl text-paper">{active.name}</h1>
            {active.description && (
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-paper-mute">
                {active.description}
              </p>
            )}

            <dl className="hairline mt-12 grid max-w-2xl grid-cols-2 gap-x-12 gap-y-5 border-t pt-8 font-mono text-xs">
              <Field label="folder">
                <span className="break-all text-paper">{active.path}</span>
              </Field>
              <Field label="readme">
                <span className={active.hasReadme ? "text-paper" : "text-paper-mute"}>
                  {active.hasReadme ? "present" : "missing"}
                </span>
              </Field>
              <Field label="launch post">
                <span className={active.hasLaunchPost ? "text-paper" : "text-paper-mute"}>
                  {active.hasLaunchPost ? "found" : "—"}
                </span>
              </Field>
              <Field label="design.md">
                <span className={active.hasDesignDoc ? "text-cinnabar" : "text-paper-mute"}>
                  {active.hasDesignDoc ? "brand-locked" : "will inherit default"}
                </span>
              </Field>
            </dl>

            <div className="mt-12">
              <Link
                to={`/project/${active.id}`}
                className="inline-block border-b border-cinnabar pb-1 text-base text-cinnabar transition-colors hover:text-paper"
              >
                Open the workbench →
              </Link>
            </div>
          </div>
        ) : !loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="display-sm text-3xl text-paper-mute">Pick a project from the rail.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-paper-mute">{label}</dt>
      <dd className="mt-1 text-paper">{children}</dd>
    </div>
  );
}

function RailSkeleton() {
  return (
    <ul className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="mx-4 h-7 bg-ink-raised" />
      ))}
    </ul>
  );
}
