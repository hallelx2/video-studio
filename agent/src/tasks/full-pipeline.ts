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

  // 3. ScriptDrafter — only when script.json doesn't already exist.
  const scriptPath = join(workspaceDir, "script.json");
  const haveScript = await pathExists(scriptPath);
  if (!haveScript) {
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

  // 4. NarrationGenerator — full pass; cache hits skip per-scene work.
  const narrationResult = await narrationGenerator.run(ctx, {});
  if (narrationResult.status === "error") {
    emit({
      type: "result",
      status: "failed",
      message: narrationResult.message ?? "Narration failed",
    });
    return;
  }

  // 5. CompositionAuthor — per-format. Cache via composeHash.
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
