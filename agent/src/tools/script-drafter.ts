import { join } from "node:path";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { nextToolCallId } from "./types.js";
import { runAgent } from "../claude.js";
import { stageThreePrompt, reviseScriptPrompt, videoTypeMetaFor } from "./prompts.js";
import { hashFileIfExists } from "./approval-cache.js";

/**
 * Draft or revise the script for a session. Wraps the Claude Agent SDK
 * call with a focused stageThreePrompt; returns the resulting
 * script.json path + content hash so callers can cache against it.
 *
 * No approval gate inside the tool — that's a UI concern handled by the
 * macro `full-pipeline.ts` orchestrator (or by the renderer when it
 * fires this tool directly via runTool).
 */
export interface ScriptDrafterInput {
  videoType: string;
  brief: string;
  /** When provided, treat as a revise-script run instead of a fresh
   *  draft. The agent rewrites script.json in place, applying the notes. */
  revisionNotes?: string;
  /** Revision counter passed into the prompt so the agent knows it's a
   *  follow-up cycle (defaults to 0 = initial draft). */
  revision?: number;
}

export interface ScriptDrafterOutput {
  scriptPath: string;
  scriptHash: string | null;
}

export const scriptDrafter: Tool<ScriptDrafterInput, ScriptDrafterOutput> = {
  name: "script.draft",

  async isCached(ctx) {
    const scriptPath = join(ctx.workspaceDir, "script.json");
    const hash = await hashFileIfExists(scriptPath);
    return { hit: hash !== null, hash: hash ?? undefined };
  },

  async run(ctx, input) {
    const toolCallId = nextToolCallId();
    ctx.emit({ type: "tool_started", name: this.name, toolCallId, input });

    const scriptPath = join(ctx.workspaceDir, "script.json");
    const meta = videoTypeMetaFor(input.videoType);
    const isRevision = !!input.revisionNotes;

    const prompt = isRevision
      ? reviseScriptPrompt({
          projectId: ctx.projectId,
          scriptPath,
          notes: input.revisionNotes ?? "",
          revision: input.revision ?? 1,
        })
      : stageThreePrompt({
          projectId: ctx.projectId,
          videoType: input.videoType,
          brief: input.brief,
          meta,
          projectWorkspacePath: ctx.workspaceDir,
        });

    try {
      ctx.emit({ type: "activity", state: isRevision ? "revising" : "drafting" });
      await runAgent({
        prompt,
        systemPrompt: ctx.systemPrompt,
        cwd: ctx.workspaceDir,
        env: makeRunEnv(ctx),
        model: ctx.model,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : `script draft failed`;
      ctx.emit({
        type: "tool_finished",
        name: this.name,
        toolCallId,
        status: "error",
        message,
      });
      return { status: "error", message } satisfies ToolResult<ScriptDrafterOutput>;
    }

    const scriptHash = await hashFileIfExists(scriptPath);
    ctx.emit({
      type: "tool_finished",
      name: this.name,
      toolCallId,
      status: "ok",
    });
    return {
      status: "ok",
      output: { scriptPath, scriptHash },
      artifacts: [scriptPath],
      cacheHash: scriptHash ?? undefined,
    };
  },
};

function makeRunEnv(ctx: ToolContext): Record<string, string> {
  return {
    ORG_PROJECTS_PATH: ctx.orgRoot,
    WORKSPACE_PATH: ctx.workspaceDir,
    TTS_VOICE: ctx.ttsVoice,
  };
}
