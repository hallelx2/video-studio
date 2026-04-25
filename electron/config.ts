import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG, type AppConfig } from "./types.js";

/**
 * Config lives at <userData>/config.json.
 * On Windows: %APPDATA%/video-studio/config.json
 * On macOS:   ~/Library/Application Support/video-studio/config.json
 */
function configPath(): string {
  return join(app.getPath("userData"), "config.json");
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    // Merge with defaults so newly added keys don't crash older config files.
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_CONFIG;
    throw err;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
}
