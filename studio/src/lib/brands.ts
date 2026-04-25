import type { VideoFormat } from "./formats.js";

export interface BrandConfig {
  id: string;
  name: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  logoSrc?: string;
  /** Edge TTS voice name, e.g. "en-US-AndrewNeural" */
  voice?: string;
  /** Speaking rate offset, percentage (-50 to +200) */
  voiceRate?: number;
  /** Pitch offset, percentage (-50 to +50) */
  voicePitch?: number;
}

/**
 * Per-product brand tokens.
 * The agent reads this file to apply consistent colors + voice to each product's compositions.
 * Add a new entry whenever you onboard a new product.
 */
export const BRANDS: Record<string, BrandConfig> = {
  vectorless: {
    id: "vectorless",
    name: "Vectorless",
    accent: "#0070F3",
    background: "#0A0A0A",
    foreground: "#FFFFFF",
    muted: "#A1A1AA",
    logoSrc: "assets/vectorless/logo.svg",
    voice: "en-US-AndrewNeural",
  },
  coursify: {
    id: "coursify",
    name: "Coursify",
    accent: "#8B5CF6",
    background: "#0A0A0A",
    foreground: "#FFFFFF",
    muted: "#A1A1AA",
    voice: "en-US-AriaNeural",
  },
  hercules: {
    id: "hercules",
    name: "Hercules",
    accent: "#10B981",
    background: "#0A0A0A",
    foreground: "#FFFFFF",
    muted: "#A1A1AA",
    voice: "en-GB-RyanNeural",
  },
};

export function brandFor(productId: string): BrandConfig {
  return BRANDS[productId] ?? {
    id: productId,
    name: productId,
    accent: "#0070F3",
    background: "#0A0A0A",
    foreground: "#FFFFFF",
    muted: "#A1A1AA",
  };
}

export function formatAccent(format: VideoFormat, brand: BrandConfig): string {
  return brand.accent;
}
