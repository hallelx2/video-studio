import { Link, useRouteError } from "react-router-dom";
import { AlertTriangle, Home } from "lucide-react";

/**
 * Global route error boundary.
 * Replaces React Router's default "Unexpected Application Error" screen
 * with something that matches the app's aesthetic and offers a way out.
 */
export function ErrorBoundary() {
  const error = useRouteError() as Error & { status?: number; statusText?: string };

  const title =
    error?.status === 404 ? "Page not found" : error?.statusText || "Something broke";
  const detail =
    error?.status === 404
      ? "That route doesn't exist in Video Studio."
      : error?.message ?? "An unexpected error occurred while rendering this view.";

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 p-12 text-zinc-50">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-500/20 bg-yellow-500/10 text-yellow-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{detail}</p>
        {error?.status && (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-zinc-600">
            {error.status} {error.statusText ?? ""}
          </p>
        )}
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-lg border border-blue-600/30 bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          <Home className="h-4 w-4" />
          Back to projects
        </Link>
      </div>
    </div>
  );
}
