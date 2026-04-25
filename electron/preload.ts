import { contextBridge, ipcRenderer } from "electron";
import type { AgentEvent, AppConfig, GenerateRequest, ProjectInfo, StudioBridge } from "./types.js";

/**
 * Renderer-facing API. Exposed via contextBridge as window.studio.
 *
 * NEVER pass `ipcRenderer` directly to the renderer — that gives untrusted code
 * access to the whole IPC surface. Every method here is a deliberate, typed
 * channel.
 */
const bridge: StudioBridge = {
  config: {
    get: () => ipcRenderer.invoke("config:get") as Promise<AppConfig>,
    save: (config) => ipcRenderer.invoke("config:save", config) as Promise<void>,
  },
  projects: {
    list: () => ipcRenderer.invoke("projects:list") as Promise<ProjectInfo[]>,
  },
  agent: {
    generate: (req: GenerateRequest) => ipcRenderer.invoke("agent:generate", req) as Promise<void>,
    respond: (promptId, response) =>
      ipcRenderer.invoke("agent:respond", promptId, response) as Promise<void>,
    cancel: () => ipcRenderer.invoke("agent:cancel") as Promise<void>,
    isRunning: () => ipcRenderer.invoke("agent:is-running") as Promise<boolean>,
    onEvent: (handler: (event: AgentEvent) => void) => {
      const listener = (_: unknown, event: AgentEvent) => handler(event);
      ipcRenderer.on("agent-event", listener);
      return () => ipcRenderer.removeListener("agent-event", listener);
    },
  },
  fs: {
    readText: (path) => ipcRenderer.invoke("fs:read-text", path) as Promise<string | null>,
    writeText: (path, content) =>
      ipcRenderer.invoke("fs:write-text", path, content) as Promise<void>,
  },
  dialog: {
    pickFolder: (title) => ipcRenderer.invoke("dialog:pick-folder", title) as Promise<string | null>,
  },
  shell: {
    openPath: (path) => ipcRenderer.invoke("shell:open-path", path) as Promise<void>,
    revealInFolder: (path) => ipcRenderer.invoke("shell:reveal-in-folder", path) as Promise<void>,
    openExternal: (url) => ipcRenderer.invoke("shell:open-external", url) as Promise<void>,
  },
  preview: {
    start: (workspacePath) =>
      ipcRenderer.invoke("preview:start", workspacePath) as Promise<{ url: string }>,
    stop: () => ipcRenderer.invoke("preview:stop") as Promise<void>,
    state: () =>
      ipcRenderer.invoke("preview:state") as Promise<{
        running: boolean;
        url: string | null;
        workspace: string | null;
      }>,
  },
  meta: {
    appVersion: () => ipcRenderer.invoke("meta:app-version") as Promise<string>,
    platform: () => ipcRenderer.invoke("meta:platform") as Promise<NodeJS.Platform>,
  },
};

contextBridge.exposeInMainWorld("studio", bridge);
