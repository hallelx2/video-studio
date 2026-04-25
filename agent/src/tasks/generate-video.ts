import { resolve, join } from "node:path";
import { promises as fs } from "node:fs";
import { runAgent } from "../claude.js";
import { emit } from "../index.js";

export interface GenerateVideoOptions {
  projectId: string;
  videoType: string;
  formats: string[];
  brief: string;
  systemPrompt: string;
  /** Emit a prompt event and await the user's response. */
  askUser: (
    question: string,
    options: string[],
    payload?: Record<string, unknown>
  ) => Promise<string>;
}

interface VideoTypeMeta {
  scenes: number;
  durationSec: number;
  structure: string;
}

const VIDEO_TYPE_META: Record<string, VideoTypeMeta> = {
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
    scenes: 6,
    durationSec: 90,
    structure: "structured by the user's brief",
  },
};

/**
 * Drives the full HyperFrames pipeline for one project × video-type request.
 *
 * Orchestration lives here. The agent (Claude SDK) does the bulk of each
 * stage — reading source, drafting JSON, authoring HTML, etc — but the
 * stage boundaries and the user-approval gate are explicit in this code.
 *
 * Why split it like this? The script-approval prompt has to halt the run
 * mid-pipeline. The cleanest way to do that is for our orchestrator to call
 * runAgent() per stage and await askUser() between stages.
 */
export async function runGenerateVideo(opts: GenerateVideoOptions): Promise<void> {
  const orgRoot = resolve(
    process.env.ORG_PROJECTS_PATH ??
      resolve(
        process.env.USERPROFILE ?? process.env.HOME ?? "~",
        "Documents",
        "organisation-projects"
      )
  );

  const workspaceRoot = resolve(
    process.env.WORKSPACE_PATH ?? resolve(process.cwd(), ".video-studio-workspace")
  );

  const projectSourcePath = join(orgRoot, opts.projectId);
  const projectWorkspacePath = join(workspaceRoot, opts.projectId);
  const meta = VIDEO_TYPE_META[opts.videoType] ?? VIDEO_TYPE_META["product-launch"];
  const ttsVoice = process.env.TTS_VOICE ?? "af_nova";

  // Make sure the workspace exists before we hand it to the agent.
  await fs.mkdir(projectWorkspacePath, { recursive: true });

  // ─── Stage 1+2: Read source + resolve DESIGN.md ────────────────────────
  emit({
    type: "progress",
    phase: "reading_source",
    message: `Reading ${opts.projectId} from ${projectSourcePath}`,
    progress: 0.05,
  });

  await runAgent({
    prompt: stageOnePrompt({
      projectId: opts.projectId,
      videoType: opts.videoType,
      brief: opts.brief,
      meta,
      projectSourcePath,
      projectWorkspacePath,
      orgRoot,
    }),
    systemPrompt: opts.systemPrompt,
    cwd: projectWorkspacePath,
    env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
  });

  // ─── Stage 3: Script draft + HARD GATE ─────────────────────────────────
  emit({
    type: "progress",
    phase: "drafting_script",
    message: "Drafting script — awaiting your approval",
    progress: 0.25,
  });

  const scriptPath = join(projectWorkspacePath, "script.json");
  let approved = false;
  let revision = 0;

  while (!approved && revision < 5) {
    // The first iteration writes the initial draft via the agent;
    // subsequent iterations revise based on user feedback.
    if (revision === 0) {
      await runAgent({
        prompt: stageThreePrompt({
          projectId: opts.projectId,
          videoType: opts.videoType,
          brief: opts.brief,
          meta,
          projectWorkspacePath,
        }),
        systemPrompt: opts.systemPrompt,
        cwd: projectWorkspacePath,
        env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
      });
    }

    const scriptPreview = await readScriptPreview(scriptPath);

    const response = await opts.askUser(
      `Approve the ${opts.videoType} script for ${opts.projectId}?`,
      ["approve", "request-changes", "cancel"],
      {
        scriptPath,
        preview: scriptPreview,
        revision,
      }
    );

    if (response === "cancel") {
      emit({
        type: "result",
        status: "needs_input",
        message: "Cancelled at script approval.",
      });
      return;
    }

    if (response === "approve") {
      approved = true;
      break;
    }

    // request-changes — ask for revision notes and re-run drafting
    const notes = await opts.askUser(
      "What should change in the script?",
      ["submit"],
      { multiline: true }
    );

    revision += 1;
    emit({
      type: "progress",
      phase: "revising_script",
      message: `Revising script (round ${revision})`,
      progress: 0.25,
    });

    await runAgent({
      prompt: reviseScriptPrompt({
        projectId: opts.projectId,
        scriptPath,
        notes,
        revision,
      }),
      systemPrompt: opts.systemPrompt,
      cwd: projectWorkspacePath,
      env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
    });
  }

  if (!approved) {
    emit({
      type: "result",
      status: "needs_input",
      message: "Maximum script revisions reached without approval.",
    });
    return;
  }

  // ─── Stage 4: Kokoro TTS narration ─────────────────────────────────────
  emit({
    type: "progress",
    phase: "narration",
    message: "Generating narration via Kokoro (HyperFrames TTS)",
    progress: 0.45,
  });

  await runAgent({
    prompt: stageFourPrompt({
      projectWorkspacePath,
      ttsVoice,
      scriptPath,
    }),
    systemPrompt: opts.systemPrompt,
    cwd: projectWorkspacePath,
    env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
  });

  // ─── Stage 5: HyperFrames composition (per aspect ratio) ───────────────
  emit({
    type: "progress",
    phase: "composing",
    message: "Authoring HyperFrames composition(s)",
    progress: 0.65,
  });

  await runAgent({
    prompt: stageFivePrompt({
      projectId: opts.projectId,
      videoType: opts.videoType,
      formats: opts.formats,
      projectWorkspacePath,
      scriptPath,
    }),
    systemPrompt: opts.systemPrompt,
    cwd: projectWorkspacePath,
    env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
  });

  // ─── Stage 6: Render ───────────────────────────────────────────────────
  emit({
    type: "progress",
    phase: "rendering",
    message: `Rendering ${opts.formats.length} format(s)`,
    progress: 0.85,
  });

  await runAgent({
    prompt: stageSixPrompt({
      formats: opts.formats,
      projectWorkspacePath,
    }),
    systemPrompt: opts.systemPrompt,
    cwd: projectWorkspacePath,
    env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
  });

  // ─── Done ───────────────────────────────────────────────────────────────
  emit({
    type: "result",
    status: "success",
    message: `Rendered ${opts.formats.length} format(s) for ${opts.projectId}`,
    artifacts: {
      compositionPath: join(projectWorkspacePath, "1080x1080", "index.html"),
      outputs: opts.formats.map((format) => ({
        format,
        path: join(projectWorkspacePath, "output", `${format}.mp4`),
      })),
    },
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeEnv(
  orgRoot: string,
  workspaceRoot: string,
  ttsVoice: string
): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    ORG_PROJECTS_PATH: orgRoot,
    WORKSPACE_PATH: workspaceRoot,
    TTS_VOICE: ttsVoice,
  };
}

async function readScriptPreview(
  scriptPath: string
): Promise<{ scenes?: Array<{ id: string; narration: string }>; raw?: string } | null> {
  try {
    const raw = await fs.readFile(scriptPath, "utf8");
    const parsed = JSON.parse(raw) as { scenes?: Array<{ id: string; narration: string }> };
    return { scenes: parsed.scenes ?? [], raw };
  } catch {
    return null;
  }
}

// ─── Stage prompts ─────────────────────────────────────────────────────────
// These are the per-stage micro-prompts handed to the agent. The system prompt
// (agent/prompts/system.md) supplies the full pipeline + rules; these focus
// the agent on one concrete deliverable.

function stageOnePrompt(args: {
  projectId: string;
  videoType: string;
  brief: string;
  meta: VideoTypeMeta;
  projectSourcePath: string;
  projectWorkspacePath: string;
  orgRoot: string;
}): string {
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

function stageThreePrompt(args: {
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

function reviseScriptPrompt(args: {
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

function stageFourPrompt(args: {
  projectWorkspacePath: string;
  ttsVoice: string;
  scriptPath: string;
}): string {
  return [
    `STAGE 4 — Kokoro TTS narration.`,
    ``,
    `Read ${args.scriptPath}. For each scene, generate narration WAV via:`,
    ``,
    `  npx hyperframes tts "<narration>" --voice ${args.ttsVoice} --output ${args.projectWorkspacePath}/narration/<scene-id>.wav`,
    ``,
    `Cache by sha256(voice+text) — store the hash next to the wav (<scene-id>.wav.hash). If a scene's hash matches, skip generation.`,
    ``,
    `Write ${args.projectWorkspacePath}/manifest.json listing each scene: { id, narrationPath, durationSec } — measure duration with ffprobe or HyperFrames.`,
    ``,
    `Emit progress per scene: 'narration: <scene-id> (cached|new)'.`,
  ].join("\n");
}

function stageFivePrompt(args: {
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

function stageSixPrompt(args: {
  formats: string[];
  projectWorkspacePath: string;
}): string {
  const lines = [
    `STAGE 6 — Render.`,
    ``,
    `For each format, render the matching aspect:`,
    ``,
  ];
  for (const format of args.formats) {
    const aspect = aspectFor(format);
    lines.push(
      `  cd ${args.projectWorkspacePath}/${aspect} && npx hyperframes render --output ${args.projectWorkspacePath}/output/${format}.mp4 --quality high --fps 30`
    );
  }
  lines.push(
    ``,
    `Emit a progress message after each render completes, including the final file size and duration.`,
    `If a render fails, emit an error event and continue with the remaining formats — don't abort the run.`
  );
  return lines.join("\n");
}

// ─── Aspect ratio routing ─────────────────────────────────────────────────
function aspectFor(format: string): string {
  switch (format) {
    case "linkedin":
      return "1080x1080";
    case "youtube-short":
      return "1080x1920";
    default:
      return "1920x1080";
  }
}

function aspectsFromFormats(formats: string[]): string[] {
  const set = new Set<string>();
  for (const f of formats) set.add(aspectFor(f));
  return Array.from(set);
}
