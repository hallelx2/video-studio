/**
 * Stage prompt + format-aspect helpers shared between the legacy
 * generate-video.ts macro and the standalone tool modules. Both call
 * sites build prompts with the same shape so the agent's behavior
 * stays identical regardless of which entry point fires.
 *
 * These were originally inlined in generate-video.ts; lifting them
 * here lets tools (script-drafter, composition-author, video-renderer)
 * reuse them without duplicating ~250 lines of prompt scaffolding.
 */

export interface VideoTypeMeta {
  scenes: number;
  durationSec: number;
  structure: string;
}

export const VIDEO_TYPE_META: Record<string, VideoTypeMeta> = {
  "hackathon-demo": {
    scenes: 5,
    durationSec: 75,
    structure: "hook → problem → build moment → demo → impact",
  },
  "product-launch": {
    scenes: 6,
    durationSec: 90,
    structure: "hook → stakes → reveal → proof → mechanism → CTA",
  },
  explainer: {
    scenes: 5,
    durationSec: 75,
    structure: "problem → why existing solutions fail → reframe → mechanism → why it matters",
  },
  tutorial: {
    scenes: 7,
    durationSec: 180,
    structure: "promise → setup → step-by-step (3) → recap → next",
  },
  storyline: {
    scenes: 5,
    durationSec: 120,
    structure: "character → pain → turning point → journey → payoff",
  },
  custom: {
    scenes: 5,
    durationSec: 60,
    structure: "user-defined — derive from the brief",
  },
};

export function videoTypeMetaFor(videoType: string): VideoTypeMeta {
  return VIDEO_TYPE_META[videoType] ?? VIDEO_TYPE_META["product-launch"];
}

// ─── Aspect ratio routing ────────────────────────────────────────────────

export function aspectFor(format: string): string {
  switch (format) {
    case "linkedin":
      return "1080x1080";
    case "youtube-short":
      return "1080x1920";
    default:
      return "1920x1080";
  }
}

export function aspectsFromFormats(formats: string[]): string[] {
  const set = new Set<string>();
  for (const f of formats) set.add(aspectFor(f));
  return Array.from(set);
}

// ─── Stage prompts ───────────────────────────────────────────────────────

export function stageOnePrompt(args: {
  projectId: string;
  videoType: string;
  brief: string;
  meta: VideoTypeMeta;
  projectSourcePath: string;
  projectWorkspacePath: string;
  orgRoot: string;
}): string {
  if (args.projectId === "__playground__") {
    return [
      `STAGE 1 + 2 — Playground mode (no source project).`,
      ``,
      `Video type: ${args.videoType} (${args.meta.scenes} scenes, ~${args.meta.durationSec}s, structure: ${args.meta.structure})`,
      args.brief ? `User brief: ${args.brief}` : `User brief: (none provided)`,
      ``,
      `Workspace folder: ${args.projectWorkspacePath}`,
      ``,
      `Playground means there's no organisation-projects/<id>/README.md to read — the brief above is the only context. Skip every source-read step.`,
      ``,
      `1. Resolve DESIGN.md: fork the repo-root DESIGN.md to ${args.projectWorkspacePath}/DESIGN.md verbatim. Don't customise — there's no brand to inherit.`,
      `2. Write ${args.projectWorkspacePath}/source-brief.md from the user's brief. Treat the brief as the elevator pitch + voice notes + audience hint, all in one. Reformat into a clean structured doc with headings: TL;DR, Audience, Hook angle, Voice notes.`,
      `3. If the brief is too thin to draft a script (under ~10 substantive words, or ambiguous about the topic), STOP HERE and emit a clarification prompt asking for one or two specifics — see the Persona Overrides + Communication Protocol sections of this system prompt for the prompt JSON shape. Don't fabricate content.`,
      ``,
      `Emit progress messages as you go. Do not draft the script in this stage — that's Stage 3.`,
    ].join("\n");
  }

  return [
    `STAGE 1 + 2 — Read source, resolve DESIGN.md.`,
    ``,
    `Project: ${args.projectId}`,
    `Video type: ${args.videoType} (${args.meta.scenes} scenes, ~${args.meta.durationSec}s, structure: ${args.meta.structure})`,
    args.brief ? `User brief: ${args.brief}` : `User brief: (none provided)`,
    ``,
    `Source folder: ${args.projectSourcePath}`,
    `Workspace folder: ${args.projectWorkspacePath}`,
    ``,
    `1. Read ${args.projectSourcePath}/README.md. Also read IMPROVEMENTS.md, LAUNCH.md, and any docs/*.md if they exist.`,
    `2. Look for ${args.orgRoot}/obsidian/outreach/${args.projectId}/posts/01-launch-day-founder-post.md — it's the canonical voice sample if present.`,
    `3. Resolve DESIGN.md per the Hard Gate:`,
    `   - If ${args.projectSourcePath}/DESIGN.md exists, copy to ${args.projectWorkspacePath}/DESIGN.md.`,
    `   - Else fork the repo-root DESIGN.md to ${args.projectWorkspacePath}/DESIGN.md, customising colour/accent only if the source project has explicit brand assets.`,
    `4. Write ${args.projectWorkspacePath}/source-brief.md summarising what you found: elevator pitch, key features, hook line, voice notes, brand notes (if any).`,
    ``,
    `Emit progress messages as you go. Do not draft the script in this stage — that's Stage 3.`,
  ].join("\n");
}

export function stageThreePrompt(args: {
  projectId: string;
  videoType: string;
  brief: string;
  meta: VideoTypeMeta;
  projectWorkspacePath: string;
}): string {
  return [
    `STAGE 3 — Draft the script.`,
    ``,
    `Project: ${args.projectId}`,
    `Video type: ${args.videoType} (${args.meta.scenes} scenes, ~${args.meta.durationSec}s)`,
    `Structure: ${args.meta.structure}`,
    args.brief ? `User brief: ${args.brief}` : ``,
    ``,
    `Read ${args.projectWorkspacePath}/source-brief.md and ${args.projectWorkspacePath}/DESIGN.md.`,
    ``,
    `Write the script to ${args.projectWorkspacePath}/script.json with this exact shape:`,
    ``,
    `{`,
    `  "projectId": "${args.projectId}",`,
    `  "videoType": "${args.videoType}",`,
    `  "totalDurationSec": <number>,`,
    `  "voice": "<voice-id>",`,
    `  "scenes": [`,
    `    {`,
    `      "id": "01-<short-name>",`,
    `      "narration": "<one or two sentences, written for the ear>",`,
    `      "title": "<on-screen headline>",`,
    `      "subtitle": "<optional support line>",`,
    `      "kind": "title-card|feature-callout|stat-reveal|comparison|code-snippet|cta",`,
    `      "durationSec": <number>`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Honour the founder voice rules and the forbidden-words list from the system prompt.`,
    `Use specifics from source-brief.md — no fabricated features.`,
    `Do NOT generate narration audio yet. Stop after writing script.json.`,
  ].join("\n");
}

export function reviseScriptPrompt(args: {
  projectId: string;
  scriptPath: string;
  notes: string;
  revision: number;
}): string {
  return [
    `SCRIPT REVISION ${args.revision} — User requested changes.`,
    ``,
    `Read ${args.scriptPath} and ${args.notes ? `apply these notes:\n\n${args.notes}\n` : "tighten the script for pacing and voice."}`,
    ``,
    `Re-write ${args.scriptPath} in place. Preserve scene IDs where possible.`,
    `Stop after writing.`,
  ].join("\n");
}

export function reviseCompositionPrompt(args: {
  projectId: string;
  compositions: Array<{ aspect: string; path: string; indexHtml: string }>;
  notes: string;
  revision: number;
}): string {
  const paths = args.compositions.map((c) => `  - ${c.indexHtml} (${c.aspect})`).join("\n");
  return [
    `COMPOSITION REVISION ${args.revision} — User requested changes after preview.`,
    ``,
    `Apply these notes to the existing composition(s):`,
    ``,
    args.notes,
    ``,
    `Compositions to update:`,
    paths,
    ``,
    `Rules:`,
    `- Honour the resolved DESIGN.md — do not introduce colours/fonts outside the palette.`,
    `- Honour the HyperFrames hard rules: no exit animations except final scene, deterministic timelines, no Math.random / Date.now, audio always as separate <audio> element, no repeat: -1.`,
    `- Re-run \`npx hyperframes lint\` after editing — must pass with zero errors.`,
    `- If contrast warnings appear, adjust within the DESIGN.md palette (don't invent new colours).`,
    ``,
    `Stop after the lint passes clean.`,
  ].join("\n");
}

export function stageFivePrompt(args: {
  projectId: string;
  videoType: string;
  formats: string[];
  projectWorkspacePath: string;
  scriptPath: string;
}): string {
  const aspects = aspectsFromFormats(args.formats);
  return [
    `STAGE 5 — Author HyperFrames composition(s).`,
    ``,
    `Aspect ratios needed: ${aspects.join(", ")}`,
    ``,
    `Load the 'hyperframes' skill and 'hyperframes-cli' skill before writing any HTML.`,
    `Read ${args.projectWorkspacePath}/DESIGN.md — it governs every colour, font, and motion choice.`,
    `Read ${args.scriptPath} and ${args.projectWorkspacePath}/manifest.json.`,
    ``,
    `For each aspect ratio:`,
    ``,
    `  1. Scaffold: npx hyperframes init ${args.projectWorkspacePath}/<aspect> --non-interactive`,
    `  2. Author index.html (and sub-compositions in compositions/) per HyperFrames rules:`,
    `     - Layout-before-animation`,
    `     - Entrance animations only (transitions own the exits — final scene only may fade out)`,
    `     - Vary at least 3 eases per scene`,
    `     - Wire each scene's <audio> from ../../narration/<scene-id>.wav (relative path)`,
    `     - Register all timelines on window.__timelines`,
    `     - data-width / data-height match the aspect`,
    `  3. Lint: npx hyperframes lint — must pass with zero errors before continuing.`,
    `  4. Validate contrast: npx hyperframes validate — fix any failures within the DESIGN.md palette.`,
    ``,
    `Emit progress per aspect.`,
    `Stop after all aspects lint clean.`,
  ].join("\n");
}

export function stageSixPrompt(args: {
  formats: string[];
  projectWorkspacePath: string;
}): string {
  const quality = process.env.RENDER_QUALITY ?? "standard";
  const fps = process.env.RENDER_FPS ?? "30";
  const outputBase = process.env.OUTPUT_DIRECTORY
    ? `${process.env.OUTPUT_DIRECTORY}`
    : `${args.projectWorkspacePath}/output`;

  const lines = [
    `STAGE 6 — Render.`,
    ``,
    `IMPORTANT: HyperFrames' default render settings produce an MP4 that the in-app Chromium <video> player frequently rejects (yuv444p pixel format, or a high H.264 profile / H.265 codec that browsers don't decode). To keep the in-app player working, render to a *.raw.mp4 first, then transcode with ffmpeg to a strictly browser-safe profile (H.264 baseline, yuv420p, AAC audio, +faststart). The transcode is fast — it only re-encodes if needed.`,
    ``,
    `For each format, run BOTH commands in sequence (do not skip the ffmpeg step):`,
    ``,
  ];
  for (const format of args.formats) {
    const aspect = aspectFor(format);
    const rawPath = `${outputBase}/${format}.raw.mp4`;
    const finalPath = `${outputBase}/${format}.mp4`;
    lines.push(
      `  cd ${args.projectWorkspacePath}/${aspect} && npx hyperframes render --output ${rawPath} --quality ${quality} --fps ${fps}`,
      `  ffmpeg -y -i ${rawPath} -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -preset fast -crf 20 -movflags +faststart -c:a aac -b:a 192k ${finalPath} && rm -f ${rawPath}`,
      ``
    );
  }
  lines.push(
    ``,
    `Emit a progress message after each render completes, including the final file size and duration.`,
    `If a render fails, emit an error event and continue with the remaining formats — don't abort the run.`,
    `If ffmpeg is missing, hyperframes ships its own at \`npx hyperframes ffmpeg\` — fall back to that with the same arguments.`
  );
  return lines.join("\n");
}
