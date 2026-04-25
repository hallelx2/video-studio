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

export async function openPath(path: string): Promise<void> {
  return studio().shell.openPath(path);
}

export async function revealInFolder(path: string): Promise<void> {
  return studio().shell.revealInFolder(path);
}

/** Subscribe to the agent event stream. Returns an unsubscribe function. */
export function onAgentEvent(handler: (event: AgentEvent) => void): () => void {
  return studio().agent.onEvent(handler);
}
