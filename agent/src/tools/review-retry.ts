import { runAgent } from "../claude.js";
import { emit } from "../index.js";

/**
 * Generic "stage failed → agent reviews → user decides retry/cancel"
 * loop. Lifted from generate-video.ts so the new full-pipeline macro
 * and any future tool that wants the same recovery behavior share one
 * implementation.
 *
 * Used by stages where failures are commonly caused by environment
 * issues (Kokoro python deps, ffmpeg PATH, render bugs in the
 * composition) — the agent inspects the environment, writes a
 * diagnostic review for the user, then we ask the user whether to
 * retry once they've fixed the underlying issue.
 */
export interface StageRecoveryOpts {
  stageName: string;
  systemPrompt: string;
  cwd: string;
  env: Record<string, string>;
  model?: string;
  askUser: (
    question: string,
    options: string[],
    payload?: Record<string, unknown>
  ) => Promise<string>;
  /** Cap on review-and-retry rounds. Default 3. */
  maxAttempts?: number;
}

export async function withReviewAndRetry<T>(
  runner: () => Promise<T>,
  opts: StageRecoveryOpts
): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await runner();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (attempt >= max) throw err;

      emit({
        type: "progress",
        phase: "reviewing_failure",
        message: `${opts.stageName} failed (attempt ${attempt}/${max}) — agent is reviewing`,
      });

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

      if (response.trim().toLowerCase() !== "retry") throw err;
    }
  }
  throw new Error(`withReviewAndRetry: exhausted ${max} attempts for ${opts.stageName}`);
}

export function stageReviewPrompt(args: {
  stageName: string;
  attempt: number;
  maxAttempts: number;
  errorMessage: string;
}): string {
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
        `5. If step 4 says "not found", try the OTHER pythons from steps 1-2 with their full paths.`,
        ``,
        `Identify the mismatch in your review. If found, structure the "What to do" section to point the user at Settings → Python interpreter or a one-off pip install command. Don't run pip install yourself.`,
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
    `- **Why** — root cause if you can identify one. Use Bash to check the environment when it'd help diagnose.`,
    `- **What to do** — 1–3 numbered options the user can take. Be concrete.`,
    ``,
    `Don't try to fix the issue yourself. The user retries (or cancels) once they're satisfied.`,
  ].join("\n");
}
