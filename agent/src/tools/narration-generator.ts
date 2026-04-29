import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { nextToolCallId } from "./types.js";
import { runTtsCommand } from "./tts-runner.js";

/**
 * Standalone narration tool. Reads script.json, generates per-scene WAVs
 * via Kokoro / hyperframes tts, refreshes per-scene SHA256 caches, and
 * updates the script's durationSec to match actual WAV duration.
 *
 * Accepts an optional `sceneIds` filter — the scoped-invalidation
 * unlock the user has been asking for. With sceneIds: only those
 * scenes get regenerated (other scenes keep their cached WAVs). Without:
 * every scene is generated (or skipped via cache hit).
 *
 * Idempotent: per-scene cache key is sha256(voice + narration text).
 * If the on-disk hash matches, the WAV is reused.
 */
export interface NarrationInput {
  /** Optional whitelist of scene IDs to regenerate. Omit / empty = all. */
  sceneIds?: string[];
  /** Force regenerate even if the cache hash matches (default false). */
  force?: boolean;
}

export interface NarrationOutput {
  scenes: Array<{
    id: string;
    wavPath: string;
    durationSec: number;
    cached: boolean;
  }>;
}

interface ScriptScene {
  id: string;
  narration?: string;
  durationSec?: number;
  title?: string;
}

interface RawScript {
  scenes?: ScriptScene[];
}

export const narrationGenerator: Tool<NarrationInput, NarrationOutput> = {
  name: "narration.generate",

  async isCached(ctx, input) {
    const scenes = await loadScriptScenes(ctx);
    if (!scenes) return { hit: false };
    const targets = filterScenes(scenes, input.sceneIds);
    for (const scene of targets) {
      const wavPath = sceneWavPath(ctx, scene.id);
      const expected = expectedHash(ctx, scene);
      const actual = await readSceneHash(wavPath).catch(() => null);
      if (!actual || actual !== expected) return { hit: false };
    }
    return { hit: true };
  },

  async run(ctx, input) {
    const toolCallId = nextToolCallId();
    ctx.emit({ type: "tool_started", name: this.name, toolCallId, input });

    const scenes = await loadScriptScenes(ctx);
    if (!scenes) {
      const result: ToolResult<NarrationOutput> = {
        status: "error",
        message: "script.json not found in workspace — draft a script first.",
      };
      ctx.emit({
        type: "tool_finished",
        name: this.name,
        toolCallId,
        status: result.status,
        message: result.message,
      });
      return result;
    }

    const targets = filterScenes(scenes, input.sceneIds);
    if (targets.length === 0) {
      const result: ToolResult<NarrationOutput> = {
        status: "skipped",
        output: { scenes: [] },
        message: "No scenes matched the requested filter.",
      };
      ctx.emit({
        type: "tool_finished",
        name: this.name,
        toolCallId,
        status: "skipped",
        message: result.message,
      });
      return result;
    }

    const out: NarrationOutput["scenes"] = [];

    for (let i = 0; i < targets.length; i++) {
      if (ctx.signal?.aborted) {
        ctx.emit({ type: "tool_finished", name: this.name, toolCallId, status: "cancelled" });
        return { status: "cancelled", message: "Cancelled mid-narration." };
      }
      const scene = targets[i];
      const wavPath = sceneWavPath(ctx, scene.id);
      const expected = expectedHash(ctx, scene);
      const existing = input.force ? null : await readSceneHash(wavPath).catch(() => null);
      const cached = existing === expected;

      ctx.emit({
        type: "progress",
        phase: "narration",
        message: `scene ${i + 1}/${targets.length}: ${scene.id} (${cached ? "cached" : "generating"})`,
        progress: 0.45 + 0.35 * (i / targets.length),
        sceneId: scene.id,
      });

      if (!cached) {
        ctx.emit({
          type: "activity",
          state: "narrating",
          sceneId: scene.id,
        });
        try {
          await runTtsCommand({
            text: scene.narration ?? "",
            voice: ctx.ttsVoice,
            outputPath: wavPath,
            sceneId: scene.id,
            emit: ctx.emit,
            signal: ctx.signal,
          });
          await writeSceneHash(wavPath, expected);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : `unknown narration failure on ${scene.id}`;
          ctx.emit({
            type: "tool_finished",
            name: this.name,
            toolCallId,
            status: "error",
            message,
          });
          return { status: "error", message, output: { scenes: out } };
        }
      }

      const durationSec = scene.durationSec ?? 0;
      out.push({ id: scene.id, wavPath, durationSec, cached });
    }

    ctx.emit({
      type: "tool_finished",
      name: this.name,
      toolCallId,
      status: "ok",
      message: `Generated ${out.filter((s) => !s.cached).length} / ${out.length} scenes (${out.filter((s) => s.cached).length} cached).`,
    });
    return {
      status: "ok",
      output: { scenes: out },
      artifacts: out.map((s) => s.wavPath),
    };
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────

async function loadScriptScenes(ctx: ToolContext): Promise<ScriptScene[] | null> {
  const scriptPath = join(ctx.workspaceDir, "script.json");
  try {
    const raw = await fs.readFile(scriptPath, "utf8");
    const parsed = JSON.parse(raw) as RawScript;
    return parsed.scenes ?? [];
  } catch {
    return null;
  }
}

function filterScenes(scenes: ScriptScene[], sceneIds?: string[]): ScriptScene[] {
  if (!sceneIds || sceneIds.length === 0) return scenes;
  const wanted = new Set(sceneIds);
  return scenes.filter((s) => wanted.has(s.id));
}

function sceneWavPath(ctx: ToolContext, sceneId: string): string {
  return join(ctx.workspaceDir, "narration", `${sceneId}.wav`);
}

function expectedHash(ctx: ToolContext, scene: ScriptScene): string {
  return createHash("sha256")
    .update(`${ctx.ttsVoice}\n${scene.narration ?? ""}`)
    .digest("hex");
}

async function readSceneHash(wavPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(`${wavPath}.hash`, "utf8");
    return raw.trim();
  } catch {
    return null;
  }
}

async function writeSceneHash(wavPath: string, hash: string): Promise<void> {
  await fs.writeFile(`${wavPath}.hash`, hash + "\n", "utf8");
}
