import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
  AgentEvent,
  SessionFile,
  SessionMeta,
  SessionScaffold,
} from "./types.js";

/**
 * Per-project, per-session conversation persistence.
 *
 * Each project can have many sessions — one per video the user is working on.
 * A session bundles the scaffold (video type, formats, model) with its event
 * log so switching sessions restores the entire state.
 *
 * File layout:
 *   <userData>/sessions/<projectId>/<sessionId>.json
 *
 * Each file is a SessionFile { version, meta, events }. Atomic writes via
 * tmp + rename so a mid-write crash doesn't corrupt the session.
 */

const SCHEMA_VERSION = 2;

function sessionsRoot(): string {
  return join(app.getPath("userData"), "sessions");
}

function projectDir(projectId: string): string {
  const safe = projectId.replace(/[^a-z0-9._-]/gi, "_");
  return join(sessionsRoot(), safe);
}

function sessionPath(projectId: string, sessionId: string): string {
  const safeSession = sessionId.replace(/[^a-z0-9._-]/gi, "_");
  return join(projectDir(projectId), `${safeSession}.json`);
}

/** ULID-ish id: time-sortable, short random suffix. */
export function newSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xfffff)
    .toString(36)
    .padStart(4, "0");
  return `${ts}-${rand}`;
}

export async function listSessions(projectId: string): Promise<SessionMeta[]> {
  const dir = projectDir(projectId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const metas: SessionMeta[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(join(dir, name), "utf8");
      const parsed = JSON.parse(raw) as Partial<SessionFile>;
      if (parsed.version !== SCHEMA_VERSION) continue;
      if (!parsed.meta) continue;
      metas.push(parsed.meta);
    } catch {
      // skip malformed
    }
  }

  // Most recent first
  metas.sort((a, b) => b.updatedAt - a.updatedAt);
  return metas;
}

export async function loadSession(
  projectId: string,
  sessionId: string
): Promise<SessionFile | null> {
  try {
    const raw = await fs.readFile(sessionPath(projectId, sessionId), "utf8");
    const parsed = JSON.parse(raw) as Partial<SessionFile>;
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!parsed.meta || !Array.isArray(parsed.events)) return null;
    return parsed as SessionFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function createSession(
  projectId: string,
  scaffold: SessionScaffold,
  title?: string
): Promise<SessionFile> {
  const id = newSessionId();
  const now = Date.now();
  const file: SessionFile = {
    version: SCHEMA_VERSION,
    meta: {
      id,
      projectId,
      title: title ?? defaultSessionTitle(scaffold),
      scaffold,
      createdAt: now,
      updatedAt: now,
      eventCount: 0,
    },
    events: [],
  };
  await writeAtomic(sessionPath(projectId, id), JSON.stringify(file));
  return file;
}

export async function saveSession(
  projectId: string,
  sessionId: string,
  events: AgentEvent[],
  scaffold: SessionScaffold,
  title?: string
): Promise<void> {
  const path = sessionPath(projectId, sessionId);
  // Try to load existing meta to preserve createdAt + manually-set title.
  const existing = await loadSession(projectId, sessionId);
  const now = Date.now();
  const file: SessionFile = {
    version: SCHEMA_VERSION,
    meta: {
      id: sessionId,
      projectId,
      title: title ?? existing?.meta.title ?? defaultSessionTitle(scaffold),
      scaffold,
      createdAt: existing?.meta.createdAt ?? now,
      updatedAt: now,
      eventCount: events.length,
    },
    events,
  };
  await writeAtomic(path, JSON.stringify(file));
}

export async function renameSession(
  projectId: string,
  sessionId: string,
  title: string
): Promise<void> {
  const file = await loadSession(projectId, sessionId);
  if (!file) return;
  file.meta.title = title;
  file.meta.updatedAt = Date.now();
  await writeAtomic(sessionPath(projectId, sessionId), JSON.stringify(file));
}

export async function deleteSession(projectId: string, sessionId: string): Promise<void> {
  try {
    await fs.unlink(sessionPath(projectId, sessionId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const dir = path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, path);
}

function defaultSessionTitle(scaffold: SessionScaffold): string {
  const niceType = scaffold.videoType
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  const date = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${niceType} · ${date}`;
}
