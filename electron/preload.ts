import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentEvent,
  AppConfig,
  GenerateRequest,
  ProjectInfo,
  SessionFile,
  SessionMeta,
  SessionScaffold,
  StudioBridge,
} from "./types.js";

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
    setDesignDefault: (projectId, content) =>
      ipcRenderer.invoke("projects:set-design-default", projectId, content) as Promise<{
        path: string;
      }>,
  },
  agent: {
    generate: (req: GenerateRequest) => ipcRenderer.invoke("agent:generate", req) as Promise<void>,
    respond: (promptId, response) =>
      ipcRenderer.invoke("agent:respond", promptId, response) as Promise<void>,
    cancel: () => ipcRenderer.invoke("agent:cancel") as Promise<void>,
    isRunning: () => ipcRenderer.invoke("agent:is-running") as Promise<boolean>,
    invalidateStage: (projectId, stage) =>
      ipcRenderer.invoke(
        "agent:invalidate-stage",
        projectId,
        stage
      ) as Promise<{ removed: string[] }>,
    runTool: (req) =>
      ipcRenderer.invoke("agent:run-tool", req) as Promise<{
        status: "ok" | "skipped" | "cancelled" | "needs-approval" | "error";
        message?: string;
      }>,
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
    stat: (path) =>
      ipcRenderer.invoke("fs:stat", path) as Promise<{
        exists: boolean;
        isFile: boolean;
        size: number;
        mtimeMs: number;
        error?: string;
      }>,
    transcodeWebSafe: (path) =>
      ipcRenderer.invoke("media:transcode-web-safe", path) as Promise<
        { ok: true; path: string } | { ok: false; error: string }
      >,
  },
  sessions: {
    list: (projectId) =>
      ipcRenderer.invoke("sessions:list", projectId) as Promise<SessionMeta[]>,
    load: (projectId, sessionId) =>
      ipcRenderer.invoke("sessions:load", projectId, sessionId) as Promise<SessionFile | null>,
    create: (projectId, scaffold, title) =>
      ipcRenderer.invoke("sessions:create", projectId, scaffold, title) as Promise<SessionFile>,
    save: (projectId, sessionId, events, scaffold) =>
      ipcRenderer.invoke(
        "sessions:save",
        projectId,
        sessionId,
        events,
        scaffold
      ) as Promise<void>,
    rename: (projectId, sessionId, title) =>
      ipcRenderer.invoke("sessions:rename", projectId, sessionId, title) as Promise<void>,
    delete: (projectId, sessionId) =>
      ipcRenderer.invoke("sessions:delete", projectId, sessionId) as Promise<void>,
  },
  dialog: {
    pickFolder: (title) => ipcRenderer.invoke("dialog:pick-folder", title) as Promise<string | null>,
    pickFile: (args) =>
      ipcRenderer.invoke("dialog:pick-file", args) as Promise<string | null>,
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
    onMenuCommand: (handler: (cmd: "new-session" | "open-search") => void) => {
      const listener = (_: unknown, cmd: string) =>
        handler(cmd as "new-session" | "open-search");
      ipcRenderer.on("menu:new-session", () => listener(null, "new-session"));
      ipcRenderer.on("menu:open-search", () => listener(null, "open-search"));
      return () => {
        ipcRenderer.removeAllListeners("menu:new-session");
        ipcRenderer.removeAllListeners("menu:open-search");
      };
    },
  },
  system: {
    health: () =>
      ipcRenderer.invoke("system:health") as Promise<
        import("./types.js").HealthReport
      >,
  },
};

contextBridge.exposeInMainWorld("studio", bridge);
