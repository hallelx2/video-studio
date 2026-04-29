import { resolve, join } from "node:path";
import { promises as fs, mkdirSync } from "node:fs";
import { runAgent } from "../claude.js";
import { emit, emitActivity } from "../index.js";
import type { ToolContext } from "../tools/types.js";
import { resumeDetector } from "../tools/resume-detector.js";
import { scriptDrafter } from "../tools/script-drafter.js";
import { narrationGenerator } from "../tools/narration-generator.js";
import { compositionAuthor } from "../tools/composition-author.js";
import { videoRenderer } from "../tools/video-renderer.js";
import { stageOnePrompt, videoTypeMetaFor } from "../tools/prompts.js";
import { withReviewAndRetry } from "../tools/review-retry.js";
import {
  readApprovalState,
  writeApprovalState,
  hashFileIfExists,
  hashCompositionsIfExist,
} from "../tools/approval-cache.js";

/**
 * Macro orchestrator that runs the full six-stage pipeline by composing
 * the standalone tools. ~150 lines of glue replacing ~1700 lines of
 * monolithic logic in generate-video.ts.
 *
 * Sequence:
 *   1. ResumeDetector (cheap read of workspace state)
 *   2. Stage 1+2 — agent reads source + resolves DESIGN.md
 *   3. ScriptDrafter (skipped when script.json already exists)
 *   4. NarrationGenerator (per-scene cache hits skip work)
 *   5. CompositionAuthor (per-format)
 *   6. VideoRenderer (per-format)
 *
 * Each tool emits its own tool_started/tool_finished + activity events
 * through the existing stdout NDJSON channel — the renderer's existing
 * subscriptions surface them without changes.
 *
 * Macro emits a final `result` event with status mirroring the last
 * step's outcome so the renderer's terminal-state reducer transitions
 * out of "running".
 */
export interface FullPipelineOptions {
  projectId: string;
  sessionId?: string;
  videoType: string;
  formats: string[];
  brief: string;
  systemPrompt: string;
  model?: string;
  persona?: string;
  ttsVoice?: string;
  /** Approval gate handler. Required for production runs — without it,
   *  approval-bearing stages (script, composition) auto-approve, which
   *  is fine for headless / scripted invocations but skips the review
   *  loop the human flow expects. */
  askUser?: (
    question: string,
    options: string[],
    payload?: Record<string, unknown>
  ) => Promise<string>;
}

export async function runFullPipeline(opts: FullPipelineOptions): Promise<void> {
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
  const sessionSegment = (opts.sessionId ?? "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const workspaceDir = sessionSegment
    ? join(workspaceRoot, opts.projectId, sessionSegment)
    : join(workspaceRoot, opts.projectId);

  mkdirSync(workspaceDir, { recursive: true });

  const ctx: ToolContext = {
    projectId: opts.projectId,
    sessionId: opts.sessionId ?? "",
    workspaceDir,
    orgRoot,
    systemPrompt: opts.systemPrompt,
    model: opts.model,
    persona: opts.persona,
    ttsVoice: opts.ttsVoice ?? process.env.TTS_VOICE ?? "af_nova",
    emit,
    askUser: opts.askUser,
  };

  const approvalPath = join(workspaceDir, ".approval.json");
  const stageEnv: Record<string, string> = {
    ORG_PROJECTS_PATH: orgRoot,
    WORKSPACE_PATH: workspaceRoot,
    TTS_VOICE: ctx.ttsVoice,
  };

  // 1. Resume detection — informational; we don't act on the report
  //    directly, but emit it so the renderer can surface it.
  const resume = await resumeDetector.run(ctx, {});
  emit({
    type: "progress",
    phase: "reading_source",
    message: resume.output?.hasScript
      ? "Found existing script + artifacts — resuming where possible."
      : "Fresh workspace — starting from the top.",
    progress: 0.05,
  });

  // 2. Stage 1+2: read source. Skipped if DESIGN.md + source-brief.md exist.
  const designExists = await pathExists(join(workspaceDir, "DESIGN.md"));
  const briefExists = await pathExists(join(workspaceDir, "source-brief.md"));
  if (!(designExists && briefExists)) {
    emitActivity("reading", { force: true });
    const projectSourcePath = join(orgRoot, opts.projectId);
    await runAgent({
      prompt: stageOnePrompt({
        projectId: opts.projectId,
        videoType: opts.videoType,
        brief: opts.brief,
        meta: videoTypeMetaFor(opts.videoType),
        projectSourcePath,
        projectWorkspacePath: workspaceDir,
        orgRoot,
      }),
      systemPrompt: opts.systemPrompt,
      cwd: workspaceDir,
      env: {
        ORG_PROJECTS_PATH: orgRoot,
        WORKSPACE_PATH: workspaceRoot,
        TTS_VOICE: ctx.ttsVoice,
      },
      model: opts.model,
    });
  }

  // 3. ScriptDrafter + approval gate. The script.json hash gates the
  //    skip — re-running with an identical previously-approved script
  //    auto-approves and moves on. Up to 5 user-driven revisions before
  //    we surface a needs_input result.
  const scriptPath = join(workspaceDir, "script.json");
  let scriptApproved = await isScriptAlreadyApproved(approvalPath, scriptPath, opts.videoType);
  let revision = 0;
  while (!scriptApproved && revision < 5) {
    if (revision === 0 && !(await pathExists(scriptPath))) {
      const draftResult = await scriptDrafter.run(ctx, {
        videoType: opts.videoType,
        brief: opts.brief,
      });
      if (draftResult.status !== "ok") {
        emit({
          type: "result",
          status: "failed",
          message: draftResult.message ?? "Script draft failed",
        });
        return;
      }
    }

    if (!opts.askUser) {
      // Headless invocation — skip approval, treat as approved.
      scriptApproved = true;
      break;
    }

    const response = await opts.askUser(
      `Approve the ${opts.videoType} script for ${opts.projectId}?`,
      ["approve", "revise", "cancel"],
      { kind: "script-approval", revision }
    );
    const intent = classifyResponse(response);
    if (intent === "cancel") {
      emit({ type: "result", status: "needs_input", message: "Cancelled at script approval." });
      return;
    }
    if (intent === "approve") {
      scriptApproved = true;
      const fresh = await hashFileIfExists(scriptPath);
      await writeApprovalState(approvalPath, {
        videoType: opts.videoType,
        scriptHash: fresh,
        scriptApprovedAt: Date.now(),
      });
      break;
    }

    // Revision — call the script tool again with the user's notes.
    revision += 1;
    const reviseResult = await scriptDrafter.run(ctx, {
      videoType: opts.videoType,
      brief: opts.brief,
      revisionNotes: response.trim(),
      revision,
    });
    if (reviseResult.status !== "ok") {
      emit({
        type: "result",
        status: "failed",
        message: reviseResult.message ?? "Script revision failed",
      });
      return;
    }
  }
  if (!scriptApproved) {
    emit({
      type: "result",
      status: "needs_input",
      message: "Maximum script revisions reached without approval.",
    });
    return;
  }

  // 4. NarrationGenerator wrapped in withReviewAndRetry — typical
  //    failure modes (kokoro-onnx missing, ffmpeg missing) get reviewed
  //    by the agent and the user gets a retry/cancel gate instead of
  //    a fatal blowout.
  try {
    if (opts.askUser) {
      await withReviewAndRetry(
        async () => {
          const r = await narrationGenerator.run(ctx, {});
          if (r.status === "error") throw new Error(r.message ?? "narration failed");
          return r;
        },
        {
          stageName: "narration",
          systemPrompt: opts.systemPrompt,
          cwd: workspaceDir,
          env: stageEnv,
          model: opts.model,
          askUser: opts.askUser,
        }
      );
    } else {
      const r = await narrationGenerator.run(ctx, {});
      if (r.status === "error") throw new Error(r.message ?? "narration failed");
    }
  } catch (err) {
    emit({
      type: "result",
      status: "needs_input",
      message: `Narration paused — ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  // 5. CompositionAuthor + approval gate. composeHash mirrors the script
  //    pattern; up to 5 revisions before we surface needs_input.
  let composeApproved = await isComposeAlreadyApproved(
    approvalPath,
    workspaceDir,
    opts.formats
  );
  let composeRevision = 0;
  while (!composeApproved && composeRevision < 5) {
    if (composeRevision === 0) {
      const composeResult = await compositionAuthor.run(ctx, {
        videoType: opts.videoType,
        formats: opts.formats,
      });
      if (composeResult.status === "error") {
        emit({
          type: "result",
          status: "failed",
          message: composeResult.message ?? "Composition authoring failed",
        });
        return;
      }
    }

    if (!opts.askUser) {
      composeApproved = true;
      break;
    }

    const response = await opts.askUser(
      `Composition is ready. Render now, or preview first?`,
      ["render", "revise", "cancel"],
      { kind: "compose-approval", revision: composeRevision }
    );
    const intent = classifyComposeResponse(response);
    if (intent === "cancel") {
      emit({
        type: "result",
        status: "needs_input",
        message: "Cancelled at composition approval.",
      });
      return;
    }
    if (intent === "render") {
      composeApproved = true;
      const fresh = await hashCompositionsForFormats(workspaceDir, opts.formats);
      const previous = (await readApprovalState(approvalPath)) ?? {};
      await writeApprovalState(approvalPath, {
        ...previous,
        composeHash: fresh,
        composeApprovedAt: Date.now(),
      });
      break;
    }

    composeRevision += 1;
    const reviseResult = await compositionAuthor.run(ctx, {
      videoType: opts.videoType,
      formats: opts.formats,
      revisionNotes: response.trim(),
      revision: composeRevision,
    });
    if (reviseResult.status === "error") {
      emit({
        type: "result",
        status: "failed",
        message: reviseResult.message ?? "Composition revision failed",
      });
      return;
    }
  }
  if (!composeApproved) {
    emit({
      type: "result",
      status: "needs_input",
      message: "Maximum composition revisions reached without approval.",
    });
    return;
  }

  // 6. VideoRenderer — per-format. Renders skip if MP4 already exists.
  const renderResult = await videoRenderer.run(ctx, { formats: opts.formats });
  if (renderResult.status === "error") {
    emit({
      type: "result",
      status: "failed",
      message: renderResult.message ?? "Render failed",
    });
    return;
  }

  // Synthesize a final terminal result so the renderer knows the macro
  // run completed. Include the rendered MP4 paths so the RenderStrip
  // populates without waiting for re-derivation from artifacts.
  emit({
    type: "result",
    status: "success",
    message: "Pipeline complete.",
    artifacts: {
      outputs: (renderResult.output?.renders ?? []).map((r) => ({
        format: r.format,
        path: r.mp4Path,
      })),
    },
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function isScriptAlreadyApproved(
  approvalPath: string,
  scriptPath: string,
  videoType: string
): Promise<boolean> {
  const previous = await readApprovalState(approvalPath);
  if (!previous?.scriptHash) return false;
  const currentHash = await hashFileIfExists(scriptPath);
  if (!currentHash || currentHash !== previous.scriptHash) return false;
  if (previous.videoType != null && previous.videoType !== videoType) return false;
  return true;
}

async function isComposeAlreadyApproved(
  approvalPath: string,
  workspaceDir: string,
  formats: string[]
): Promise<boolean> {
  const previous = await readApprovalState(approvalPath);
  if (!previous?.composeHash) return false;
  const currentHash = await hashCompositionsForFormats(workspaceDir, formats);
  return currentHash != null && currentHash === previous.composeHash;
}

async function hashCompositionsForFormats(
  workspaceDir: string,
  formats: string[]
): Promise<string | null> {
  // Resolve aspects from formats and feed to the shared hasher. Shape
  // matches what hashCompositionsIfExist expects.
  const seen = new Set<string>();
  const compositions: Array<{ aspect: string; indexHtml: string }> = [];
  for (const f of formats) {
    const aspect =
      f === "linkedin" ? "1080x1080" : f === "youtube-short" ? "1080x1920" : "1920x1080";
    if (seen.has(aspect)) continue;
    seen.add(aspect);
    compositions.push({ aspect, indexHtml: join(workspaceDir, aspect, "index.html") });
  }
  return hashCompositionsIfExist(compositions);
}

function classifyResponse(raw: string): "approve" | "revise" | "cancel" {
  const t = raw.trim().toLowerCase();
  if (t === "approve" || t === "ok" || t === "yes" || t === "ship it") return "approve";
  if (t === "cancel" || t === "abort" || t === "stop" || t === "no") return "cancel";
  return "revise";
}

function classifyComposeResponse(raw: string): "render" | "revise" | "cancel" {
  const t = raw.trim().toLowerCase();
  if (t === "render" || t === "ok" || t === "yes" || t === "go") return "render";
  if (t === "cancel" || t === "abort" || t === "stop" || t === "no") return "cancel";
  return "revise";
}
