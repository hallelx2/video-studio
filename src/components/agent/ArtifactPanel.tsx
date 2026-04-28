import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Highlight, themes, type Language } from "prism-react-renderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "../../lib/cn.js";
import {
  artifactKindLabel,
  isCoreArtifact,
  type Artifact,
  type ArtifactKind,
} from "../../lib/agent-state.js";
import {
  openPath,
  readText,
  revealInFolder,
  setProjectDesignDefault,
  writeText,
} from "../../lib/agent-client.js";
import { usePreview } from "../../lib/preview-context.js";
import { pathToMediaUrl } from "../../lib/media-url.js";

// Width clamping for the resizable panel. Min keeps file rows readable;
// max stops the user from shoving the workbench off-screen.
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 900;
const PANEL_DEFAULT_WIDTH = 420;
const PANEL_WIDTH_KEY = "video-studio.artifactPanel.width";

/**
 * Right-side artifact panel — Hypatia pattern. Every file the agent has
 * touched is auto-extracted from the event log and surfaced here as a
 * navigable list. Click to view in-place; edit text artifacts inline; launch
 * a HyperFrames preview for compositions; reveal binaries (mp4/wav) in OS.
 *
 * Layout:
 *   ┌─ FILES ────────────────────────────┐
 *   │  · script.json          wrote 2x   │
 *   │  · DESIGN.md            wrote      │
 *   │  · 1080x1080/index.html edited     │
 *   │  ─ NARRATION ─                     │
 *   │  · 01-hook.wav                     │
 *   │  ─ RENDERS ─                       │
 *   │  · linkedin.mp4                    │
 *   ├────────────────────────────────────┤
 *   │  [active artifact viewer]          │
 *   │  - text: monospace pre, save edit  │
 *   │  - audio/mp4: open in OS           │
 *   │  - composition: preview button     │
 *   └────────────────────────────────────┘
 */
export function ArtifactPanel({
  artifacts,
  projectId,
}: {
  artifacts: Artifact[];
  /** Used by the 'save as project default' action on DESIGN.md artifacts. */
  projectId?: string;
}) {
  const [activePath, setActivePath] = useState<string | null>(null);

  // Auto-select the most recently touched core artifact when the list grows.
  // (Hypatia's auto-open-on-new-artifact behavior.)
  const lastCorePath = useMemo(() => {
    const cores = artifacts.filter(isCoreArtifact);
    return cores.length > 0 ? cores[0].path : null;
  }, [artifacts]);

  useEffect(() => {
    if (!activePath && lastCorePath) {
      setActivePath(lastCorePath);
    }
  }, [activePath, lastCorePath]);

  const active = useMemo(
    () => artifacts.find((a) => a.path === activePath) ?? null,
    [artifacts, activePath]
  );

  const grouped = useMemo(() => groupByKind(artifacts), [artifacts]);

  // ─── Resizable width ──────────────────────────────────────────────────
  // Drag the 4px gutter on the left edge to widen/narrow. Width is clamped
  // and persisted so it survives reloads. Double-click resets to default;
  // arrow keys nudge ±8 (±32 with Shift); Home resets.
  const [width, setWidth] = useState<number>(PANEL_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  useEffect(() => {
    try {
      const v = window.localStorage?.getItem(PANEL_WIDTH_KEY);
      if (!v) return;
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) return;
      setWidth(Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, n)));
    } catch {
      /* storage blocked */
    }
  }, []);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: width };
      setIsResizing(true);
    },
    [width]
  );
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const start = dragRef.current;
      if (!start) return;
      // Panel sits on the right edge — drag LEFT to widen, RIGHT to shrink.
      const delta = e.clientX - start.startX;
      setWidth(
        Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, start.startWidth - delta))
      );
    };
    const onUp = () => {
      setIsResizing(false);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isResizing]);
  useEffect(() => {
    if (isResizing) return;
    if (width === PANEL_DEFAULT_WIDTH) return;
    try {
      window.localStorage?.setItem(PANEL_WIDTH_KEY, String(width));
    } catch {
      /* storage blocked */
    }
  }, [width, isResizing]);
  const onResizeKey = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 32 : 8;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth((w) => Math.min(PANEL_MAX_WIDTH, w + step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth((w) => Math.max(PANEL_MIN_WIDTH, w - step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setWidth(PANEL_DEFAULT_WIDTH);
    }
  }, []);

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <aside
      className="hairline relative flex shrink-0 flex-col overflow-hidden border-l bg-void"
      style={{ width }}
    >
      {/* Resize handle — 4px grab strip on the left edge with a 1px cyan
          accent line that brightens on hover/drag/focus. Matches the rest
          of the workbench's hairline/cyan visual language. */}
      <div
        role="separator"
        aria-label="Resize artifacts panel"
        aria-orientation="vertical"
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuemax={PANEL_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onMouseDown={onResizeStart}
        onKeyDown={onResizeKey}
        onDoubleClick={() => setWidth(PANEL_DEFAULT_WIDTH)}
        className={cn(
          "group/handle absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize",
          "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-px before:transition-colors",
          isResizing
            ? "before:bg-cyan"
            : "before:bg-transparent group-hover/handle:before:bg-cyan/50 hover:before:bg-cyan/50 focus-visible:before:bg-cyan focus-visible:outline-none"
        )}
      />
      <header className="hairline flex items-baseline justify-between border-b px-6 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          artifacts
        </p>
        <p className="font-mono text-[10px] tabular tracking-widest text-fg-muted">
          {artifacts.length} files
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* File list, grouped by kind */}
        <ul>
          {grouped.map((group) => (
            <li key={group.kind}>
              <h4 className="hairline border-b px-6 pb-1 pt-3 font-mono text-[10px] uppercase tracking-widest text-cyan">
                {artifactKindLabel(group.kind)}
                <span className="ml-2 tabular text-fg-muted/85">{group.items.length}</span>
              </h4>
              <ul>
                {group.items.map((artifact) => (
                  <ArtifactRow
                    key={artifact.path}
                    artifact={artifact}
                    active={activePath === artifact.path}
                    onSelect={() => setActivePath(artifact.path)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>

        {/* Viewer for the active artifact */}
        {active && (
          <div className="hairline border-t bg-surface">
            <ArtifactViewer artifact={active} projectId={projectId} />
          </div>
        )}
      </div>
    </aside>
  );
}

function ArtifactRow({
  artifact,
  active,
  onSelect,
}: {
  artifact: Artifact;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        onClick={onSelect}
        className={cn(
          "group flex w-full items-baseline gap-3 px-6 py-2 text-left transition-colors",
          active ? "bg-elevated" : "hover:bg-surface"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            active ? "bg-cyan" : "bg-transparent"
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs text-fg">{artifact.name}</span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-muted/85">
            {artifact.path}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {artifact.lastAction}
          {artifact.touches > 1 && (
            <span className="ml-1 tabular text-fg-faint">{artifact.touches}×</span>
          )}
        </span>
      </button>
    </li>
  );
}

// ─── Artifact viewer ──────────────────────────────────────────────────────

function ArtifactViewer({
  artifact,
  projectId,
}: {
  artifact: Artifact;
  projectId?: string;
}) {
  const isBinary = isBinaryArtifact(artifact);

  return (
    <div className="px-6 py-4">
      <header className="mb-3 flex items-baseline justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="display-sm truncate text-base text-fg">{artifact.name}</h3>
          <p className="mt-1 truncate font-mono text-[10px] text-fg-muted">{artifact.path}</p>
        </div>
        <div className="ml-4 flex shrink-0 items-baseline gap-4">
          <button
            onClick={() => openPath(artifact.path).catch(() => undefined)}
            className="font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:text-fg"
            title="Open in OS default app"
          >
            open
          </button>
          <button
            onClick={() => revealInFolder(artifact.path).catch(() => undefined)}
            className="font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:text-fg"
            title="Reveal in file manager"
          >
            reveal
          </button>
        </div>
      </header>

      {artifact.kind === "composition" ? (
        <CompositionActions artifact={artifact} />
      ) : artifact.kind === "render" ? (
        <RenderActions artifact={artifact} />
      ) : artifact.kind === "narration" ? (
        <NarrationActions artifact={artifact} />
      ) : isImageArtifact(artifact) ? (
        <div className="hairline flex justify-center border bg-void p-3">
          <img
            src={pathToMediaUrl(artifact.path)}
            alt={artifact.name}
            className="max-h-[60vh] max-w-full object-contain"
          />
        </div>
      ) : isPdfArtifact(artifact) ? (
        <iframe
          src={pathToMediaUrl(artifact.path)}
          title={artifact.name}
          className="hairline block h-[70vh] w-full border bg-void"
        />
      ) : isBinary ? (
        <p className="font-mono text-[11px] text-fg-muted">Binary file — open in OS to view.</p>
      ) : (
        <TextEditor artifact={artifact} projectId={projectId} />
      )}
    </div>
  );
}

function TextEditor({
  artifact,
  projectId,
}: {
  artifact: Artifact;
  projectId?: string;
}) {
  const [content, setContent] = useState<string | null>(artifact.inlineContent);
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [promotingDefault, setPromotingDefault] = useState(false);
  const [promotedAt, setPromotedAt] = useState<{ path: string } | null>(null);

  /**
   * Save this DESIGN.md as the project's default by writing it to the source
   * project folder (organisation-projects/<projectId>/DESIGN.md). Future
   * sessions for this project pick up this file as the design baseline
   * instead of forking the global Composio defaults.
   */
  const isDesignArtifact = artifact.kind === "design";
  const canPromoteToProject = isDesignArtifact && !!projectId;

  // Reset state when the active artifact changes.
  useEffect(() => {
    setContent(artifact.inlineContent);
    setDraft(null);
    setSavedAt(null);
  }, [artifact.path, artifact.lastToolId]);

  // If no inline content (e.g. the agent only Read this file), fetch from disk.
  useEffect(() => {
    if (content !== null) return;
    let cancelled = false;
    setLoading(true);
    readText(artifact.path)
      .then((text) => {
        if (cancelled) return;
        setContent(text ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        setContent("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifact.path, content]);

  const isJson = artifact.ext === "json";
  const formatted = useMemo(() => {
    if (!isJson || content === null) return content;
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }, [content, isJson]);

  const editing = draft !== null;
  const dirty = editing && draft !== formatted;

  const handleSave = useCallback(async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      // For JSON, validate before writing — refuse to save invalid JSON so
      // we don't break the agent's downstream stages.
      let toWrite = draft;
      if (isJson) {
        try {
          toWrite = JSON.stringify(JSON.parse(draft), null, 2);
        } catch (err) {
          alert(`Invalid JSON: ${(err as Error).message}`);
          setSaving(false);
          return;
        }
      }
      await writeText(artifact.path, toWrite);
      setContent(toWrite);
      setDraft(null);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } finally {
      setSaving(false);
    }
  }, [artifact.path, draft, isJson]);

  /** Promote the current content (draft if editing, otherwise on-disk) to
   *  the source project as <orgRoot>/<projectId>/DESIGN.md. */
  const handlePromoteToProjectDefault = useCallback(async () => {
    if (!projectId) return;
    const payload = draft ?? formatted ?? "";
    if (!payload.trim()) {
      alert("Nothing to save — the file is empty.");
      return;
    }
    if (
      !window.confirm(
        `Save this DESIGN.md as the default for "${projectId}"? It will be written to your project's source folder and used for every future session.`
      )
    ) {
      return;
    }
    setPromotingDefault(true);
    try {
      const { path } = await setProjectDesignDefault(projectId, payload);
      setPromotedAt({ path });
      setTimeout(() => setPromotedAt(null), 4000);
    } catch (err) {
      alert(`Failed to save as project default: ${(err as Error).message}`);
    } finally {
      setPromotingDefault(false);
    }
  }, [projectId, draft, formatted]);

  if (loading) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">loading…</p>
    );
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1">
        {/* Promote to project default — DESIGN.md only, requires projectId */}
        {canPromoteToProject && (
          <button
            onClick={handlePromoteToProjectDefault}
            disabled={promotingDefault}
            className={cn(
              "font-mono text-[10px] uppercase tracking-widest transition-colors",
              promotingDefault
                ? "cursor-not-allowed text-fg-muted/40"
                : "text-fg-faint hover:text-fg"
            )}
            title="Write this DESIGN.md to the source project folder so all future sessions inherit it"
          >
            {promotingDefault
              ? "saving…"
              : promotedAt
                ? "set ✓"
                : "save as project default"}
          </button>
        )}

        {!editing && (
          <button
            onClick={() => setDraft(formatted ?? "")}
            className="font-mono text-[10px] uppercase tracking-widest text-cyan transition-colors hover:text-fg"
          >
            edit
          </button>
        )}
        {editing && (
          <>
            <button
              onClick={() => setDraft(null)}
              className="font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:text-fg"
            >
              cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className={cn(
                "font-mono text-[10px] uppercase tracking-widest transition-colors",
                dirty && !saving
                  ? "text-cyan hover:text-fg"
                  : "cursor-not-allowed text-fg-muted/40"
              )}
            >
              {saving ? "saving…" : savedAt ? "saved ✓" : "save"}
            </button>
          </>
        )}
        {savedAt && !editing && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg">
            saved ✓
          </span>
        )}
      </div>

      {/* Confirmation strip when promotion succeeded — shows the resolved path
          so the user knows exactly where it landed in their project source. */}
      {promotedAt && (
        <p className="mb-2 truncate font-mono text-[10px] text-fg-faint">
          → {promotedAt.path}
        </p>
      )}

      {editing ? (
        <textarea
          value={draft ?? ""}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="hairline h-[60vh] w-full resize-none border bg-void p-3 font-mono text-[11px] leading-relaxed text-fg focus:border-cyan focus:outline-none"
        />
      ) : (
        <FilePreview artifact={artifact} text={formatted ?? ""} />
      )}
    </>
  );
}

// ─── Kind-aware file preview ──────────────────────────────────────────────
// Replaces the raw <pre> for non-binary text artifacts so the viewer reads
// like a document, not a stream of escaped characters:
//   - .md / .markdown → rendered via the existing MarkdownText
//   - .json           → pretty-printed and syntax-highlighted
//   - code (.ts/.tsx/.css/.html/.py/...) → prism-highlighted with line numbers
//   - everything else → keeps the original mono <pre>
//
// All wrappers reuse the same `hairline` border + `bg-void` surface as the
// rest of the panel so nothing visually drifts from the existing system.

function FilePreview({ artifact, text }: { artifact: Artifact; text: string }) {
  const ext = artifact.ext;

  if (!text) {
    return (
      <div className="hairline border bg-void p-3 font-mono text-[11px] text-fg-muted">
        (empty)
      </div>
    );
  }

  if (ext === "md" || ext === "markdown") {
    return <DocumentMarkdown text={text} basePath={artifact.path} />;
  }

  const lang = extToPrismLang(ext);
  if (lang) {
    return <CodePreview text={text} language={lang} />;
  }

  return (
    <pre className="hairline max-h-[60vh] overflow-auto border bg-void p-3 font-mono text-[11px] leading-relaxed text-fg">
      {text}
    </pre>
  );
}

// Full-document markdown renderer for the artifact viewer. Unlike the
// stream-side MarkdownText (which intentionally skips headers/tables),
// this one handles the whole spec: H1–H4, lists, tables, blockquotes,
// fenced code with prism highlighting, links, and inline code. Styled
// against the existing token system so it sits flush with the panel.
function DocumentMarkdown({
  text,
  basePath,
}: {
  text: string;
  /** Absolute path of the markdown file — used to resolve relative image
   *  references (e.g. `.github/banner.png`) against the file's directory. */
  basePath: string;
}) {
  const baseDir = useMemo(() => {
    const idx = Math.max(basePath.lastIndexOf("/"), basePath.lastIndexOf("\\"));
    return idx === -1 ? basePath : basePath.slice(0, idx);
  }, [basePath]);

  // Convert raw <img src> values to a usable URL:
  //   - absolute http(s)/data → unchanged (loads from network as-is)
  //   - studio-media:// or file:// → unchanged
  //   - everything else (relative) → resolved against baseDir and routed
  //     through the studio-media:// protocol so the renderer can read them.
  const resolveImageSrc = useCallback(
    (src: string | undefined): string | undefined => {
      if (!src) return undefined;
      if (/^(https?:|data:|studio-media:|file:)/i.test(src)) return src;
      // Strip leading "./" and any leading slashes so resolution is intuitive.
      const cleaned = src.replace(/^\.\//, "").replace(/^[/\\]+/, "");
      const joined = `${baseDir.replace(/\\/g, "/")}/${cleaned}`;
      const normalized = joined.replace(/\\/g, "/");
      return `studio-media:///${encodeURIComponent(normalized)}`;
    },
    [baseDir]
  );

  return (
    <div className="hairline max-h-[60vh] overflow-auto border bg-void px-5 py-4 text-[13px] leading-relaxed text-fg [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          img: ({ src, alt }) => {
            const resolved = resolveImageSrc(typeof src === "string" ? src : undefined);
            return (
              <img
                src={resolved}
                alt={alt ?? ""}
                className="my-3 inline-block max-w-full rounded"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // If the image fails (offline / CSP / shield API down),
                  // fall back to showing the alt text so the layout doesn't
                  // get cratered by stacks of broken-image glyphs.
                  const el = e.currentTarget;
                  el.style.display = "none";
                }}
              />
            );
          },
          h1: ({ children }) => (
            <h1 className="display-sm mb-3 mt-4 border-b border-mist-10 pb-1 text-[20px] font-semibold tracking-tight text-fg first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 border-b border-mist-10 pb-1 text-[16px] font-semibold tracking-tight text-fg">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 text-[14px] font-semibold tracking-tight text-fg">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1.5 mt-3 font-mono text-[10px] uppercase tracking-widest text-cyan">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 text-fg/95">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 ml-5 list-disc space-y-1 text-fg/95 marker:text-fg-muted/60">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 ml-5 list-decimal space-y-1 text-fg/95 marker:text-fg-muted/60">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-cyan underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-fg">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-fg">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-cyan/40 pl-3 text-fg-muted">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-mist-10" />,
          table: ({ children }) => (
            <div className="my-3 overflow-auto">
              <table className="hairline border text-[12px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-surface text-left font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-mist-10 px-3 py-1.5">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-mist-10 px-3 py-1.5 align-top">
              {children}
            </td>
          ),
          code: ({ className, children, ...rest }) => {
            const match = /language-(\w+)/.exec(className ?? "");
            const isInline = !match;
            if (isInline) {
              return (
                <code
                  className="rounded bg-surface px-1 py-0.5 font-mono text-[11.5px] text-cyan"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            const lang = (match![1] as Language) ?? ("markup" as Language);
            return (
              <CodePreview
                text={String(children).replace(/\n$/, "")}
                language={lang}
              />
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function CodePreview({ text, language }: { text: string; language: Language }) {
  return (
    <div className="hairline max-h-[60vh] overflow-auto border bg-void font-mono text-[11px] leading-relaxed">
      <Highlight code={text} language={language} theme={themes.vsDark}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(className, "p-3")}
            style={{ ...style, background: "transparent" }}
          >
            {tokens.map((line, i) => {
              const { key: _lk, ...lineProps } = getLineProps({ line });
              return (
                <div key={i} {...lineProps} className="table-row">
                  <span className="table-cell select-none pr-4 text-right font-mono text-[10px] tabular text-fg-muted/45">
                    {i + 1}
                  </span>
                  <span className="table-cell whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {line.map((token, j) => {
                      const { key: _tk, ...tokenProps } = getTokenProps({ token });
                      return <span key={j} {...tokenProps} />;
                    })}
                  </span>
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function extToPrismLang(ext: string): Language | null {
  const map: Record<string, Language> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    html: "markup",
    htm: "markup",
    xml: "markup",
    css: "css",
    scss: "scss",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sh: "bash",
    bash: "bash",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    sql: "sql",
    graphql: "graphql",
  };
  return (map[ext] as Language | undefined) ?? null;
}

function CompositionActions({ artifact }: { artifact: Artifact }) {
  const { current: preview, starting, openIframe, close } = usePreview();

  // The dev server runs against the workspace folder, not the index.html path.
  const workspaceDir = useMemo(() => {
    const idx = Math.max(
      artifact.path.lastIndexOf("/"),
      artifact.path.lastIndexOf("\\")
    );
    return idx === -1 ? artifact.path : artifact.path.slice(0, idx);
  }, [artifact.path]);

  // Aspect = the workspace folder's last path segment ("1080x1080") so the
  // slide-in panel header can show which composition is up.
  const aspect = useMemo(() => {
    return workspaceDir.split(/[\\/]/).pop() || artifact.name;
  }, [workspaceDir, artifact.name]);

  const isThisOpen =
    !!preview && preview.kind === "iframe" && preview.workspace === workspaceDir;
  const isStarting = starting === aspect;

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-fg-muted">
        HyperFrames composition. Press <span className="text-fg">preview</span> to launch the
        dev server and play the GSAP timeline in the inline viewer — hot-reloads as the agent
        edits the HTML.
      </p>

      <div className="flex items-baseline gap-6">
        {isThisOpen ? (
          <button
            onClick={() => void close()}
            className="border-b border-alarm pb-0.5 font-mono text-[10px] uppercase tracking-widest text-alarm hover:text-fg"
          >
            stop preview
          </button>
        ) : (
          <button
            onClick={() => void openIframe({ workspace: workspaceDir, aspect })}
            disabled={isStarting}
            className={cn(
              "border-b pb-0.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
              isStarting
                ? "border-fg-muted/30 text-fg-muted/40"
                : "border-cyan text-cyan hover:text-fg"
            )}
          >
            {isStarting ? "starting…" : "preview →"}
          </button>
        )}
      </div>
    </div>
  );
}

function RenderActions({ artifact }: { artifact: Artifact }) {
  return (
    <div className="space-y-3">
      <div className="hairline border bg-void p-2">
        <video
          src={pathToMediaUrl(artifact.path)}
          controls
          playsInline
          className="block max-h-[60vh] w-full bg-black"
        />
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">
        Rendered video. Scrub inline, or open in your default player to share.
      </p>
      <button
        onClick={() => openPath(artifact.path).catch(() => undefined)}
        className="border-b border-cyan pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan hover:text-fg"
      >
        open in player →
      </button>
    </div>
  );
}

function NarrationActions({ artifact }: { artifact: Artifact }) {
  return (
    <div className="space-y-3">
      <div className="hairline border bg-void p-3">
        <audio
          src={pathToMediaUrl(artifact.path)}
          controls
          className="block w-full"
        />
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">
        Kokoro narration clip. Listen inline, or open in your default audio player.
      </p>
      <button
        onClick={() => openPath(artifact.path).catch(() => undefined)}
        className="border-b border-cyan pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan hover:text-fg"
      >
        open in player →
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isBinaryArtifact(a: Artifact): boolean {
  if (a.kind === "narration" || a.kind === "render") return true;
  return ["wav", "mp3", "mp4", "webm", "png", "jpg", "jpeg", "gif", "pdf", "zip"].includes(a.ext);
}

function isImageArtifact(a: Artifact): boolean {
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(a.ext);
}

function isPdfArtifact(a: Artifact): boolean {
  return a.ext === "pdf";
}

interface ArtifactGroup {
  kind: ArtifactKind;
  items: Artifact[];
}

const KIND_ORDER: ArtifactKind[] = [
  "script",
  "design",
  "brief",
  "manifest",
  "composition",
  "narration",
  "render",
  "doc",
  "code",
  "config",
  "other",
];

function groupByKind(artifacts: Artifact[]): ArtifactGroup[] {
  const map = new Map<ArtifactKind, Artifact[]>();
  for (const a of artifacts) {
    const arr = map.get(a.kind) ?? [];
    arr.push(a);
    map.set(a.kind, arr);
  }
  const groups: ArtifactGroup[] = [];
  for (const kind of KIND_ORDER) {
    const items = map.get(kind);
    if (items && items.length > 0) {
      groups.push({ kind, items });
    }
  }
  return groups;
}
