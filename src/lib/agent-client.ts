import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AgentEvent, AppConfig, ProductInfo, VideoFormat } from "./types.js";

export async function listProjects(): Promise<ProductInfo[]> {
  return invoke<ProductInfo[]>("list_projects");
}

export async function generateVideo(args: {
  product: string;
  formats: VideoFormat[];
  compositionId?: string;
}): Promise<void> {
  return invoke("generate_video", { args });
}

export async function respondToPrompt(promptId: string, response: string): Promise<void> {
  return invoke("respond_to_prompt", { promptId, response });
}

export async function getStudioPath(): Promise<string> {
  return invoke<string>("get_studio_path");
}

export async function openOutputFolder(path: string): Promise<void> {
  return invoke("open_output_folder", { path });
}

export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_config");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke("save_config", { config });
}

export async function pickFolder(title?: string): Promise<string | null> {
  return invoke<string | null>("pick_folder", { title });
}

/**
 * Subscribe to agent event stream. Returns an unlisten function.
 */
export async function onAgentEvent(handler: (event: AgentEvent) => void): Promise<UnlistenFn> {
  return listen<AgentEvent>("agent-event", (e) => handler(e.payload));
}

export async function onAgentLog(handler: (log: { level: string; text: string }) => void): Promise<UnlistenFn> {
  return listen<{ level: string; text: string }>("agent-log", (e) => handler(e.payload));
}
