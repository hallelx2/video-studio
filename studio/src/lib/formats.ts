export type VideoFormat = "linkedin" | "x" | "youtube" | "youtube-short" | "hero" | "pitch";

export interface FormatConfig {
  id: VideoFormat;
  label: string;
  width: number;
  height: number;
  targetDurationSec: [number, number];
  description: string;
}

export const FORMATS: Record<VideoFormat, FormatConfig> = {
  linkedin: {
    id: "linkedin",
    label: "LinkedIn Square",
    width: 1080,
    height: 1080,
    targetDurationSec: [60, 75],
    description: "Professional feed, sound-off, 1:1 aspect",
  },
  x: {
    id: "x",
    label: "X / Twitter",
    width: 1920,
    height: 1080,
    targetDurationSec: [45, 60],
    description: "Founder thread, sound-on, 16:9",
  },
  youtube: {
    id: "youtube",
    label: "YouTube Long",
    width: 1920,
    height: 1080,
    targetDurationSec: [75, 120],
    description: "YouTube search, sound-on, 16:9",
  },
  "youtube-short": {
    id: "youtube-short",
    label: "YouTube Short",
    width: 1080,
    height: 1920,
    targetDurationSec: [45, 60],
    description: "Mobile vertical, burned-in captions, 9:16",
  },
  hero: {
    id: "hero",
    label: "Website Hero",
    width: 1920,
    height: 1080,
    targetDurationSec: [20, 30],
    description: "Landing page autoplay loop, muted, 16:9",
  },
  pitch: {
    id: "pitch",
    label: "Investor Pitch",
    width: 1920,
    height: 1080,
    targetDurationSec: [90, 120],
    description: "Investor deck, sound-on, 16:9",
  },
};
