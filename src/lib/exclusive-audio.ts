import { useEffect, useRef } from "react";

/**
 * Tiny coordinator that pauses every other registered audio when one
 * starts playing. Used by SceneCard so a user clicking play on scene 3
 * automatically pauses scene 2 — no double-narration overlap.
 *
 * No state, no provider — just a module-scoped registry of active
 * `<audio>` elements. Components register on mount and unregister on
 * unmount; whenever an `audio.play()` event fires, the registry pauses
 * everyone else.
 */

const registry = new Set<HTMLAudioElement>();

export function useExclusiveAudio<T extends HTMLAudioElement>(): React.MutableRefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    registry.add(el);
    const onPlay = () => {
      for (const other of registry) {
        if (other !== el && !other.paused) {
          other.pause();
        }
      }
    };
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("play", onPlay);
      registry.delete(el);
    };
  }, []);

  return ref;
}
