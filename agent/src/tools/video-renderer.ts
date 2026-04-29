import { join } from "node:path";
import { promises as fs } from "node:fs";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { nextToolCallId } from "./types.js";
import { runAgent } from "../claude.js";
import { stageSixPrompt, aspectFor } from "./prompts.js";

/**
 * Run the HyperFrames render → ffmpeg-transcode pipeline for each
 * requested format. The agent invokes the CLI per format; the prompt
 * (stageSixPrompt) bakes in the Chromium-safe ffmpeg post-process so
 * the resulting MP4 plays inline in the renderer.
 *
 * No approval gate. Errors per-format don't abort the run — the prompt
 * tells the agent to continue with remaining formats.
 */
export interface VideoRendererInput {
  formats: string[];
}

export interface VideoRendererOutput {
  renders: Array<{ format: string; mp4Path: string }>;
}

export const videoRenderer: Tool<VideoRendererInput, VideoRendererOutput> = {
  name: "video.render",

  async isCached(ctx, input) {
    const paths = expectedRenderPaths(ctx, input.formats);
    for (const p of paths) {
      try {
        await fs.access(p.mp4Path);
      } catch {
        return { hit: false };
      }
    }
    return { hit: true };
  },

  async run(ctx, input) {
    const toolCallId = nextToolCallId();
    ctx.emit({ type: "tool_started", name: this.name, toolCallId, input });

    const prompt = stageSixPrompt({
      formats: input.formats,
      projectWorkspacePath: ctx.workspaceDir,
    });

    try {
      ctx.emit({ type: "activity", state: "rendering" });
      await runAgent({
        prompt,
        systemPrompt: ctx.systemPrompt,
        cwd: ctx.workspaceDir,
        env: makeRunEnv(ctx),
        model: ctx.model,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : `render failed`;
      ctx.emit({
        type: "tool_finished",
        name: this.name,
        toolCallId,
        status: "error",
        message,
      });
      return { status: "error", message } satisfies ToolResult<VideoRendererOutput>;
    }

    // Probe which output paths actually landed (the prompt asks the agent
    // to skip-and-continue on per-format failures, so not every requested
    // format necessarily produced a file).
    const expected = expectedRenderPaths(ctx, input.formats);
    const landed: VideoRendererOutput["renders"] = [];
    for (const p of expected) {
      try {
        await fs.access(p.mp4Path);
        landed.push(p);
      } catch {
        // missing — skip
      }
    }

    ctx.emit({ type: "tool_finished", name: this.name, toolCallId, status: "ok" });
    return {
      status: "ok",
      output: { renders: landed },
      artifacts: landed.map((r) => r.mp4Path),
    };
  },
};

function expectedRenderPaths(
  ctx: ToolContext,
  formats: string[]
): Array<{ format: string; mp4Path: string }> {
  const outputBase = process.env.OUTPUT_DIRECTORY ?? join(ctx.workspaceDir, "output");
  return formats.map((format) => ({
    format,
    mp4Path: join(outputBase, `${format}.mp4`),
  }));
}

function makeRunEnv(ctx: ToolContext): Record<string, string> {
  // aspectFor isn't directly used here but the agent calls hyperframes
  // render from <workspaceDir>/<aspect>/ so it needs to be resolvable
  // by the prompt — keep imported for readability + future moves.
  void aspectFor;
  return {
    ORG_PROJECTS_PATH: ctx.orgRoot,
    WORKSPACE_PATH: ctx.workspaceDir,
    TTS_VOICE: ctx.ttsVoice,
    RENDER_QUALITY: process.env.RENDER_QUALITY ?? "standard",
    RENDER_FPS: String(process.env.RENDER_FPS ?? 30),
    ...(process.env.OUTPUT_DIRECTORY
      ? { OUTPUT_DIRECTORY: process.env.OUTPUT_DIRECTORY }
      : {}),
  };
}
