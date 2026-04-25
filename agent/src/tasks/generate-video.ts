import { resolve } from "node:path";
import { runAgent } from "../claude.js";
import { emit } from "../index.js";

export interface GenerateVideoOptions {
  product: string;
  formats: string[];
  compositionId?: string;
  systemPrompt: string;
}

/**
 * Run the full video generation pipeline for a single product × formats request.
 *
 * Delegates everything to the Claude Agent SDK. The system prompt at
 * agent/prompts/system.md is the actual brain. This function just
 * frames the task, passes paths as env vars, and streams results.
 */
export async function runGenerateVideo(opts: GenerateVideoOptions): Promise<void> {
  const studioPath = resolve(process.env.VIDEO_STUDIO_STUDIO_PATH ?? resolve(process.cwd(), "..", "studio"));
  const orgProjectsPath = resolve(
    process.env.ORG_PROJECTS_PATH ??
      resolve(process.env.USERPROFILE ?? process.env.HOME ?? "~", "Documents", "organisation-projects")
  );
  const obsidianOutreachPath = resolve(
    process.env.OBSIDIAN_OUTREACH_PATH ??
      resolve(process.env.USERPROFILE ?? process.env.HOME ?? "~", "Documents", "obsidian", "outreach")
  );

  const compositionId = opts.compositionId ?? deriveCompositionId(opts.product);

  emit({
    type: "progress",
    phase: "reading_readme",
    message: `Starting generation for ${opts.product} (${opts.formats.join(", ")})`,
    progress: 0.02,
  });

  const prompt = buildTaskPrompt({
    product: opts.product,
    formats: opts.formats,
    compositionId,
    studioPath,
    orgProjectsPath,
    obsidianOutreachPath,
  });

  await runAgent({
    prompt,
    systemPrompt: opts.systemPrompt,
    cwd: studioPath,
    env: {
      // Inherit the entire parent env so the Claude CLI can find ~/.claude/
      // credentials, PATH, USERPROFILE, etc. Then layer studio-specific overrides on top.
      ...(process.env as Record<string, string>),
      VIDEO_STUDIO_STUDIO_PATH: studioPath,
      ORG_PROJECTS_PATH: orgProjectsPath,
      OBSIDIAN_OUTREACH_PATH: obsidianOutreachPath,
      TTS_VOICE: process.env.TTS_VOICE ?? "en-US-AndrewNeural",
    },
  });

  emit({
    type: "result",
    status: "success",
    artifacts: {
      scriptPath: `src/compositions/${opts.product}/${compositionId}.script.ts`,
      manifestPath: `public/manifests/${opts.product}/${compositionId}.json`,
      outputs: opts.formats.map((format) => ({
        format,
        path: `output/${opts.product}/${compositionId}-${format}.mp4`,
      })),
    },
    message: `Generated ${opts.formats.length} format(s) for ${opts.product}`,
  });
}

function deriveCompositionId(product: string): string {
  return `launch-hero`;
}

function buildTaskPrompt(args: {
  product: string;
  formats: string[];
  compositionId: string;
  studioPath: string;
  orgProjectsPath: string;
  obsidianOutreachPath: string;
}): string {
  return [
    `TASK: Generate a product launch video for "${args.product}".`,
    ``,
    `Composition ID: ${args.compositionId}`,
    `Formats to render: ${args.formats.join(", ")}`,
    `Studio workspace: ${args.studioPath}`,
    `Product repos root: ${args.orgProjectsPath}`,
    `Voice reference root: ${args.obsidianOutreachPath}`,
    ``,
    `Follow the Five-Stage Pipeline from the system prompt:`,
    `  1. Read ${args.orgProjectsPath}/${args.product}/README.md plus IMPROVEMENTS.md if present.`,
    `     Also read ${args.obsidianOutreachPath}/${args.product}/posts/01-launch-day-founder-post.md if it exists.`,
    `  2. Draft the script at src/compositions/${args.product}/${args.compositionId}.script.ts using the Six-Act Launch Arc.`,
    `     Emit a "prompt" message with id="script-approval" and WAIT for the user's response before proceeding.`,
    `  3. Only after approval: load the elevenlabs-remotion skill and generate narration audio for each scene.`,
    `     Cache by sha256 hash of (voice_id + model + text). Write the manifest.`,
    `  4. Write the Remotion composition at src/compositions/${args.product}/${args.compositionId}.tsx.`,
    `     Register it in src/Root.tsx inside <Folder name="${args.product}">.`,
    `  5. Render each requested format via "npx remotion render".`,
    ``,
    `Respect the hard rules in the system prompt. Stream progress after every major step.`,
    `End with a structured result message.`,
  ].join("\n");
}
