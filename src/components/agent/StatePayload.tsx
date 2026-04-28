import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  CircleCheck,
  Code,
  Copy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/cn.js";

/**
 * The agent often echoes its own state by emitting JSON with a `type` tag —
 * `{"type":"progress",…}` and `{"type":"result",…}` are the two we see in
 * practice. Rendering those as raw JSON code blocks technically works but
 * they're *state*, not data — they want a richer visual treatment that
 * communicates phase, message, percentage, success/failure outputs, etc.
 *
 * `tryRenderStatePayload` peeks at a parsed JSON value and, if it matches
 * one of our known state shapes, returns a rich React node. Otherwise it
 * returns null and the caller falls back to the JSON code block.
 *
 * Recognized shapes:
 *   - { type: "progress", phase, message, progress }
 *   - { type: "result",   status: "success" | "error" | "needs_input",
 *                         message, artifacts? }
 */

export function tryRenderStatePayload(value: unknown, raw: string): React.ReactNode | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const type = obj.type;
  if (type === "progress") return <ProgressState value={obj} raw={raw} />;
  if (type === "result") return <ResultState value={obj} raw={raw} />;
  return null;
}

// ─── Progress state ─────────────────────────────────────────────────────

function ProgressState({
  value,
  raw,
}: {
  value: Record<string, unknown>;
  raw: string;
}) {
  const phase = typeof value.phase === "string" ? humanize(value.phase) : null;
  const message = typeof value.message === "string" ? value.message : null;
  const pct =
    typeof value.progress === "number" ? Math.max(0, Math.min(1, value.progress)) : null;
  const pctInt = pct !== null ? Math.round(pct * 100) : null;

  return (
    <StateFrame
      tone="cyan"
      icon={Activity}
      label="progress"
      headline={phase}
      raw={raw}
      meta={
        pctInt !== null ? (
          <span className="font-mono text-[11px] tabular text-cyan">{pctInt}%</span>
        ) : null
      }
    >
      {message && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted [overflow-wrap:anywhere]">
          {message}
        </p>
      )}
      {pct !== null && (
        <span
          aria-hidden
          className="relative mt-3 block h-0.5 w-full overflow-hidden rounded-full bg-mist-06"
        >
          <span
            className="absolute inset-y-0 left-0 min-w-[2px] rounded-full bg-cyan shadow-[0_0_6px_var(--color-cyan-glow)] transition-[width] duration-300 ease-[var(--ease-composio)]"
            style={{ width: `${pct * 100}%` }}
          />
        </span>
      )}
    </StateFrame>
  );
}

// ─── Result state ──────────────────────────────────────────────────────

function ResultState({
  value,
  raw,
}: {
  value: Record<string, unknown>;
  raw: string;
}) {
  const status =
    value.status === "success" || value.status === "error" || value.status === "needs_input"
      ? value.status
      : "unknown";
  const message = typeof value.message === "string" ? value.message : null;
  const artifacts =
    value.artifacts && typeof value.artifacts === "object"
      ? (value.artifacts as Record<string, unknown>)
      : null;
  const outputs = Array.isArray(artifacts?.outputs)
    ? (artifacts.outputs as Array<Record<string, unknown>>)
    : [];
  const warnings = Array.isArray(artifacts?.warnings)
    ? (artifacts.warnings as string[])
    : [];

  const meta: Array<{ key: string; value: string }> = [];
  for (const key of ["status", "duration", "format", "size"]) {
    const v = value[key];
    if (typeof v === "string" || typeof v === "number") {
      meta.push({ key, value: String(v) });
    }
  }

  if (status === "success") {
    return (
      <StateFrame
        tone="cyan"
        icon={CircleCheck}
        label="result · success"
        headline={message ?? "Completed"}
        raw={raw}
      >
        {outputs.length > 0 && (
          <ul className="mt-3 overflow-hidden rounded border border-mist-10 divide-y divide-mist-08">
            {outputs.map((o, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 bg-surface/60 px-3 py-2"
              >
                <span className="flex min-w-0 items-baseline gap-2.5">
                  {typeof o.format === "string" && (
                    <span className="inline-flex shrink-0 items-baseline rounded-full border border-cyan/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan">
                      {o.format}
                    </span>
                  )}
                  {typeof o.path === "string" && (
                    <span className="min-w-0 truncate font-mono text-[11px] text-fg-muted [overflow-wrap:anywhere]">
                      {o.path}
                    </span>
                  )}
                </span>
                {(typeof o.size === "string" || typeof o.duration === "string") && (
                  <span className="flex shrink-0 items-baseline gap-2 font-mono text-[10px] tabular text-fg-muted/85">
                    {typeof o.size === "string" && <span>{o.size}</span>}
                    {typeof o.duration === "string" && <span>· {o.duration}</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {warnings.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-fg-faint hover:text-fg">
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-1.5 space-y-1 pl-2">
              {warnings.map((w, i) => (
                <li key={i} className="font-mono text-[11px] text-fg-muted/85 [overflow-wrap:anywhere]">
                  · {w}
                </li>
              ))}
            </ul>
          </details>
        )}
      </StateFrame>
    );
  }

  if (status === "error") {
    return (
      <StateFrame tone="alarm" icon={AlertTriangle} label="result · error" raw={raw} brutalist>
        {message && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-alarm [overflow-wrap:anywhere]">
            {message}
          </p>
        )}
      </StateFrame>
    );
  }

  if (status === "needs_input") {
    return (
      <StateFrame tone="muted" icon={Ban} label="result · awaiting" raw={raw}>
        {message && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted [overflow-wrap:anywhere]">
            {message}
          </p>
        )}
      </StateFrame>
    );
  }

  // Unknown status — fall back to a muted info card.
  return (
    <StateFrame
      tone="muted"
      icon={Activity}
      label="result"
      headline={typeof value.status === "string" ? String(value.status) : null}
      raw={raw}
    >
      {message && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted [overflow-wrap:anywhere]">
          {message}
        </p>
      )}
      {meta.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {meta.map((m) => (
            <div key={m.key} className="contents">
              <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                {m.key}
              </dt>
              <dd className="min-w-0 truncate font-mono text-[11px] text-fg [overflow-wrap:anywhere]">
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </StateFrame>
  );
}

// ─── Shared frame ──────────────────────────────────────────────────────

function StateFrame({
  tone,
  icon: Icon,
  label,
  headline,
  meta,
  brutalist = false,
  raw,
  children,
}: {
  tone: "cyan" | "alarm" | "muted";
  icon: LucideIcon;
  label: string;
  headline?: string | null;
  meta?: React.ReactNode;
  brutalist?: boolean;
  /** Original JSON string — fuels the "view raw" toggle + copy button. */
  raw: string;
  children?: React.ReactNode;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(raw).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <article
      className={cn(
        "overflow-hidden rounded border transition-shadow",
        tone === "cyan" && "border-cyan/30 bg-cyan/[0.04]",
        tone === "alarm" && "border-alarm/40 bg-alarm/[0.04]",
        tone === "muted" && "border-mist-10 bg-surface/40",
        brutalist && "shadow-brutalist"
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-mist-06 px-3 py-2">
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1",
            tone === "cyan" && "bg-cyan/[0.12] text-cyan ring-cyan/40",
            tone === "alarm" && "bg-alarm/[0.10] text-alarm ring-alarm/30",
            tone === "muted" && "bg-mist-04 text-fg-muted ring-mist-10"
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] uppercase tracking-[0.18em]",
            tone === "cyan" && "text-cyan",
            tone === "alarm" && "text-alarm",
            tone === "muted" && "text-fg-muted"
          )}
        >
          {label}
        </span>
        {headline && (
          <span className="min-w-0 flex-1 truncate text-[12.5px] tracking-tight text-fg">
            {headline}
          </span>
        )}
        {!headline && <span className="flex-1" />}
        <span className="flex shrink-0 items-center gap-1.5">
          {meta}
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            aria-pressed={showRaw}
            title={showRaw ? "Hide raw JSON" : "View raw JSON"}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded border px-1.5 font-mono text-[9.5px] uppercase tracking-widest transition-colors",
              showRaw
                ? "border-cyan/30 bg-cyan/[0.06] text-cyan"
                : "border-mist-08 text-fg-muted/80 hover:border-mist-12 hover:bg-mist-04 hover:text-fg"
            )}
          >
            <Code className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            raw
          </button>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy raw JSON"}
            title={copied ? "Copied" : "Copy raw JSON"}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded border px-1.5 font-mono text-[9.5px] uppercase tracking-widest transition-colors",
              copied
                ? "border-cyan/30 bg-cyan/[0.06] text-cyan"
                : "border-mist-08 text-fg-muted/80 hover:border-mist-12 hover:bg-mist-04 hover:text-fg"
            )}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" strokeWidth={2} aria-hidden />
                ok
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                copy
              </>
            )}
          </button>
        </span>
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      {children !== undefined && children !== null && children !== false && (
        <div className="px-3 py-2.5">{children}</div>
      )}

      {/* ── Raw JSON drawer ────────────────────────────────────────── */}
      {showRaw && (
        <pre className="enter-rise max-h-72 overflow-auto border-t border-mist-06 bg-surface/80 px-3 py-2.5 font-mono text-[11px] leading-[1.6] text-fg/85 whitespace-pre">
          {raw}
        </pre>
      )}
    </article>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function humanize(s: string): string {
  return s.replace(/[_-]+/g, " ").trim();
}
