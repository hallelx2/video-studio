import { useEffect, useState } from "react";
import type { ActivityState } from "./types.js";

/**
 * Pool of display verbs per agent activity state. The renderer rotates
 * through synonyms over time so a long-running stage doesn't feel frozen
 * — Claude-Code-style "Pondering · Crafting · Mulling…" rhythm.
 *
 * Verbs are present-participle, single word ideal, and tuned to a video-
 * studio vocabulary instead of a coding-agent one. Add to a pool to
 * vary the rhythm; the rotation cycles through the array in order.
 */
export const VERB_POOL: Record<ActivityState, string[]> = {
  reading: ["Reading", "Skimming", "Absorbing"],
  considering: ["Considering", "Pondering", "Mulling", "Synthesizing", "Reflecting"],
  drafting: ["Drafting", "Outlining", "Crafting", "Sketching"],
  revising: ["Polishing", "Refining", "Tightening", "Sharpening"],
  narrating: ["Narrating", "Voicing", "Recording", "Speaking"],
  composing: ["Staging", "Composing", "Arranging", "Painting"],
  rendering: ["Rendering", "Encoding", "Capturing", "Filming"],
  polishing: ["Polishing", "Conforming", "Smoothing"],
  stitching: ["Stitching", "Cutting", "Threading"],
  waiting: ["Waiting", "Listening"],
  retrying: ["Retrying", "Reconsidering", "Rerouting"],
};

const ROTATION_MS = 3500;

/**
 * Drive a rotating verb display from a state. Pure react state + interval;
 * no SDK / external store. The state name is the agent's semantic label,
 * the returned `verb` is the display string that rotates every ~3.5s.
 *
 * Pass `null` when there's no active state (returns null verb).
 *
 * The `cycleKey` returned alongside the verb increments on each rotation
 * — useful as a React `key` prop on the displayed text node so a parent
 * can drive its own cross-fade animation when the verb changes.
 */
export function useActivityVerb(state: ActivityState | null | undefined): {
  verb: string | null;
  cycleKey: number;
} {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!state) return;
    setTick(0);
    const id = setInterval(
      () => setTick((t) => t + 1),
      ROTATION_MS + jitter()
    );
    return () => clearInterval(id);
  }, [state]);

  if (!state) return { verb: null, cycleKey: 0 };
  const pool = VERB_POOL[state];
  if (!pool || pool.length === 0) return { verb: null, cycleKey: tick };
  return { verb: pool[tick % pool.length], cycleKey: tick };
}

// Per-instance jitter (~±300ms) so multiple verbs on the same screen
// don't tick in lockstep.
function jitter(): number {
  return Math.floor(Math.random() * 600 - 300);
}
