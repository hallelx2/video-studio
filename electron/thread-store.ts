import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AgentEvent } from "./types.js";

/**
 * Per-project conversation persistence.
 *
 * The renderer's events array is the single source of truth; this module just
 * serializes it to disk and reads it back. Files live at:
 *
 *   <userData>/threads/<projectId>.json
 *
 * Each file is a JSON object: { version, updatedAt, events: AgentEvent[] }.
 * Atomic writes via tmp + rename so a mid-write crash doesn't corrupt the thread.
 *
 * No size cap yet — if a thread grows past ~10 MB we should add rotation, but
 * a typical run is a few hundred events, well under that.
 */

const SCHEMA_VERSION = 1;

interface ThreadFile {
  version: number;
  projectId: string;
  updatedAt: number;
  events: AgentEvent[];
}

function threadsDir(): string {
  return join(app.getPath("userData"), "threads");
}

function threadPath(projectId: string): string {
  // Defensive: never let projectId escape its directory.
  const safe = projectId.replace(/[^a-z0-9._-]/gi, "_");
  return join(threadsDir(), `${safe}.json`);
}

export async function loadThread(
  projectId: string
): Promise<{ events: AgentEvent[]; updatedAt: number | null }> {
  try {
    const raw = await fs.readFile(threadPath(projectId), "utf8");
    const parsed = JSON.parse(raw) as Partial<ThreadFile>;
    if (parsed.version !== SCHEMA_VERSION) {
      // Future: add migration paths here. For now, drop the old file silently.
      return { events: [], updatedAt: null };
    }
    return {
      events: Array.isArray(parsed.events) ? (parsed.events as AgentEvent[]) : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : null,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { events: [], updatedAt: null };
    }
    throw err;
  }
}

export async function saveThread(projectId: string, events: AgentEvent[]): Promise<void> {
  await fs.mkdir(threadsDir(), { recursive: true });
  const file: ThreadFile = {
    version: SCHEMA_VERSION,
    projectId,
    updatedAt: Date.now(),
    events,
  };
  const path = threadPath(projectId);
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(file), "utf8");
  await fs.rename(tmp, path);
}

export async function clearThread(projectId: string): Promise<void> {
  try {
    await fs.unlink(threadPath(projectId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
