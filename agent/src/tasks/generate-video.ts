import { resolve, join } from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { runAgent } from "../claude.js";
import { emit } from "../index.js";

// ─── Subprocess output cleanup ────────────────────────────────────────────
// Kokoro / hyperframes-tts use tqdm-style progress bars that emit bare \r
// to overwrite the line in place. Without honoring CR, every partial state
// gets concatenated into a single garbage line full of unicode block-
// drawing characters that don't render in the chat font (showing as tofu
// boxes). Keep only the LAST CR-segment of each line and drop pure progress
// frames (`50%|████ |50/100 [00:01<00:01, 50it/s]` and friends) so the
// terminal pane reads as actual log output instead of a bar dump.
const TQDM_PROGRESS_RE =
  /^\s*\d{1,3}%?\s*\|.*\|\s*\d+\/?\d*\s*(\[[^\]]*\])?\s*$/;
const ONLY_BLOCK_CHARS_RE = /^[▀-▟\s|0-9%/.\[\]:,<>?\-]+$/;

function cleanProgressLines(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine) continue;
    // Honor bare-CR overwrites — only the final segment was meant to be visible.
    const segments = rawLine.split("\r");
    const last = segments[segments.length - 1].trimEnd();
    if (!last) continue;
    if (TQDM_PROGRESS_RE.test(last)) continue;
    if (ONLY_BLOCK_CHARS_RE.test(last)) continue;
    out.push(last);
  }
  return out;
}

// ─── Natural-language approval classifier ─────────────────────────────────
// Approval gates accept a primary verb ("approve", "render") plus a free-
// text channel for revision notes. Without natural-language matching, a
// reasonable user response like "you can continue" or "yes go ahead" gets
// silently treated as revision notes — the agent regenerates instead of
// proceeding. This classifier maps common affirmatives → approve and
// negatives → cancel, so the gates feel like a chat instead of a CLI flag.
type ApprovalIntent = "approve" | "cancel" | "revise";

const AFFIRMATIVE_RE =
  /^(y|yes|yep|yeah|yup|ok|okay|sure|fine|good|great|perfect|sounds good|looks good|lgtm|ship it|ship|go|go ahead|proceed|continue|you can continue|do it|approve|approved|accept|accepted)\.?!?$/i;

const NEGATIVE_RE =
  /^(n|no|nope|nah|stop|abort|kill|cancel|cancelled|cancelled\.|forget it)\.?!?$/i;

/**
 * Classify a free-text response from an approval gate.
 *
 * @param response   The raw string the user submitted.
 * @param verbs      Gate-specific approval verbs (e.g. ["approve"] or
 *                   ["render"]). Matched literally before the regex so the
 *                   button-click path is fast and unambiguous.
 */
function classifyApproval(
  response: string,
  verbs: readonly string[]
): ApprovalIntent {
  const t = response.trim().toLowerCase();
  if (!t) return "cancel";
  if (verbs.includes(t)) return "approve";
  if (AFFIRMATIVE_RE.test(t)) return "approve";
  if (NEGATIVE_RE.test(t)) return "cancel";
  return "revise";
}

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

  // ─── Resume detection ──────────────────────────────────────────────────
  // If the previous run died mid-pipeline, the workspace already has some
  // artifacts on disk. Detect what's there and skip the stages whose work
  // is already done — the user shouldn't have to re-pay for an Opus draft
  // because the SDK timed out three minutes later in the narration stage.
  const scriptPath = join(projectWorkspacePath, "script.json");
  const designPath = join(projectWorkspacePath, "DESIGN.md");
  const briefPath = join(projectWorkspacePath, "source-brief.md");
  const resume = await detectResume({
    scriptPath,
    designPath,
    briefPath,
    projectWorkspacePath,
    formats: opts.formats,
    videoType: opts.videoType,
  });

  if (resume.invalidationNote) {
    // The workspace has stale artifacts from a previous run with a
    // different video-type. Surface explicitly so the user knows why
    // we're regenerating instead of resuming.
    emit({
      type: "progress",
      phase: "reading_source",
      message: resume.invalidationNote,
      progress: 0.05,
    });
  } else if (resume.resumedFrom) {
    emit({
      type: "progress",
      phase: "reading_source",
      message: `Resuming from ${resume.resumedFrom} — found existing ${resume.foundArtifacts.join(", ")}`,
      progress: 0.05,
    });
  }

  // ─── Stage 1+2: Read source + resolve DESIGN.md ────────────────────────
  if (!resume.skipReadSource) {
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
  }

  // ─── Stage 3: Script draft + HARD GATE ─────────────────────────────────
  // Approval is persistent: once the user approves a script we stash its
  // hash in <workspace>/.approval.json. If the same script comes back on a
  // follow-up run with the hash unchanged we auto-approve and move on
  // without re-bothering the user. Editing the script (revise / re-draft)
  // clears the approval so the next cycle re-prompts.
  const approvalPath = join(projectWorkspacePath, ".approval.json");
  const currentScriptHash = await hashFileIfExists(scriptPath);
  const previousApproval = await readApprovalState(approvalPath);
  const scriptAlreadyApproved =
    !!previousApproval &&
    !!currentScriptHash &&
    previousApproval.scriptHash === currentScriptHash;

  emit({
    type: "progress",
    phase: "drafting_script",
    message: scriptAlreadyApproved
      ? "Script unchanged from previous approval — skipping the gate"
      : resume.skipDraftScript
        ? "Found existing script.json — skipping draft, going straight to approval"
        : "Drafting script",
    progress: 0.25,
  });

  let approved = scriptAlreadyApproved;
  let revision = 0;

  while (!approved && revision < 5) {
    // The first iteration writes the initial draft via the agent;
    // subsequent iterations revise based on user feedback. If resume
    // detection found an existing script.json we skip the initial draft
    // run entirely and go straight to the approval gate.
    if (revision === 0 && !resume.skipDraftScript) {
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
    const intent = classifyApproval(trimmed, ["approve"]);

    if (intent === "cancel") {
      // Cancel clears the approval file too — next run starts fresh.
      await clearApprovalState(approvalPath).catch(() => undefined);
      emit({
        type: "result",
        status: "needs_input",
        message: "Cancelled at script approval.",
      });
      return;
    }

    if (intent === "approve") {
      approved = true;
      const fresh = await hashFileIfExists(scriptPath);
      await writeApprovalState(approvalPath, {
        ...(previousApproval ?? {}),
        scriptHash: fresh,
        scriptApprovedAt: Date.now(),
      });
      break;
    }

    // Revision invalidates any prior compose approval too — content
    // downstream will need to be re-checked.
    await writeApprovalState(approvalPath, {
      ...(previousApproval ?? {}),
      scriptHash: null,
      composeHash: null,
    });

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
  // Direct subprocess loop — not delegated to Claude. Wrapped in
  // withReviewAndRetry so a failure (e.g., kokoro-onnx not installed,
  // ffmpeg missing) becomes an agent-written review + a retry/cancel
  // gate the user can act on, not a fatal that kills the run.
  if (resume.skipNarration) {
    emit({
      type: "progress",
      phase: "narration",
      message: "Found existing narration WAVs — skipping TTS",
      progress: 0.45,
    });
  } else {
    emit({
      type: "progress",
      phase: "narration",
      message: "Generating narration via Kokoro (HyperFrames TTS)",
      progress: 0.45,
    });

    try {
      await withReviewAndRetry(
        () =>
          runNarrationDirect({
            scriptPath,
            workspacePath: projectWorkspacePath,
            ttsVoice,
          }),
        {
          stageName: "narration",
          systemPrompt: resolvedSystemPrompt,
          cwd: projectWorkspacePath,
          env: makeEnv(orgRoot, workspaceRoot, ttsVoice),
          model: opts.model,
          askUser: opts.askUser,
        }
      );
    } catch (err) {
      // Either the user picked cancel or we exhausted retries. Pause
      // the run cleanly with the agent's review preserved in the stream
      // — the user can fix the environment and send a new message; the
      // detectResume() pass at the top of the next run will pick up
      // where the WAV cache left off.
      emit({
        type: "result",
        status: "needs_input",
        message: `Narration paused — ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      return;
    }
  }

  // ─── Stage 5: HyperFrames composition (per aspect ratio) ───────────────
  if (resume.skipCompose) {
    emit({
      type: "progress",
      phase: "composing",
      message: "Found existing compositions — skipping authoring",
      progress: 0.65,
    });
  } else {
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
  }

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

  // Same persistence trick as script approval — if every composition is
  // byte-for-byte unchanged from when we approved, skip straight to render.
  const currentComposeHash = await hashCompositionsIfExist(compositions);
  const latestApproval = await readApprovalState(approvalPath);
  const composeAlreadyApproved =
    !!latestApproval &&
    !!currentComposeHash &&
    latestApproval.composeHash === currentComposeHash;

  if (composeAlreadyApproved) {
    emit({
      type: "progress",
      phase: "awaiting_compose_approval",
      message: "Compositions unchanged from previous approval — going straight to render",
      progress: 0.8,
    });
  }

  let composeApproved = composeAlreadyApproved;
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
    const composeIntent = classifyApproval(composeTrimmed, ["render"]);

    if (composeIntent === "cancel") {
      // Cancel clears the compose-side approval but leaves script approval
      // intact — the user can revise the composition without re-OK-ing
      // the same script next time.
      const clearedCompose = await readApprovalState(approvalPath);
      await writeApprovalState(approvalPath, {
        ...(clearedCompose ?? {}),
        composeHash: null,
      });
      emit({
        type: "result",
        status: "needs_input",
        message: "Cancelled at composition approval.",
      });
      return;
    }

    if (composeIntent === "approve") {
      composeApproved = true;
      const fresh = await hashCompositionsIfExist(compositions);
      const beforeRender = await readApprovalState(approvalPath);
      await writeApprovalState(approvalPath, {
        ...(beforeRender ?? {}),
        composeHash: fresh,
        composeApprovedAt: Date.now(),
      });
      break;
    }

    // Revision notes — clear the compose hash so the next loop re-prompts.
    const beforeRevise = await readApprovalState(approvalPath);
    await writeApprovalState(approvalPath, {
      ...(beforeRevise ?? {}),
      composeHash: null,
    });

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

// ─── Resume detection ─────────────────────────────────────────────────────
// Inspect the workspace and figure out which stages can be skipped because
// their artifacts are already on disk from a previous (possibly aborted)
// run. Conservative: a stage is only skipped when its *primary* artifact
// is present and well-formed. Anything ambiguous re-runs.

interface ResumeReport {
  /** Free-form "stage we resumed from" string for the progress toast. */
  resumedFrom: string | null;
  foundArtifacts: string[];
  /** When set, explains why we're NOT resuming despite finding artifacts —
   *  e.g. the workspace's script.json is from a different videoType, so
   *  every downstream artifact is stale and gets regenerated. */
  invalidationNote: string | null;
  skipReadSource: boolean;
  skipDraftScript: boolean;
  skipNarration: boolean;
  skipCompose: boolean;
}

async function detectResume(args: {
  scriptPath: string;
  designPath: string;
  briefPath: string;
  projectWorkspacePath: string;
  formats: string[];
  /** Current run's videoType — compared against the stored script's videoType
   *  to decide whether the on-disk script (and everything derived from it)
   *  is still valid. */
  videoType: string;
}): Promise<ResumeReport> {
  const found: string[] = [];
  let invalidationNote: string | null = null;

  const hasScript = await isReadableFile(args.scriptPath);
  const hasDesign = await isReadableFile(args.designPath);
  const hasBrief = await isReadableFile(args.briefPath);
  if (hasDesign) found.push("DESIGN.md");
  if (hasBrief) found.push("source-brief.md");

  // Stage 1 (read source) lays down DESIGN.md + source-brief.md. Brief and
  // design are video-type-agnostic so they can be reused across different
  // video types of the same project.
  const skipReadSource = hasDesign && hasBrief;

  // Stage 3 (draft script): the script is only reusable if its videoType
  // matches the current run's videoType. Otherwise scene IDs and counts
  // differ and every downstream artifact (narration, compositions) is stale.
  let skipDraftScript = false;
  let scriptScenes: ScriptScene[] = [];
  if (hasScript) {
    const preview = await readScriptPreview(args.scriptPath);
    if (preview && Array.isArray(preview.scenes) && preview.scenes.length > 0) {
      const storedVideoType = (() => {
        try {
          const parsed = JSON.parse(preview.raw ?? "{}") as { videoType?: string };
          return parsed.videoType ?? null;
        } catch {
          return null;
        }
      })();

      if (storedVideoType && storedVideoType === args.videoType) {
        skipDraftScript = true;
        scriptScenes = preview.scenes;
        found.push("script.json");
      } else if (storedVideoType && storedVideoType !== args.videoType) {
        invalidationNote = `Workspace has script.json for videoType "${storedVideoType}" but you asked for "${args.videoType}" — regenerating script + narration + compositions from scratch`;
      } else {
        // No videoType stored; assume the script predates the field. Trust
        // the scene structure and skip the draft.
        skipDraftScript = true;
        scriptScenes = preview.scenes;
        found.push("script.json");
      }
    }
  }

  // Stage 4 (narration) writes WAVs into <workspace>/narration/. Only valid
  // when the script is also valid (cascade): if we're going to re-draft the
  // script the new scene IDs probably won't match the cached WAVs anyway.
  let skipNarration = false;
  if (skipDraftScript && scriptScenes.length > 0) {
    const narrationDir = join(args.projectWorkspacePath, "narration");
    const wavs = await listFiles(narrationDir);
    const sceneIdsCovered = scriptScenes.every((s) =>
      wavs.some((f) => f.startsWith(s.id) && f.endsWith(".wav"))
    );
    skipNarration = sceneIdsCovered && wavs.length > 0;
    if (skipNarration) {
      const matching = wavs.filter((f) =>
        scriptScenes.some((s) => f.startsWith(s.id))
      );
      found.push(`${matching.length}/${scriptScenes.length} narration WAVs`);
    }
  }

  // Stage 5 (compose): only valid when narration is also valid (cascade).
  // Otherwise the compositions reference audio files whose IDs don't match
  // the current script — exactly the broken-preview scenario.
  let skipCompose = false;
  if (skipNarration) {
    const aspects = aspectsFromFormats(args.formats);
    const compositionsExist = await Promise.all(
      aspects.map((aspect) =>
        isReadableFile(join(args.projectWorkspacePath, aspect, "index.html"))
      )
    );
    skipCompose = compositionsExist.length > 0 && compositionsExist.every(Boolean);
    if (skipCompose) found.push(`${aspects.length} compositions`);
  }

  // Free-form "where we picked up" label for the toast.
  let resumedFrom: string | null = null;
  if (skipCompose) resumedFrom = "compose-approval";
  else if (skipNarration) resumedFrom = "compose";
  else if (skipDraftScript) resumedFrom = "narration";
  else if (skipReadSource) resumedFrom = "draft-script";

  return {
    resumedFrom,
    foundArtifacts: found,
    invalidationNote,
    skipReadSource,
    skipDraftScript,
    skipNarration,
    skipCompose,
  };
}

// ─── Stage failure recovery ────────────────────────────────────────────────
// Wrap any stage runner in a review-then-ask loop. When the runner throws,
// we feed the error back to Claude (with sandbox access to the workspace) so
// the agent can diagnose and write the user a short markdown review. Then
// we ask the user via askUser whether to retry. This is the difference
// between "the build crashed, ¯\_(ツ)_/¯" and "kokoro-onnx isn't installed
// — run `pip install kokoro-onnx soundfile` then click retry".
//
// The runner itself is responsible for being idempotent on retry. The TTS
// runner is — it caches by sha256 hash, so a retry only re-spawns subprocess
// calls for the scenes that didn't write a hash on the previous attempt.

interface StageRecoveryOpts {
  stageName: string;
  systemPrompt: string;
  cwd: string;
  env: Record<string, string>;
  model?: string;
  askUser: GenerateVideoOptions["askUser"];
  /** Cap on review-and-retry rounds. Default 3. After that we propagate. */
  maxAttempts?: number;
}

async function withReviewAndRetry<T>(
  runner: () => Promise<T>,
  opts: StageRecoveryOpts
): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await runner();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (attempt >= max) {
        // Out of retries — propagate so the caller can emit a clean
        // result with status: needs_input. Don't blow up the process.
        throw err;
      }

      emit({
        type: "progress",
        phase: "reviewing_failure",
        message: `${opts.stageName} failed (attempt ${attempt}/${max}) — agent is reviewing`,
      });

      // Step 1: hand the failure to Claude for a diagnostic review. The
      // agent has Bash + Read access to inspect the environment, but is
      // explicitly told NOT to try fixing things itself — that's the
      // user's call once they see the review.
      try {
        await runAgent({
          prompt: stageReviewPrompt({
            stageName: opts.stageName,
            attempt,
            maxAttempts: max,
            errorMessage: errMsg,
          }),
          systemPrompt: opts.systemPrompt,
          cwd: opts.cwd,
          env: opts.env,
          model: opts.model,
        });
      } catch (reviewErr) {
        // The review itself blew up — emit a fallback explanation so the
        // user isn't left staring at a bare stack trace.
        const reviewMsg =
          reviewErr instanceof Error ? reviewErr.message : String(reviewErr);
        emit({
          type: "agent_text",
          messageId: `recovery-fallback-${Date.now()}`,
          text: [
            `**${opts.stageName} failed** — and the recovery review couldn't run either.`,
            ``,
            `Original error:`,
            "```",
            errMsg,
            "```",
            ``,
            `Review error: ${reviewMsg}`,
            ``,
            `Fix the underlying issue and click retry, or cancel and start fresh.`,
          ].join("\n"),
        });
      }

      // Step 2: pause and ask the user what to do next. The InlineApproval
      // surfaces "retry" / "cancel" as buttons; free-text revision notes
      // aren't meaningful here so we don't accept them.
      const response = await opts.askUser(
        `${opts.stageName} failed — see review above. Retry, or cancel?`,
        ["retry", "cancel"],
        {
          kind: "stage-failure",
          stage: opts.stageName,
          attempt,
          maxAttempts: max,
          error: errMsg,
        }
      );

      const trimmed = response.trim().toLowerCase();
      if (trimmed !== "retry") {
        // User picked cancel (or sent free text we don't support here).
        // Throw so the caller can emit a clean needs_input result.
        throw err;
      }
      // else fall through to next loop iteration — runner runs again.
    }
  }
  // Unreachable — the loop either returns or throws.
  throw new Error(`withReviewAndRetry: exhausted ${max} attempts for ${opts.stageName}`);
}

function stageReviewPrompt(args: {
  stageName: string;
  attempt: number;
  maxAttempts: number;
  errorMessage: string;
}): string {
  // Detect failure shapes that benefit from a targeted diagnostic playbook.
  // Today only one — Python module-not-found — but the structure makes it
  // easy to add more (Node module, ffmpeg-not-on-path, claude-cli-not-found).
  const isPythonModuleError =
    /package is not installed|ModuleNotFoundError|No module named|kokoro[-_]onnx/i.test(
      args.errorMessage
    );

  const pythonPlaybook = isPythonModuleError
    ? [
        ``,
        `--- PYTHON MODULE-NOT-FOUND PLAYBOOK ---`,
        ``,
        `This is the canonical Windows trap: the user has the package installed in one`,
        `Python interpreter, but the runtime is invoking a different one. Run THESE`,
        `diagnostics in this exact order before writing the review:`,
        ``,
        `1. \`where.exe python\`  (Linux/macOS: \`which -a python\`) — list every python on PATH.`,
        `2. \`where.exe python3\` and \`where.exe py\` — list alternative launchers.`,
        `3. \`python -c "import sys; print(sys.executable, sys.version)"\` — pin which python the bare \`python\` invocation lands on.`,
        `4. \`python -m pip show <missing-module>\` — does that python see the module?`,
        `5. If step 4 says "not found", try the OTHER pythons from steps 1-2 with their full paths: \`<full-path-to-other-python> -m pip show <missing-module>\`.`,
        ``,
        `Identify the mismatch in your review. If found, structure the "What to do" section like this:`,
        ``,
        `> The runtime is invoking \`<path-A>\` (Python <version-A>).`,
        `> The module is installed in \`<path-B>\`'s site-packages (Python <version-B>).`,
        `>`,
        `> Pick one fix:`,
        `> 1. **Best (persistent)**: Settings → Advanced → Python interpreter → pick \`<path-B>\`. Video Studio will pin it across runs.`,
        `> 2. **One-off**: install into the runtime's Python via \`<path-A> -m pip install <module>\`.`,
        `> 3. **Shell-level**: reorder PATH so \`<path-B>\`'s directory wins, then relaunch \`pnpm dev\` from that shell.`,
        ``,
        `Hard rules specific to this playbook:`,
        `- Watch for the Microsoft Store python3 stub at \`%LOCALAPPDATA%\\Microsoft\\WindowsApps\\python3.exe\` — it routes to the Store and has zero packages. Call it out by name if you find it.`,
        `- Don't run \`pip install\` yourself. Tell the user the exact command, let them run it.`,
        ``,
      ].join("\n")
    : "";

  return [
    `STAGE FAILED: ${args.stageName}`,
    `attempt ${args.attempt}/${args.maxAttempts}`,
    ``,
    `Error:`,
    "```",
    args.errorMessage,
    "```",
    pythonPlaybook,
    `Your job: write a short, useful review of this failure for the user. Format as markdown, under 200 words.`,
    ``,
    `Structure:`,
    `- **What happened** — one sentence, plain English (don't restate the error verbatim).`,
    `- **Why** — root cause if you can identify one. Use Bash to check the environment (which X, X --version, pip show, etc) when it'd help diagnose. The playbook above (if present) tells you exactly which checks to run.`,
    `- **What to do** — 1-3 concrete steps the user can run to fix it. Give exact commands or exact Settings paths.`,
    ``,
    `Hard rules:`,
    `- Don't try to fix it yourself — no installing packages, no editing files, no re-running the failed step. The user wants a review, not a rescue.`,
    `- Don't apologise.`,
    `- Don't ask the user a question — the runner handles the next step (retry / cancel) on its own.`,
    `- Bash usage: minimal but DO run the playbook diagnostics if one applies. The user is staring at an error; specifics beat speculation.`,
    ``,
    `When the review is written, stop. The runner will pause the pipeline and let the user decide.`,
  ].join("\n");
}

async function isReadableFile(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

// ─── Approval persistence ─────────────────────────────────────────────────
// Stash the hashes of artifacts the user has already approved so a follow-up
// run doesn't re-prompt them when nothing relevant has changed. Lives at
// <workspace>/.approval.json. Both fields are nullable so each gate can
// invalidate independently — revising the script clears scriptHash;
// revising compositions clears composeHash.

interface ApprovalState {
  scriptHash?: string | null;
  scriptApprovedAt?: number | null;
  composeHash?: string | null;
  composeApprovedAt?: number | null;
}

async function readApprovalState(path: string): Promise<ApprovalState | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ApprovalState;
    return parsed;
  } catch {
    return null;
  }
}

async function writeApprovalState(path: string, state: ApprovalState): Promise<void> {
  try {
    await fs.writeFile(path, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Approval persistence is best-effort — we don't want a failure here
    // to derail the run. Worst case the user gets re-prompted.
  }
}

async function clearApprovalState(path: string): Promise<void> {
  try {
    await fs.unlink(path);
  } catch {
    // ENOENT or anything else — fine, nothing to clear.
  }
}

async function hashFileIfExists(path: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(path);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Hash every composition's index.html in deterministic order so a single
 * string represents the composition set. Returns null if any expected
 * file is missing — null mismatches whatever's stored, which forces the
 * approval gate to re-prompt.
 */
async function hashCompositionsIfExist(
  compositions: Array<{ aspect: string; indexHtml: string }>
): Promise<string | null> {
  const sorted = [...compositions].sort((a, b) => a.aspect.localeCompare(b.aspect));
  const h = createHash("sha256");
  for (const comp of sorted) {
    try {
      const buf = await fs.readFile(comp.indexHtml);
      h.update(comp.aspect);
      h.update("\n");
      h.update(buf);
      h.update("\n---\n");
    } catch {
      return null;
    }
  }
  return h.digest("hex");
}

// ─── Direct narration runner ──────────────────────────────────────────────
// Replaces the old runAgent-driven Stage 4. Reads script.json, spawns
// `npx hyperframes tts` per scene, streams every line of subprocess
// output as an agent_log event so the user sees real progress. Caches by
// sha256(voice+text) so a re-run only regenerates scenes whose narration
// actually changed.

interface ScriptScene {
  id: string;
  narration: string;
  durationSec?: number;
}

async function runNarrationDirect(opts: {
  scriptPath: string;
  workspacePath: string;
  ttsVoice: string;
}): Promise<void> {
  const raw = await fs.readFile(opts.scriptPath, "utf8");
  const script = JSON.parse(raw) as { scenes?: ScriptScene[] };
  const scenes = script.scenes ?? [];
  if (scenes.length === 0) {
    throw new Error("script.json has no scenes — cannot run narration");
  }

  const narrationDir = join(opts.workspacePath, "narration");
  await fs.mkdir(narrationDir, { recursive: true });

  const manifest: Array<{
    id: string;
    narrationPath: string;
    durationSec: number;
    cached: boolean;
  }> = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene.id || !scene.narration) {
      emit({
        type: "agent_log",
        level: "tts-skip",
        text: `scene ${i + 1} missing id or narration — skipped`,
      });
      continue;
    }

    const wavPath = join(narrationDir, `${scene.id}.wav`);
    const hashPath = `${wavPath}.hash`;
    const expectedHash = createHash("sha256")
      .update(`${opts.ttsVoice}\n${scene.narration}`)
      .digest("hex");

    let cached = false;
    try {
      const existing = await fs.readFile(hashPath, "utf8");
      if (existing.trim() === expectedHash) cached = true;
    } catch {
      // no cache — we'll generate fresh
    }

    const sceneProgress = 0.45 + 0.18 * (i / scenes.length);
    emit({
      type: "progress",
      phase: "narration",
      message: `scene ${i + 1}/${scenes.length}: ${scene.id} (${cached ? "cached" : "generating"})`,
      progress: sceneProgress,
    });

    if (!cached) {
      await runTtsCommand({
        text: scene.narration,
        voice: opts.ttsVoice,
        outputPath: wavPath,
        sceneId: scene.id,
      });
      await fs.writeFile(hashPath, expectedHash, "utf8");
    } else {
      emit({
        type: "agent_log",
        level: "tts",
        text: `[${scene.id}] reusing cached WAV (hash match)`,
      });
    }

    manifest.push({
      id: scene.id,
      narrationPath: wavPath,
      // We trust the script's durationSec for now — measuring with ffprobe
      // would add a second subprocess hop per scene for negligible UX win.
      durationSec: scene.durationSec ?? 0,
      cached,
    });
  }

  const manifestPath = join(opts.workspacePath, "manifest.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ scenes: manifest }, null, 2),
    "utf8"
  );
  const generatedCount = manifest.filter((m) => !m.cached).length;
  const cachedCount = manifest.filter((m) => m.cached).length;
  emit({
    type: "progress",
    phase: "narration",
    message: `narration done — ${generatedCount} generated, ${cachedCount} cached, manifest written`,
    progress: 0.63,
  });
}

function runTtsCommand(args: {
  text: string;
  voice: string;
  outputPath: string;
  sceneId: string;
}): Promise<void> {
  return new Promise((resolveCmd, rejectCmd) => {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const proc = spawn(
      npx,
      [
        "hyperframes",
        "tts",
        args.text,
        "--voice",
        args.voice,
        "--output",
        args.outputPath,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        // npx.cmd on Windows wants a shell to resolve PATH correctly; explicit
        // shell flag avoids the spawn EINVAL we otherwise hit on Node 22.
        shell: process.platform === "win32",
      }
    );

    let stderrBuf = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const line of cleanProgressLines(text)) {
        emit({ type: "agent_log", level: "tts", text: `[${args.sceneId}] ${line}` });
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrBuf += text;
      for (const line of cleanProgressLines(text)) {
        emit({ type: "agent_log", level: "tts-err", text: `[${args.sceneId}] ${line}` });
      }
    });

    proc.on("error", (err) => {
      rejectCmd(
        new Error(`failed to spawn hyperframes tts for ${args.sceneId}: ${err.message}`)
      );
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        emit({
          type: "agent_log",
          level: "tts",
          text: `[${args.sceneId}] wrote ${args.outputPath}`,
        });
        resolveCmd();
      } else {
        const tail = stderrBuf
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(-3)
          .join("\n");
        rejectCmd(
          new Error(
            `hyperframes tts exited with code ${code} for ${args.sceneId}${tail ? `\n${tail}` : ""}`
          )
        );
      }
    });
  });
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
