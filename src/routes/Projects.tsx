import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Sparkles, ArrowRight } from "lucide-react";
import { listProjects } from "../lib/agent-client.js";
import type { ProductInfo } from "../lib/types.js";
import { cn } from "../lib/cn.js";

export function ProjectsRoute() {
  const [projects, setProjects] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then((p) => setProjects(p))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-zinc-900 px-12 py-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-4xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-2 text-zinc-500">Pick a product to generate a launch video.</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-12 py-10">
        <div className="mx-auto max-w-6xl">
          {loading && <SkeletonGrid />}
          {error && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
              Failed to load projects: {error}
            </div>
          )}
          {!loading && !error && projects.length === 0 && (
            <div className="rounded-lg border border-zinc-900 bg-zinc-950/50 p-8 text-center">
              <p className="text-zinc-400">
                No projects found. Set <code className="text-zinc-200">ORG_PROJECTS_PATH</code> in your <code className="text-zinc-200">.env</code> file.
              </p>
            </div>
          )}
          {!loading && !error && projects.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProductInfo }) {
  return (
    <Link
      to={`/project/${project.id}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-zinc-900 bg-zinc-950/50 p-5 transition",
        "hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/40"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-50 tracking-tight">{project.name}</h3>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{project.id}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
      </div>
      {project.description && (
        <p className="line-clamp-2 text-sm text-zinc-400">{project.description}</p>
      )}
      <div className="mt-auto flex items-center gap-3 text-xs text-zinc-600">
        {project.has_readme && (
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" /> README
          </span>
        )}
        {project.has_launch_post && (
          <span className="inline-flex items-center gap-1 text-blue-400/70">
            <Sparkles className="h-3 w-3" /> Launch post
          </span>
        )}
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl border border-zinc-900 bg-zinc-950/50" />
      ))}
    </div>
  );
}
