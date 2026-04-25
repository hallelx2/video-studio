import { useRouteError, Link } from "react-router-dom";

export function ErrorBoundary() {
  const error = useRouteError() as Error & { status?: number; statusText?: string };
  const message = error?.message ?? error?.statusText ?? String(error ?? "Unknown error");
  const code = error?.status ? `${error.status}` : "ERR";

  return (
    <div className="grain flex h-screen w-screen items-center justify-center bg-ink px-12 text-paper">
      <div className="max-w-xl">
        <p className="font-mono text-xs uppercase tracking-widest text-paper-mute">
          {code} · the workshop is silent
        </p>
        <h1 className="display mt-4 text-6xl text-paper">Something gave way.</h1>
        <pre className="mt-8 max-h-64 overflow-auto whitespace-pre-wrap border border-brass-line bg-ink-raised p-4 font-mono text-xs text-paper-mute">
          {message}
        </pre>
        <Link
          to="/"
          className="mt-8 inline-block border-b border-cinnabar pb-0.5 text-sm text-cinnabar transition-colors hover:text-paper"
        >
          ← back to projects
        </Link>
      </div>
    </div>
  );
}
