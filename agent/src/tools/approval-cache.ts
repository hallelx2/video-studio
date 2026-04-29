import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";

/**
 * Centralized cache + approval helpers shared by every tool that has
 * idempotency or approval semantics. Single source of truth — tools
 * don't read / write `.approval.json` or compute hashes directly; they
 * always go through this module.
 *
 * Lifted from generate-video.ts so the legacy task and the new tool
 * modules share the exact same write semantics. generate-video.ts now
 * re-exports these names so its existing call sites continue to work.
 */

export interface ApprovalState {
  /** videoType the approval was issued for. A different videoType
   *  produces a structurally different script (different scene IDs,
   *  beats, format) so the approval cannot transfer. */
  videoType?: string | null;
  scriptHash?: string | null;
  scriptApprovedAt?: number | null;
  composeHash?: string | null;
  composeApprovedAt?: number | null;
}

export async function readApprovalState(path: string): Promise<ApprovalState | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw) as ApprovalState;
  } catch {
    return null;
  }
}

export async function writeApprovalState(
  path: string,
  state: ApprovalState
): Promise<void> {
  try {
    await fs.writeFile(path, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Approval persistence is best-effort — a failure here shouldn't
    // derail the run. Worst case the user gets re-prompted.
  }
}

export async function clearApprovalState(path: string): Promise<void> {
  try {
    await fs.unlink(path);
  } catch {
    // ENOENT or anything else — fine, nothing to clear.
  }
}

/**
 * Wipe artifacts derived from a previous run whose videoType no longer
 * matches the current request. Without this, the script-unchanged gate-
 * skip can false-positive against a stale script.json + .approval.json
 * pair from the prior videoType. Tolerant of missing files / dirs.
 */
export async function invalidateStaleArtifacts(args: {
  scriptPath: string;
  approvalPath: string;
  narrationDir: string;
  bridgeRoot: string;
}): Promise<void> {
  await Promise.all([
    fs.unlink(args.scriptPath).catch(() => undefined),
    fs.unlink(args.approvalPath).catch(() => undefined),
    fs.rm(args.narrationDir, { recursive: true, force: true }).catch(() => undefined),
    fs.rm(args.bridgeRoot, { recursive: true, force: true }).catch(() => undefined),
  ]);
}

/**
 * Detect application-level failures from hyperframes / kokoro / Python
 * that aren't recoverable by retrying with a different spawn strategy.
 * Pattern-matches the stderr; tools should bail immediately on a fatal
 * hit so the user sees the actionable cause instead of layers of retry
 * noise.
 */
export function isFatalAppError(stderr: string): { fatal: boolean; hint?: string } {
  const lower = stderr.toLowerCase();
  if (
    lower.includes("the kokoro-onnx package is not installed") ||
    lower.includes("modulenotfounderror: no module named 'kokoro")
  ) {
    return {
      fatal: true,
      hint: "Kokoro TTS dependencies missing — install with: pip install kokoro-onnx soundfile",
    };
  }
  if (lower.includes("modulenotfounderror: no module named 'soundfile")) {
    return {
      fatal: true,
      hint: "soundfile Python package missing — install with: pip install soundfile",
    };
  }
  if (lower.includes("ffmpeg") && lower.includes("not found")) {
    return {
      fatal: true,
      hint: "FFmpeg not on PATH — install ffmpeg and restart the app.",
    };
  }
  return { fatal: false };
}

export async function hashFileIfExists(path: string): Promise<string | null> {
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
 * file is missing — null mismatches whatever's stored, forcing a
 * re-prompt.
 */
export async function hashCompositionsIfExist(
  compositions: Array<{ aspect: string; indexHtml: string }>
): Promise<string | null> {
  const sorted = [...compositions].sort((a, b) => a.aspect.localeCompare(b.aspect));
  const h = createHash("sha256");
  for (const comp of sorted) {
    const buf = await fs.readFile(comp.indexHtml).catch(() => null);
    if (!buf) return null;
    h.update(comp.aspect);
    h.update("\0");
    h.update(buf);
    h.update("\0");
  }
  return h.digest("hex");
}
