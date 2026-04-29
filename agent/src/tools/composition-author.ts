import { join } from "node:path";
import { promises as fs } from "node:fs";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { nextToolCallId } from "./types.js";
import { runAgent } from "../claude.js";
import {
  stageFivePrompt,
  reviseCompositionPrompt,
  aspectsFromFormats,
} from "./prompts.js";
import { hashCompositionsIfExist } from "./approval-cache.js";

/**
 * Author HyperFrames composition(s) for the requested formats. One
 * `<aspect>/index.html` per unique aspect ratio (1080x1080,
 * 1920x1080, 1080x1920). Wraps a focused `stageFivePrompt` run.
 *
 * If `revisionNotes` is provided, calls `reviseCompositionPrompt`
 * instead — the agent edits existing index.html files in place rather
 * than scaffolding fresh.
 */
export interface CompositionAuthorInput {
  videoType: string;
  formats: string[];
  revisionNotes?: string;
  revision?: number;
}

export interface CompositionAuthorOutput {
  compositions: Array<{ aspect: string; htmlPath: string }>;
  composeHash: string | null;
}

export const compositionAuthor: Tool<CompositionAuthorInput, CompositionAuthorOutput> = {
  name: "composition.author",

  async isCached(ctx, input) {
    const compositions = await listCompositions(ctx, input.formats);
    if (compositions.length === 0) return { hit: false };
    const hash = await hashCompositionsIfExist(compositions);
    return { hit: hash !== null, hash: hash ?? undefined };
  },

  async run(ctx, input) {
    const toolCallId = nextToolCallId();
    ctx.emit({ type: "tool_started", name: this.name, toolCallId, input });

    const scriptPath = join(ctx.workspaceDir, "script.json");
    const isRevision = !!input.revisionNotes;
    const compositions = await listCompositions(ctx, input.formats);

    const prompt = isRevision
      ? reviseCompositionPrompt({
          projectId: ctx.projectId,
          compositions,
          notes: input.revisionNotes ?? "",
          revision: input.revision ?? 1,
        })
      : stageFivePrompt({
          projectId: ctx.projectId,
          videoType: input.videoType,
          formats: input.formats,
          projectWorkspacePath: ctx.workspaceDir,
          scriptPath,
        });

    try {
      ctx.emit({ type: "activity", state: "composing" });
      await runAgent({
        prompt,
        systemPrompt: ctx.systemPrompt,
        cwd: ctx.workspaceDir,
        env: makeRunEnv(ctx),
        model: ctx.model,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : `composition authoring failed`;
      ctx.emit({
        type: "tool_finished",
        name: this.name,
        toolCallId,
        status: "error",
        message,
      });
      return { status: "error", message } satisfies ToolResult<CompositionAuthorOutput>;
    }

    const finalCompositions = await listCompositions(ctx, input.formats);
    const composeHash = await hashCompositionsIfExist(finalCompositions);

    ctx.emit({ type: "tool_finished", name: this.name, toolCallId, status: "ok" });
    return {
      status: "ok",
      output: {
        compositions: finalCompositions.map((c) => ({ aspect: c.aspect, htmlPath: c.indexHtml })),
        composeHash,
      },
      artifacts: finalCompositions.map((c) => c.indexHtml),
      cacheHash: composeHash ?? undefined,
    };
  },
};

async function listCompositions(
  ctx: ToolContext,
  formats: string[]
): Promise<Array<{ aspect: string; path: string; indexHtml: string }>> {
  const aspects = aspectsFromFormats(formats);
  const out: Array<{ aspect: string; path: string; indexHtml: string }> = [];
  for (const aspect of aspects) {
    const path = join(ctx.workspaceDir, aspect);
    const indexHtml = join(path, "index.html");
    try {
      await fs.access(indexHtml);
      out.push({ aspect, path, indexHtml });
    } catch {
      // skip — composition for this aspect doesn't exist yet
    }
  }
  return out;
}

function makeRunEnv(ctx: ToolContext): Record<string, string> {
  return {
    ORG_PROJECTS_PATH: ctx.orgRoot,
    WORKSPACE_PATH: ctx.workspaceDir,
    TTS_VOICE: ctx.ttsVoice,
  };
}
