import { useEffect, useMemo, useState } from "react";
import type { AgentEvent, ActivityState } from "./types.js";
import { readText } from "./agent-client.js";

/**
 * Per-scene status word that drives the SceneCard. Maps roughly to the
 * agent's pipeline stages but expressed from the user's POV.
 */
export type SceneStatus =
  | "queued" // exists in script.json but no narration / composition yet
  | "writing" // script being drafted/revised
  | "narrating" // TTS in flight
  | "composing" // HyperFrames composition being authored
  | "rendering" // final MP4 being produced
  | "ready" // every artifact for this scene exists
  | "error";

export interface SceneState {
  id: string;
  index: number;
  title: string;
  narration: string;
  durationSec?: number;
  status: SceneStatus;
  /** Latest activity state scoped to this scene, if any. */
  activityState?: ActivityState;
  /** Absolute path of the WAV/MP3, when narrated. */
  narrationPath?: string;
  /** Absolute path of the composition's index.html, when composed. */
  compositionPath?: string;
}

interface RawScene {
  id: string;
  narration?: string;
  title?: string;
  subtitle?: string;
  durationSec?: number;
}

interface RawScript {
  scenes?: RawScene[];
}

/**
 * Derive per-scene state by joining three sources:
 *
 *  1. The most recent script.json the agent wrote (its absolute path is
 *     captured from the `agent_tool_use` event for the Write tool). Read
 *     once via `studio.fs.readText`, refetched whenever a new write event
 *     lands.
 *  2. `progress` events with optional `sceneId` — gives per-scene phase
 *     transitions emitted by the pipeline.
 *  3. New `activity` events — gives the rotating-verb state that the UI
 *     animates over.
 *
 * Ephemeral — re-derived on every event change. No new persistence layer.
 *
 * Falsey returns are safe: when no script.json exists yet the hook
 * returns an empty list and the caller renders a placeholder strip.
 */
export function useSceneState(events: AgentEvent[]): {
  scenes: SceneState[];
  /** The latest `activity` event with no sceneId — i.e. run-wide. */
  globalActivity: ActivityState | null;
} {
  // Track the latest script.json path seen in tool-use events.
  const scriptPath = useMemo(() => latestScriptPath(events), [events]);

  // Read the script once per path change.
  const [rawScript, setRawScript] = useState<RawScript | null>(null);
  useEffect(() => {
    if (!scriptPath) {
      setRawScript(null);
      return;
    }
    let cancelled = false;
    // Small debounce — the file may not be flushed yet when the tool-use
    // event arrives. Retry once on parse failure.
    const tryRead = async (delayMs: number): Promise<void> => {
      await new Promise((r) => setTimeout(r, delayMs));
      if (cancelled) return;
      const text = await readText(scriptPath).catch(() => null);
      if (!text) {
        if (delayMs < 600) await tryRead(delayMs + 300);
        return;
      }
      try {
        const parsed = JSON.parse(text) as RawScript;
        if (!cancelled) setRawScript(parsed);
      } catch {
        if (delayMs < 600) await tryRead(delayMs + 300);
      }
    };
    void tryRead(200);
    return () => {
      cancelled = true;
    };
  }, [scriptPath]);

  // Join into final scene list.
  return useMemo(() => {
    const scenes = (rawScript?.scenes ?? []).map<SceneState>((s, idx) => ({
      id: s.id,
      index: idx,
      title: s.title ?? humanize(s.id),
      narration: s.narration ?? "",
      durationSec: s.durationSec,
      status: "queued",
    }));

    // Map of sceneId → index for quick patching.
    const idx = new Map(scenes.map((s, i) => [s.id, i]));

    // Walk events forward, applying state transitions.
    let globalActivity: ActivityState | null = null;
    for (const e of events) {
      if (e.type === "progress" && e.sceneId && idx.has(e.sceneId)) {
        const target = scenes[idx.get(e.sceneId)!];
        target.status = phaseToStatus(e.phase) ?? target.status;
      }
      if (e.type === "activity") {
        if (e.sceneId && idx.has(e.sceneId)) {
          const target = scenes[idx.get(e.sceneId)!];
          target.activityState = e.state;
          target.status = activityToStatus(e.state) ?? target.status;
        } else {
          globalActivity = e.state;
        }
      }
      if (e.type === "agent_tool_use" && e.tool === "Write") {
        const filePath = readToolFilePath(e.input);
        if (!filePath) continue;
        // Crude scope: if the path contains a scene id, mark that scene as
        // having its narration / composition produced.
        for (const [sceneId, sceneIdx] of idx.entries()) {
          if (filePath.includes(sceneId)) {
            const s = scenes[sceneIdx];
            const lower = filePath.toLowerCase();
            if (lower.endsWith(".wav") || lower.endsWith(".mp3")) {
              s.narrationPath = filePath;
            } else if (
              lower.endsWith("index.html") ||
              lower.endsWith(".html") ||
              lower.endsWith(".html")
            ) {
              s.compositionPath = filePath;
            }
          }
        }
      }
      if (e.type === "result") {
        // On terminal success, mark every scene that has narration +
        // composition recorded as ready.
        if (e.status === "success") {
          for (const s of scenes) {
            if (s.status !== "error") s.status = "ready";
          }
        }
      }
      if (e.type === "error" && e.recoverable === false) {
        for (const s of scenes) {
          if (s.status !== "ready") s.status = "error";
        }
      }
    }

    return { scenes, globalActivity };
  }, [events, rawScript]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function latestScriptPath(events: AgentEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "agent_tool_use") continue;
    if (e.tool !== "Write") continue;
    const path = readToolFilePath(e.input);
    if (path && /script\.json$/i.test(path)) return path;
  }
  return null;
}

function readToolFilePath(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const fp = obj.file_path ?? obj.path ?? obj.filePath;
  return typeof fp === "string" ? fp : null;
}

function humanize(id: string): string {
  return id
    .replace(/^\d+[-_]/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function phaseToStatus(phase: string): SceneStatus | null {
  switch (phase) {
    case "drafting_script":
    case "revising_script":
      return "writing";
    case "narration":
      return "narrating";
    case "composition":
    case "composing":
      return "composing";
    case "rendering":
      return "rendering";
    default:
      return null;
  }
}

function activityToStatus(state: ActivityState): SceneStatus | null {
  switch (state) {
    case "drafting":
    case "revising":
      return "writing";
    case "narrating":
      return "narrating";
    case "composing":
    case "polishing":
      return "composing";
    case "rendering":
    case "stitching":
      return "rendering";
    default:
      return null;
  }
}
