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
  dialog: {
    pickFolder: (title) => ipcRenderer.invoke("dialog:pick-folder", title) as Promise<string | null>,
  },
  shell: {
    openPath: (path) => ipcRenderer.invoke("shell:open-path", path) as Promise<void>,
    revealInFolder: (path) => ipcRenderer.invoke("shell:reveal-in-folder", path) as Promise<void>,
  },
  meta: {
    appVersion: () => ipcRenderer.invoke("meta:app-version") as Promise<string>,
    platform: () => ipcRenderer.invoke("meta:platform") as Promise<NodeJS.Platform>,
  },
};

contextBridge.exposeInMainWorld("studio", bridge);
