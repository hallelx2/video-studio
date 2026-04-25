import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * Microsoft Edge text-to-speech with disk caching.
 *
 * Uses Microsoft's free neural voices via the Edge Read Aloud API — no API key,
 * no quotas, no billing. Suitable for prototyping and most production use.
 *
 * Cache key = sha256(voice + text + rate + pitch). If the same combination has
 * been generated before, we reuse the cached MP3 and skip the network call.
 *
 * Available voices listed at:
 *   https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
 *
 * Default narrator voices for SaaS launch videos:
 *   en-US-AndrewNeural      warm male, conversational  ← default
 *   en-US-AriaNeural        clear female, neutral
 *   en-US-ChristopherNeural deep male, authoritative
 *   en-US-EricNeural        mature male, serious
 *   en-US-JennyNeural       warm female, friendly
 *   en-GB-RyanNeural        British male, calm
 *   en-GB-SoniaNeural       British female, professional
 */

export interface GenerateVoiceoverOptions {
  text: string;
  /** Edge TTS voice name, e.g. "en-US-AndrewNeural" */
  voice: string;
  outputPath: string;
  /** Speaking rate offset, percentage (-50 to +200) */
  rate?: number;
  /** Pitch offset, percentage (-50 to +50) */
  pitch?: number;
}

export interface VoiceoverResult {
  outputPath: string;
  cached: boolean;
  hash: string;
  bytes: number;
}

export interface VoiceInfo {
  name: string;
  gender: string;
  locale: string;
  displayName: string;
}

export const DEFAULT_VOICE = "en-US-AndrewNeural";

export async function generateVoiceover(opts: GenerateVoiceoverOptions): Promise<VoiceoverResult> {
  const voice = opts.voice || DEFAULT_VOICE;
  const hash = hashKey(voice, opts.text, opts.rate ?? 0, opts.pitch ?? 0);
  const metaPath = `${opts.outputPath}.meta.json`;

  // Cache hit: same voice + text + rate + pitch reuses the existing file
  if (existsSync(opts.outputPath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf-8")) as { hash: string };
      if (meta.hash === hash) {
        const existing = await readFile(opts.outputPath);
        return { outputPath: opts.outputPath, cached: true, hash, bytes: existing.length };
      }
    } catch {
      // fall through to regenerate
    }
  }

  await mkdir(dirname(opts.outputPath), { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const prosody: { rate?: string; pitch?: string } = {};
  if (opts.rate !== undefined && opts.rate !== 0) {
    prosody.rate = `${opts.rate >= 0 ? "+" : ""}${opts.rate}%`;
  }
  if (opts.pitch !== undefined && opts.pitch !== 0) {
    prosody.pitch = `${opts.pitch >= 0 ? "+" : ""}${opts.pitch}%`;
  }

  const { audioStream } = tts.toStream(opts.text, prosody);

  // Collect all stream chunks into a buffer so we control the output filename.
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  if (buffer.length === 0) {
    throw new Error(`edge-tts returned 0 bytes for voice="${voice}", text length=${opts.text.length}`);
  }

  await writeFile(opts.outputPath, buffer);
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        hash,
        voice,
        text: opts.text,
        rate: opts.rate ?? 0,
        pitch: opts.pitch ?? 0,
        bytes: buffer.length,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  return { outputPath: opts.outputPath, cached: false, hash, bytes: buffer.length };
}

/**
 * List every available edge-tts voice. Useful for the dashboard's voice picker.
 */
export async function listVoices(): Promise<VoiceInfo[]> {
  const tts = new MsEdgeTTS();
  const voices = await tts.getVoices();
  return voices.map((v) => ({
    name: v.ShortName,
    gender: v.Gender,
    locale: v.Locale,
    displayName: v.FriendlyName,
  }));
}

function hashKey(voice: string, text: string, rate: number, pitch: number): string {
  return createHash("sha256").update(`${voice}::${text}::r${rate}p${pitch}`).digest("hex");
}
