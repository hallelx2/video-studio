import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Manifest format written by the build-audio CLI and read by compositions at render time.
 * Every composition reads its manifest inside `calculateMetadata` to set duration dynamically.
 */
export interface Manifest {
  id: string;
  fps: number;
  voiceId: string;
  voiceModel: string;
  scenes: ManifestScene[];
  totalDurationInFrames: number;
}

export interface ManifestScene {
  id: string;
  audioSrc: string;
  durationInFrames: number;
  leadInFrames: number;
  leadOutFrames: number;
  scene: {
    component: string;
    props: Record<string, unknown>;
  };
}

export async function loadManifest(manifestPath: string): Promise<Manifest> {
  const content = await readFile(manifestPath, "utf-8");
  return JSON.parse(content) as Manifest;
}

export async function saveManifest(manifestPath: string, manifest: Manifest): Promise<void> {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

/**
 * Convert a duration in seconds into frames at the manifest's fps.
 */
export function secondsToFrames(seconds: number, fps: number): number {
  return Math.ceil(seconds * fps);
}

/**
 * Build a manifest from a script + per-scene measured durations.
 */
export function buildManifest(args: {
  id: string;
  fps: number;
  voiceId: string;
  voiceModel: string;
  scenes: Array<{
    id: string;
    audioSrc: string;
    durationSec: number;
    leadInMs: number;
    leadOutMs: number;
    component: string;
    props: Record<string, unknown>;
  }>;
}): Manifest {
  const scenes: ManifestScene[] = args.scenes.map((s) => {
    const leadInFrames = Math.round((s.leadInMs / 1000) * args.fps);
    const leadOutFrames = Math.round((s.leadOutMs / 1000) * args.fps);
    const durationInFrames = secondsToFrames(s.durationSec, args.fps) + leadInFrames + leadOutFrames;
    return {
      id: s.id,
      audioSrc: s.audioSrc,
      durationInFrames,
      leadInFrames,
      leadOutFrames,
      scene: { component: s.component, props: s.props },
    };
  });

  return {
    id: args.id,
    fps: args.fps,
    voiceId: args.voiceId,
    voiceModel: args.voiceModel,
    scenes,
    totalDurationInFrames: scenes.reduce((sum, s) => sum + s.durationInFrames, 0),
  };
}
