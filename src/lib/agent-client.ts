/**
 * Thin wrapper over `window.studio` (exposed by electron/preload.ts).
 * The renderer never imports electron directly — every privileged operation
 * goes through this module, which goes through the typed contextBridge.
 */
import type {
  AgentEvent,
  AppConfig,
  GenerateRequest,
  HealthReport,
  ProjectInfo,
  SessionFile,
  SessionMeta,
  SessionScaffold,
} from "../../electron/types.js";

function studio() {
  if (typeof window === "undefined" || !window.studio) {
    throw new Error(
      "window.studio is not defined — the renderer is not running inside Electron, or preload failed to load"
    );
  }
  return window.studio;
}

export async function listProjects(): Promise<ProjectInfo[]> {
  return studio().projects.list();
}

export async function setProjectDesignDefault(
  projectId: string,
  content: string
): Promise<{ path: string }> {
  return studio().projects.setDesignDefault(projectId, content);
}

export async function generateVideo(req: GenerateRequest): Promise<void> {
  return studio().agent.generate(req);
}

export async function respondToPrompt(promptId: string, response: string): Promise<void> {
  return studio().agent.respond(promptId, response);
}

export async function cancelAgent(): Promise<void> {
  return studio().agent.cancel();
}

export async function isAgentRunning(): Promise<boolean> {
  return studio().agent.isRunning();
}

export async function getConfig(): Promise<AppConfig> {
  return studio().config.get();
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return studio().config.save(config);
}

export async function pickFolder(title?: string): Promise<string | null> {
  return studio().dialog.pickFolder(title);
}

export async function pickFile(args?: {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<string | null> {
  return studio().dialog.pickFile(args);
}

export async function readText(path: string): Promise<string | null> {
  return studio().fs.readText(path);
}

export async function statPath(path: string) {
  return studio().fs.stat(path);
}

export async function writeText(path: string, content: string): Promise<void> {
  return studio().fs.writeText(path, content);
}

export async function openPath(path: string): Promise<void> {
  return studio().shell.openPath(path);
}

export async function revealInFolder(path: string): Promise<void> {
  return studio().shell.revealInFolder(path);
}

export async function openExternal(url: string): Promise<void> {
  return studio().shell.openExternal(url);
}

export async function startPreview(workspacePath: string): Promise<{ url: string }> {
  return studio().preview.start(workspacePath);
}

export async function stopPreview(): Promise<void> {
  return studio().preview.stop();
}

export async function previewState(): Promise<{
  running: boolean;
  url: string | null;
  workspace: string | null;
}> {
  return studio().preview.state();
}

// ─── Sessions ──────────────────────────────────────────────────────────────

export async function listSessions(projectId: string): Promise<SessionMeta[]> {
  return studio().sessions.list(projectId);
}

export async function loadSession(
  projectId: string,
  sessionId: string
): Promise<SessionFile | null> {
  return studio().sessions.load(projectId, sessionId);
}

export async function createSession(
  projectId: string,
  scaffold: SessionScaffold,
  title?: string
): Promise<SessionFile> {
  return studio().sessions.create(projectId, scaffold, title);
}

export async function saveSession(
  projectId: string,
  sessionId: string,
  events: AgentEvent[],
  scaffold: SessionScaffold
): Promise<void> {
  return studio().sessions.save(projectId, sessionId, events, scaffold);
}

export async function renameSession(
  projectId: string,
  sessionId: string,
  title: string
): Promise<void> {
  return studio().sessions.rename(projectId, sessionId, title);
}

export async function deleteSession(projectId: string, sessionId: string): Promise<void> {
  return studio().sessions.delete(projectId, sessionId);
}

export async function getSystemHealth(): Promise<HealthReport> {
  return studio().system.health();
}

/**
 * Aggregate every session across every project for the global search palette.
 * Each row is enriched with its parent project's pretty name + slug. This
 * is O(projects + total sessions) and runs on demand (when the palette
 * opens), so a few seconds of latency on first open is acceptable.
 */
export interface SessionWithProject extends SessionMeta {
  projectName: string;
  projectId: string;
}

export async function getAllSessions(): Promise<SessionWithProject[]> {
  const projects = await listProjects();
  const all: SessionWithProject[] = [];
  // Run in parallel — most projects will return [] quickly.
  const sessionsPerProject = await Promise.all(
    projects.map(async (p) => ({
      project: p,
      sessions: await listSessions(p.id).catch(() => [] as SessionMeta[]),
    }))
  );
  for (const { project, sessions } of sessionsPerProject) {
    for (const session of sessions) {
      all.push({
        ...session,
        projectName: project.name,
        projectId: project.id,
      });
    }
  }
  // Most-recent first — same default the SessionSidebar uses.
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all;
}

/** Subscribe to the agent event stream. Returns an unsubscribe function. */
export function onAgentEvent(handler: (event: AgentEvent) => void): () => void {
  return studio().agent.onEvent(handler);
}
