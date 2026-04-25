/**
 * Geist-derived SaaS video palette.
 * All scene components import from here.
 */
export const geist = {
  background: "#0A0A0A",
  foreground: "#FFFFFF",
  muted: "#A1A1AA",
  subtle: "#71717A",
  border: "#262626",
  accent: "#0070F3",
  success: "#0070F3",
  danger: "#F31260",
  warning: "#F5A524",
} as const;

/**
 * Spring config used for every motion in the studio.
 * Tweak here and every scene updates.
 */
export const springDefault = {
  stiffness: 200,
  damping: 20,
  mass: 1,
} as const;

/**
 * Stagger delay per sibling element, in frames.
 */
export const stagger = 6;
