/**
 * Thin wrapper over `window.studio` (exposed by electron/preload.ts).
 * The renderer never imports electron directly — every privileged operation
 * goes through this module, which goes through the typed contextBridge.
 */
import type {
  AgentEvent,
  AppConfig,
  GenerateRequest,
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

export async function readText(path: string): Promise<string | null> {
  return studio().fs.readText(path);
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

/** Subscribe to the agent event stream. Returns an unsubscribe function. */
export function onAgentEvent(handler: (event: AgentEvent) => void): () => void {
  return studio().agent.onEvent(handler);
}
