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

export async function invalidateStage(
  projectId: string,
  stage: "redraft" | "renarrate" | "recompose" | "rerender"
): Promise<{ removed: string[] }> {
  return studio().agent.invalidateStage(projectId, stage);
}

/**
 * Direct-invoke a single tool from the agent's TOOLS registry. The
 * renderer uses this for per-scene actions (regenerate one scene's
 * narration) and tool-bar buttons that should run a focused operation
 * without a full pipeline trip.
 *
 * Events from the tool stream through the same `onAgentEvent` channel
 * as the macro task; this promise resolves once a `tool_finished`
 * event arrives for the named tool.
 */
export async function runTool(req: {
  projectId: string;
  sessionId: string;
  toolName: string;
  input: unknown;
  model?: string;
  persona?: string;
}): Promise<{
  status: "ok" | "skipped" | "cancelled" | "needs-approval" | "error";
  message?: string;
}> {
  return studio().agent.runTool(req);
}

/**
 * Convenience: regenerate narration for a specific list of scene IDs
 * (or all scenes if none provided). Routes through the standalone
 * narration tool so other scenes' WAVs are untouched.
 */
export async function regenerateNarration(
  projectId: string,
  sessionId: string,
  sceneIds?: string[],
  opts?: { force?: boolean }
): Promise<{
  status: "ok" | "skipped" | "cancelled" | "needs-approval" | "error";
  message?: string;
}> {
  return runTool({
    projectId,
    sessionId,
    toolName: "narration.generate",
    input: { sceneIds, force: opts?.force ?? false },
  });
}

/**
 * Re-author HyperFrames composition(s) for the requested formats. Pass
 * revisionNotes to apply targeted edits to existing index.html files
 * instead of regenerating from scratch.
 */
export async function regenerateComposition(
  projectId: string,
  sessionId: string,
  args: { videoType: string; formats: string[]; revisionNotes?: string }
): Promise<{
  status: "ok" | "skipped" | "cancelled" | "needs-approval" | "error";
  message?: string;
}> {
  return runTool({
    projectId,
    sessionId,
    toolName: "composition.author",
    input: args,
  });
}

/**
 * Re-render the requested formats. Skips previously-generated MP4s when
 * they already exist on disk; pass `force: true` (via input) on the
 * runTool path to override.
 */
export async function rerunRender(
  projectId: string,
  sessionId: string,
  formats: string[]
): Promise<{
  status: "ok" | "skipped" | "cancelled" | "needs-approval" | "error";
  message?: string;
}> {
  return runTool({
    projectId,
    sessionId,
    toolName: "video.render",
    input: { formats },
  });
}

/**
 * Re-draft (or revise) the script. revisionNotes triggers a revise run
 * against the existing script.json; absent notes draft a fresh one.
 */
export async function regenerateScript(
  projectId: string,
  sessionId: string,
  args: { videoType: string; brief: string; revisionNotes?: string; revision?: number }
): Promise<{
  status: "ok" | "skipped" | "cancelled" | "needs-approval" | "error";
  message?: string;
}> {
  return runTool({
    projectId,
    sessionId,
    toolName: "script.draft",
    input: args,
  });
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

export async function transcodeWebSafe(path: string) {
  return studio().fs.transcodeWebSafe(path);
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
