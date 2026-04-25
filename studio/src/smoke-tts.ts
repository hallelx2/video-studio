#!/usr/bin/env node
/**
 * Smoke test for edge-tts integration.
 *
 * Usage (from inside studio/):
 *   pnpm tsx src/smoke-tts.ts
 *   pnpm tsx src/smoke-tts.ts "Custom narration text"
 *
 * Generates a short MP3 in tmp/ and reports duration + cache status.
 * No API key required — edge-tts is free.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { generateVoiceover, DEFAULT_VOICE } from "./lib/tts.js";
import { getAudioDuration } from "./lib/get-audio-duration.js";

const text =
  process.argv[2] ??
  "RAG chunking was the original sin of document retrieval. Vectorless preserves the document tree and lets an LLM agent navigate it.";

const outputDir = resolve(process.cwd(), "tmp");
const outputPath = resolve(outputDir, "smoke-tts.mp3");

await mkdir(outputDir, { recursive: true });

console.log(`[smoke-tts] voice=${DEFAULT_VOICE} text="${text.slice(0, 60)}..."`);

const start = Date.now();
const result = await generateVoiceover({
  text,
  voice: DEFAULT_VOICE,
  outputPath,
});
const generationMs = Date.now() - start;

const durationSec = await getAudioDuration(outputPath);

console.log(JSON.stringify({
  outputPath: result.outputPath,
  cached: result.cached,
  bytes: result.bytes,
  generationMs,
  durationSec: Number(durationSec.toFixed(2)),
  bytesPerSecond: Math.round(result.bytes / durationSec),
}, null, 2));

console.log(`[smoke-tts] OK · generated ${(result.bytes / 1024).toFixed(1)} KB in ${generationMs}ms · ${durationSec.toFixed(1)}s playback`);
