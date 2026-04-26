import { resolve, join } from "node:path";
import { promises as fs } from "node:fs";
import { runAgent } from "../claude.js";
import { emit } from "../index.js";

export interface GenerateVideoOptions {
  projectId: string;
  videoType: string;
  formats: string[];
  brief: string;
  /** Optional model override for this run. Threaded into runAgent → SDK. */
  model?: string;
  /** Persona id whose voicePrompt block is appended to the system prompt. */
  persona?: string;
  systemPrompt: string;
  /** Emit a prompt event and await the user's response. */
  askUser: (
    question: string,
    options: string[],
    payload?: Record<string, unknown>
  ) => Promise<string>;
}

/**
 * Bundled persona definitions (mirror of electron/types.ts PERSONAS).
 * Duplicated here so the agent runtime doesn't depend on electron-side code.
 * Keep the `id` and `voicePrompt` fields in sync with the renderer-side list.
 */
const PERSONA_VOICE_PROMPTS: Record<string, string> = {
  founder: "",
  conversational: [
    "PERSONA OVERRIDE — Conversational / podcast-style dialogue.",
    "",
    "Write this video as a two-speaker conversation. Both speakers appear in every scene's narration field, prefixed with `[A]:` and `[B]:` markers (one turn per line, blank line between speakers).",
    "",
    "- Speaker A is the host: curious, asks the question that opens the scene.",
    "- Speaker B is the expert: answers with specifics, examples, the actual claim.",
    "- Keep individual turns to 1–2 sentences. 4–8 turns per scene total.",
    "- Maintain the founder voice rules (no marketing-speak, no forbidden words, specifics over generalities).",
    "- Stage 4 (TTS): generate per-speaker WAV clips. Use voice `af_bella` for A and `am_michael` for B. Each scene's manifest entry should list both clips with their speaker tag and a sequencing offset so they play in order.",
    "- Stage 5 (composition): show a small speaker label that swaps in/out as the active speaker changes — same Atelier Noir typographic palette, brass for A's label, cinnabar for B's label.",
    "- The script.json scenes array gains an optional `speakers: [{ speaker: 'A' | 'B', text: string, durationSec: number }]` field that the composition reads. Keep the legacy `narration` field too as a flat-text rollup for backward compatibility with single-voice tools.",
  ].join("\n"),
  technical: [
    "PERSONA OVERRIDE — Technical / engineer-to-engineer.",
    "",
    "- Use precise terminology and tool/protocol names.",
    "- Cite real benchmarks: latency p50/p99, throughput, memory, cost figures.",
    "- Code spans (`vector_search`, `768-d embedding`) where they sharpen the claim.",
    "- Skip explanatory hand-waving — the audience is fluent.",
    "- The hook can be a contrarian engineering claim (\"O(n²) is the original sin of vector retrieval\").",
  ].join("\n"),
  editorial: [
    "PERSONA OVERRIDE — Editorial / long-form magazine.",
    "",
    "- Each scene narration runs 3–4 sentences instead of 1–2.",
    "- Use layered sentence structures — independent clauses, vivid imagery, occasional dependent clauses for rhythm.",
    "- Hook can be slower and more anticipatory; trust the viewer to wait.",
    "- Add one sentence of context before the substantive claim in each scene.",
    "- Total duration target: closer to the upper bound of the video type's duration range.",
  ].join("\n"),
};

function applyPersona(systemPrompt: string, personaId: string | undefined): string {
  if (!personaId) return systemPrompt;
  const override = PERSONA_VOICE_PROMPTS[personaId];
  if (!override || override.length === 0) return systemPrompt;
  return `${systemPrompt}\n\n---\n\n${override}\n`;
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

  // Resolve once at the top — every runAgent call inside this task uses the
  // persona-augmented prompt so the voice override applies uniformly across
  // all six stages.
  const resolvedSystemPrompt = applyPersona(opts.systemPrompt, opts.persona);

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
    systemPrompt: resolvedSystemPrompt,
    cwd: projectWorkspacePath,
    env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
    model: opts.model,
  });

  // ─── Stage 3: Script draft + HARD GATE ─────────────────────────────────
  emit({
    type: "progress",
    phase: "drafting_script",
    message: "Drafting script",
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
        systemPrompt: resolvedSystemPrompt,
        cwd: projectWorkspacePath,
        env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
      });
    }

    const scriptPreview = await readScriptPreview(scriptPath);

    emit({
      type: "progress",
      phase: "awaiting_approval",
      message: "Script ready — your turn",
      progress: 0.3,
    });

    // Single-step approval. The UI presents `approve` / `cancel` as buttons
    // and treats any free-text response from the chat composer as revision
    // notes. No second round-trip needed.
    const response = await opts.askUser(
      `Approve the ${opts.videoType} script for ${opts.projectId}?`,
      ["approve", "cancel"],
      {
        scriptPath,
        preview: scriptPreview,
        revision,
        acceptsFreeText: true,
      }
    );

    const trimmed = response.trim();

    if (trimmed === "cancel" || trimmed === "") {
      emit({
        type: "result",
        status: "needs_input",
        message: "Cancelled at script approval.",
      });
      return;
    }

    if (trimmed === "approve") {
      approved = true;
      break;
    }

    // Anything else: treat as revision notes.
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
        notes: trimmed,
        revision,
      }),
      systemPrompt: resolvedSystemPrompt,
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
    systemPrompt: resolvedSystemPrompt,
    cwd: projectWorkspacePath,
    env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
    model: opts.model,
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
    systemPrompt: resolvedSystemPrompt,
    cwd: projectWorkspacePath,
    env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
    model: opts.model,
  });

  // ─── Compose-approval gate: render now, preview first, or revise ───────
  // Each composition lives at <workspace>/<aspect>/index.html. The renderer
  // can launch `hyperframes preview` for any of these so the user can see
  // the actual GSAP timeline play before committing to a render.
  const aspects = aspectsFromFormats(opts.formats);
  const compositions = aspects.map((aspect) => ({
    aspect,
    path: join(projectWorkspacePath, aspect),
    indexHtml: join(projectWorkspacePath, aspect, "index.html"),
  }));

  let composeApproved = false;
  let composeRevision = 0;

  while (!composeApproved && composeRevision < 5) {
    emit({
      type: "progress",
      phase: "awaiting_compose_approval",
      message: "Composition ready — preview or render?",
      progress: 0.8,
    });

    const composeResponse = await opts.askUser(
      "Composition is ready. Render now, or preview first?",
      ["render", "cancel"],
      {
        kind: "compose-approval",
        compositions,
        projectWorkspacePath,
        revision: composeRevision,
        acceptsFreeText: true,
      }
    );

    const composeTrimmed = composeResponse.trim();

    if (composeTrimmed === "cancel" || composeTrimmed === "") {
      emit({
        type: "result",
        status: "needs_input",
        message: "Cancelled at composition approval.",
      });
      return;
    }

    if (composeTrimmed === "render") {
      composeApproved = true;
      break;
    }

    // Free text: treat as revision notes for the composition itself
    composeRevision += 1;
    emit({
      type: "progress",
      phase: "revising_composition",
      message: `Revising composition (round ${composeRevision})`,
      progress: 0.7,
    });

    await runAgent({
      prompt: reviseCompositionPrompt({
        projectId: opts.projectId,
        compositions,
        notes: composeTrimmed,
        revision: composeRevision,
      }),
      systemPrompt: resolvedSystemPrompt,
      cwd: projectWorkspacePath,
      env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
    });
  }

  if (!composeApproved) {
    emit({
      type: "result",
      status: "needs_input",
      message: "Maximum composition revisions reached without approval.",
    });
    return;
  }

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
    systemPrompt: resolvedSystemPrompt,
    cwd: projectWorkspacePath,
    env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
    model: opts.model,
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
  // Playground mode — no source repo. Skip the README/IMPROVEMENTS/launch-post
  // reads (there's nothing to read), still resolve the DESIGN.md from the
  // global default, and synthesise source-brief.md from the user's brief alone.
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

function reviseCompositionPrompt(args: {
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
  // Honour the render preferences the bridge passes through env. Falls back
  // to sensible defaults so a stale config doesn't break the pipeline.
  const quality = process.env.RENDER_QUALITY ?? "standard";
  const fps = process.env.RENDER_FPS ?? "30";
  const outputBase = process.env.OUTPUT_DIRECTORY
    ? `${process.env.OUTPUT_DIRECTORY}`
    : `${args.projectWorkspacePath}/output`;

  const lines = [
    `STAGE 6 — Render.`,
    ``,
    `For each format, render the matching aspect:`,
    ``,
  ];
  for (const format of args.formats) {
    const aspect = aspectFor(format);
    lines.push(
      `  cd ${args.projectWorkspacePath}/${aspect} && npx hyperframes render --output ${outputBase}/${format}.mp4 --quality ${quality} --fps ${fps}`
    );
  }
  lines.push(
    ``,
    `Render quality: ${quality} (override via Settings → Render preferences).`,
    `Render fps: ${fps}.`,
    `Output directory: ${outputBase}.`,
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
