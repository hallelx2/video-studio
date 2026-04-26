import { useCallback, useEffect, useMemo, useState } from "react";
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

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <aside className="hairline flex w-[420px] shrink-0 flex-col overflow-hidden border-l bg-ink">
      <header className="hairline flex items-baseline justify-between border-b px-6 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          artifacts
        </p>
        <p className="font-mono text-[10px] tabular tracking-widest text-paper-mute">
          {artifacts.length} files
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* File list, grouped by kind */}
        <ul>
          {grouped.map((group) => (
            <li key={group.kind}>
              <h4 className="hairline border-b px-6 pb-1 pt-3 font-mono text-[10px] uppercase tracking-widest text-cinnabar">
                {artifactKindLabel(group.kind)}
                <span className="ml-2 tabular text-paper-mute/85">{group.items.length}</span>
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
          <div className="hairline border-t bg-ink-raised">
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
          active ? "bg-ink-edge" : "hover:bg-ink-raised"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            active ? "bg-cinnabar" : "bg-transparent"
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs text-paper">{artifact.name}</span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-paper-mute/85">
            {artifact.path}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          {artifact.lastAction}
          {artifact.touches > 1 && (
            <span className="ml-1 tabular text-brass">{artifact.touches}×</span>
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
          <h3 className="display-sm truncate text-base text-paper">{artifact.name}</h3>
          <p className="mt-1 truncate font-mono text-[10px] text-paper-mute">{artifact.path}</p>
        </div>
        <div className="ml-4 flex shrink-0 items-baseline gap-4">
          <button
            onClick={() => openPath(artifact.path).catch(() => undefined)}
            className="font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
            title="Open in OS default app"
          >
            open
          </button>
          <button
            onClick={() => revealInFolder(artifact.path).catch(() => undefined)}
            className="font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
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
      ) : isBinary ? (
        <p className="font-mono text-[11px] text-paper-mute">Binary file — open in OS to view.</p>
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
   * instead of forking the global Atelier Noir defaults.
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
      <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">loading…</p>
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
                ? "cursor-not-allowed text-paper-mute/40"
                : "text-brass hover:text-paper"
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
            className="font-mono text-[10px] uppercase tracking-widest text-cinnabar transition-colors hover:text-paper"
          >
            edit
          </button>
        )}
        {editing && (
          <>
            <button
              onClick={() => setDraft(null)}
              className="font-mono text-[10px] uppercase tracking-widest text-paper-mute transition-colors hover:text-paper"
            >
              cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className={cn(
                "font-mono text-[10px] uppercase tracking-widest transition-colors",
                dirty && !saving
                  ? "text-cinnabar hover:text-paper"
                  : "cursor-not-allowed text-paper-mute/40"
              )}
            >
              {saving ? "saving…" : savedAt ? "saved ✓" : "save"}
            </button>
          </>
        )}
        {savedAt && !editing && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper">
            saved ✓
          </span>
        )}
      </div>

      {/* Confirmation strip when promotion succeeded — shows the resolved path
          so the user knows exactly where it landed in their project source. */}
      {promotedAt && (
        <p className="mb-2 truncate font-mono text-[10px] text-brass">
          → {promotedAt.path}
        </p>
      )}

      {editing ? (
        <textarea
          value={draft ?? ""}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="hairline h-[60vh] w-full resize-none border bg-ink p-3 font-mono text-[11px] leading-relaxed text-paper focus:border-cinnabar focus:outline-none"
        />
      ) : (
        <pre className="hairline max-h-[60vh] overflow-auto border bg-ink p-3 font-mono text-[11px] leading-relaxed text-paper">
          {formatted || <span className="text-paper-mute">(empty)</span>}
        </pre>
      )}
    </>
  );
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
      <p className="text-xs leading-relaxed text-paper-mute">
        HyperFrames composition. Press <span className="text-paper">preview</span> to launch the
        dev server and play the GSAP timeline in the inline viewer — hot-reloads as the agent
        edits the HTML.
      </p>

      <div className="flex items-baseline gap-6">
        {isThisOpen ? (
          <button
            onClick={() => void close()}
            className="border-b border-alarm pb-0.5 font-mono text-[10px] uppercase tracking-widest text-alarm hover:text-paper"
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
                ? "border-paper-mute/30 text-paper-mute/40"
                : "border-cinnabar text-cinnabar hover:text-paper"
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
      <p className="text-xs leading-relaxed text-paper-mute">
        Rendered video. Open in your default player to watch, or reveal in the file manager
        to share.
      </p>
      <button
        onClick={() => openPath(artifact.path).catch(() => undefined)}
        className="border-b border-cinnabar pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cinnabar hover:text-paper"
      >
        play →
      </button>
    </div>
  );
}

function NarrationActions({ artifact }: { artifact: Artifact }) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-paper-mute">
        Kokoro narration clip. Open in your default audio player to listen.
      </p>
      <button
        onClick={() => openPath(artifact.path).catch(() => undefined)}
        className="border-b border-cinnabar pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cinnabar hover:text-paper"
      >
        play →
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isBinaryArtifact(a: Artifact): boolean {
  if (a.kind === "narration" || a.kind === "render") return true;
  return ["wav", "mp3", "mp4", "webm", "png", "jpg", "jpeg", "gif", "pdf", "zip"].includes(a.ext);
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
