import {
  // Kind-aware (semantic) icons
  ScrollText,    // script (script.json)
  PenTool,       // design (DESIGN.md)
  Briefcase,     // brief (source-brief.md)
  Layers,        // manifest (manifest.json)
  PlayCircle,    // composition (HyperFrames index.html)
  Mic,           // narration (.wav)
  Video,         // render (.mp4)
  Settings2,     // config (package.json, tsconfig.json)
  // Extension-driven icons
  FileJson,      // .json
  FileCode2,     // .ts/.tsx/.js/.jsx
  FileType,      // .css
  FileText,      // .md/.txt/README
  Image,         // .png/.jpg/.gif/.svg
  FileVideo,     // any video
  FileAudio,     // any audio
  FileArchive,   // .zip/.tar
  Globe,         // .html
  File as FileIcon,
  type LucideIcon,
} from "lucide-react";
import type { Artifact, ArtifactKind } from "../../lib/agent-state.js";

/**
 * Visual tone for a file's icon disc. Three-tier hierarchy keeps the panel
 * scannable without devolving into a rainbow:
 *   - "core"   — script/design/brief/manifest/composition/narration/render
 *   - "code"   — source files the agent has touched (.ts/.tsx/.css/.html/.json)
 *   - "muted"  — everything else (configs, docs, binaries we don't preview)
 */
export type FileTone = "core" | "code" | "muted";

const KIND_ICON: Partial<Record<ArtifactKind, LucideIcon>> = {
  script: ScrollText,
  design: PenTool,
  brief: Briefcase,
  manifest: Layers,
  composition: PlayCircle,
  narration: Mic,
  render: Video,
  config: Settings2,
};

const EXT_ICON: Record<string, LucideIcon> = {
  // Code / structured
  json: FileJson,
  jsonc: FileJson,
  ts: FileCode2,
  tsx: FileCode2,
  js: FileCode2,
  jsx: FileCode2,
  mjs: FileCode2,
  cjs: FileCode2,
  py: FileCode2,
  rs: FileCode2,
  go: FileCode2,
  java: FileCode2,
  c: FileCode2,
  h: FileCode2,
  cpp: FileCode2,
  rb: FileCode2,
  php: FileCode2,
  swift: FileCode2,
  kt: FileCode2,
  // Web
  html: Globe,
  htm: Globe,
  css: FileType,
  scss: FileType,
  // Prose
  md: FileText,
  mdx: FileText,
  txt: FileText,
  // Media
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  webp: Image,
  svg: Image,
  pdf: FileText,
  mp4: FileVideo,
  webm: FileVideo,
  mov: FileVideo,
  wav: FileAudio,
  mp3: FileAudio,
  ogg: FileAudio,
  flac: FileAudio,
  // Archives
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
};

/** Pick the icon: kind-aware first, then extension, then a generic fallback. */
export function iconForArtifact(a: Artifact): LucideIcon {
  return KIND_ICON[a.kind] ?? EXT_ICON[a.ext] ?? FileIcon;
}

const CORE_KINDS: ArtifactKind[] = [
  "script",
  "design",
  "brief",
  "manifest",
  "composition",
  "narration",
  "render",
];

/** Tone assignment for the icon disc — see FileTone docstring. */
export function toneForArtifact(a: Artifact): FileTone {
  if (CORE_KINDS.includes(a.kind)) return "core";
  if (a.kind === "code") return "code";
  return "muted";
}

/**
 * Tailwind classes for the icon disc background + ring + glyph color, by tone.
 * Mirrors the StreamRow disc treatment for visual consistency across the app.
 */
export const TONE_DISC: Record<FileTone, { bg: string; glyph: string }> = {
  core: {
    bg: "bg-cyan/[0.10] ring-1 ring-cyan/30",
    glyph: "text-cyan",
  },
  code: {
    bg: "bg-mist-08 ring-1 ring-mist-12",
    glyph: "text-fg",
  },
  muted: {
    bg: "bg-mist-04 ring-1 ring-mist-08",
    glyph: "text-fg-muted",
  },
};

/** Past-tense action labels — short pill values shown in the row trailing column. */
export const ACTION_LABEL: Record<Artifact["lastAction"], string> = {
  wrote: "wrote",
  edited: "edited",
  read: "read",
};
