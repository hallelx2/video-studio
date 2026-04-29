import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { nextToolCallId } from "./types.js";

/**
 * Tool wrapper around the resume detector. Reads the workspace's known
 * artifact paths (script.json, DESIGN.md, source-brief.md, narration/,
 * browser-bridge/<aspect>/) and returns which pipeline stages can be
 * skipped because their primary artifact is already present.
 *
 * For now this is a focused subset that the renderer can use to
 * pre-compute "what would happen if I clicked + render?" — the full
 * detectResume() in generate-video.ts handles the macro flow with all
 * the cascade rules. Phase 4 of the plan will move that logic here
 * and have generate-video.ts re-import.
 */
export interface ResumeReport {
  hasScript: boolean;
  hasNarration: boolean;
  hasComposition: boolean;
  hasRender: boolean;
  scriptPath: string | null;
  narrationPaths: string[];
  compositionPaths: string[];
  renderPaths: string[];
}

export const resumeDetector: Tool<unknown, ResumeReport> = {
  name: "resume.detect",

  async isCached() {
    // Resume detection is itself a cheap read — never cache.
    return { hit: false };
  },

  async run(ctx) {
    const toolCallId = nextToolCallId();
    ctx.emit({ type: "tool_started", name: this.name, toolCallId });

    const scriptPath = join(ctx.workspaceDir, "script.json");
    const narrationDir = join(ctx.workspaceDir, "narration");
    const bridgeRoot = join(ctx.workspaceDir, "browser-bridge");
    const outputDir = join(ctx.workspaceDir, "output");

    const [hasScript, narrationPaths, compositionPaths, renderPaths] = await Promise.all([
      fileExists(scriptPath),
      listFiles(narrationDir, /\.wav$/i),
      listFilesRecursive(bridgeRoot, /index\.html$/i),
      listFiles(outputDir, /\.mp4$/i),
    ]);

    const report: ResumeReport = {
      hasScript,
      hasNarration: narrationPaths.length > 0,
      hasComposition: compositionPaths.length > 0,
      hasRender: renderPaths.length > 0,
      scriptPath: hasScript ? scriptPath : null,
      narrationPaths,
      compositionPaths,
      renderPaths,
    };

    ctx.emit({
      type: "tool_finished",
      name: this.name,
      toolCallId,
      status: "ok",
    });
    return {
      status: "ok",
      output: report,
    } satisfies ToolResult<ResumeReport>;
  },
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir: string, match: RegExp): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && match.test(e.name))
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

async function listFilesRecursive(dir: string, match: RegExp): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && match.test(e.name)) out.push(p);
    }
  }
  await walk(dir);
  return out;
}
