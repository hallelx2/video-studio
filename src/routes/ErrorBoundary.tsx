import { useRouteError, Link } from "react-router-dom";

export function ErrorBoundary() {
  const error = useRouteError() as Error & { status?: number; statusText?: string };
  const message = error?.message ?? error?.statusText ?? String(error ?? "Unknown error");
  const code = error?.status ? `${error.status}` : "ERR";

  return (
    <div className="grain flex h-screen w-screen items-center justify-center bg-void px-12 text-fg">
      <div className="max-w-xl">
        <p className="font-mono text-xs uppercase tracking-widest text-fg-muted">
          {code} · the workshop is silent
        </p>
        <h1 className="display mt-4 text-6xl text-fg">Something gave way.</h1>
        <pre className="mt-8 max-h-64 overflow-auto whitespace-pre-wrap border border-mist-10 bg-surface p-4 font-mono text-xs text-fg-muted">
          {message}
        </pre>
        <Link
          to="/"
          className="mt-8 inline-block border-b border-cyan pb-0.5 text-sm text-cyan transition-colors hover:text-fg"
        >
          ← back to projects
        </Link>
      </div>
    </div>
  );
}
