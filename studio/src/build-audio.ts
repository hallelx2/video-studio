#!/usr/bin/env node
/**
 * build-audio — generate voiceover + manifest for a script.
 *
 * Usage (from inside the studio workspace):
 *   pnpm tsx src/build-audio.ts <scriptPath>
 *
 * Example:
 *   pnpm tsx src/build-audio.ts src/compositions/vectorless/launch-hero.script.ts
 *
 * The agent spawns this as a subprocess inside Stage 3 of the pipeline.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generateVoiceover, DEFAULT_VOICE } from "./lib/tts.js";
import { getAudioDuration } from "./lib/get-audio-duration.js";
import { buildManifest, saveManifest } from "./lib/manifest.js";

interface ScriptDefinition {
  id: string;
  voice?: {
    /** Edge TTS voice name, e.g. "en-US-AndrewNeural" */
    name?: string;
    rate?: number;
    pitch?: number;
  };
  fps?: number;
  scenes: Array<{
    id: string;
    narration: string;
    leadInMs?: number;
    leadOutMs?: number;
    scene: { component: string; props: Record<string, unknown> };
  }>;
}

async function main() {
  const scriptPath = process.argv[2];
  if (!scriptPath) {
    console.error("usage: build-audio <scriptPath>");
    process.exit(1);
  }

  const absScriptPath = resolve(scriptPath);
  const scriptModule = await import(pathToFileURL(absScriptPath).href);
  const script: ScriptDefinition =
    scriptModule.default ?? scriptModule.script ?? Object.values(scriptModule)[0];

  if (!script?.scenes?.length) {
    throw new Error(`script at ${absScriptPath} has no scenes`);
  }

  const voice = script.voice?.name || process.env.TTS_VOICE || DEFAULT_VOICE;
  const rate = script.voice?.rate ?? 0;
  const pitch = script.voice?.pitch ?? 0;
  const fps = script.fps ?? 30;

  const studioRoot = resolve(__dirname, "..");
  const audioBase = join(studioRoot, "public", "audio", script.id);
  const manifestPath = join(studioRoot, "public", "manifests", `${script.id}.json`);

  await mkdir(audioBase, { recursive: true });

  const sceneResults: Array<{
    id: string;
    audioSrc: string;
    durationSec: number;
    leadInMs: number;
    leadOutMs: number;
    component: string;
    props: Record<string, unknown>;
  }> = [];

  let cachedCount = 0;
  let freshCount = 0;

  for (const scene of script.scenes) {
    const audioPath = join(audioBase, `${scene.id}.mp3`);
    const result = await generateVoiceover({
      text: scene.narration,
      voice,
      outputPath: audioPath,
      rate,
      pitch,
    });
    if (result.cached) cachedCount++;
    else freshCount++;

    const durationSec = await getAudioDuration(audioPath);

    sceneResults.push({
      id: scene.id,
      audioSrc: `audio/${script.id}/${scene.id}.mp3`,
      durationSec,
      leadInMs: scene.leadInMs ?? 300,
      leadOutMs: scene.leadOutMs ?? 600,
      component: scene.scene.component,
      props: scene.scene.props,
    });

    emitProgress({
      scene: scene.id,
      cached: result.cached,
      durationSec: Number(durationSec.toFixed(2)),
      i: sceneResults.length,
      total: script.scenes.length,
    });
  }

  const manifest = buildManifest({
    id: script.id,
    fps,
    voiceId: voice,
    voiceModel: "edge-tts",
    scenes: sceneResults,
  });
  await saveManifest(manifestPath, manifest);

  emitDone({
    manifestPath,
    totalDurationSec: manifest.totalDurationInFrames / fps,
    scenes: manifest.scenes.length,
    cachedCount,
    freshCount,
  });
}

function emitProgress(data: Record<string, unknown>) {
  process.stdout.write(JSON.stringify({ type: "build_audio_progress", ...data }) + "\n");
}

function emitDone(data: Record<string, unknown>) {
  process.stdout.write(JSON.stringify({ type: "build_audio_done", ...data }) + "\n");
}

// Node ESM doesn't have __dirname by default
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`build-audio failed: ${msg}\n`);
  process.exit(1);
});
