/**
 * One-shot migration: Atelier Noir tokens → Composio tokens.
 *
 * Walks src/ and applies ordered string replacements to every .tsx, .ts,
 * .css, .md file. Order matters — longer matches first so `bg-ink-raised`
 * doesn't get half-eaten by a later `bg-ink` rule.
 *
 * Run once and delete; not part of the normal build.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "src");

// Ordered: longest / most-specific patterns first.
const replacements = [
  // ── Compound surface tokens (specific before general) ────────────────────
  ["bg-ink-raised", "bg-surface"],
  ["bg-ink-edge", "bg-elevated"],
  ["text-ink-raised", "text-surface"],
  ["text-ink-edge", "text-elevated"],
  ["border-ink-raised", "border-surface"],
  ["border-ink-edge", "border-elevated"],
  ["from-ink-raised", "from-surface"],
  ["from-ink-edge", "from-elevated"],
  ["to-ink-raised", "to-surface"],
  ["to-ink-edge", "to-elevated"],
  ["via-ink-raised", "via-surface"],
  ["via-ink-edge", "via-elevated"],
  ["ring-ink-raised", "ring-surface"],
  ["ring-ink-edge", "ring-elevated"],
  ["divide-ink-raised", "divide-surface"],
  ["divide-ink-edge", "divide-elevated"],
  ["fill-ink-raised", "fill-surface"],
  ["fill-ink-edge", "fill-elevated"],
  ["stroke-ink-raised", "stroke-surface"],
  ["stroke-ink-edge", "stroke-elevated"],
  ["outline-ink-raised", "outline-surface"],
  ["outline-ink-edge", "outline-elevated"],
  ["shadow-ink-raised", "shadow-surface"],
  ["shadow-ink-edge", "shadow-elevated"],
  ["accent-ink-raised", "accent-surface"],
  ["accent-ink-edge", "accent-elevated"],
  ["caret-ink-raised", "caret-surface"],
  ["caret-ink-edge", "caret-elevated"],
  ["placeholder-ink-raised", "placeholder-surface"],
  ["placeholder-ink-edge", "placeholder-elevated"],

  // ── Compound paper-mute tokens ──────────────────────────────────────────
  ["text-paper-mute", "text-fg-muted"],
  ["bg-paper-mute", "bg-fg-muted"],
  ["border-paper-mute", "border-fg-muted"],
  ["from-paper-mute", "from-fg-muted"],
  ["to-paper-mute", "to-fg-muted"],
  ["via-paper-mute", "via-fg-muted"],
  ["ring-paper-mute", "ring-fg-muted"],
  ["fill-paper-mute", "fill-fg-muted"],
  ["stroke-paper-mute", "stroke-fg-muted"],
  ["divide-paper-mute", "divide-fg-muted"],
  ["outline-paper-mute", "outline-fg-muted"],
  ["accent-paper-mute", "accent-fg-muted"],
  ["caret-paper-mute", "caret-fg-muted"],
  ["placeholder-paper-mute", "placeholder-fg-muted"],
  ["decoration-paper-mute", "decoration-fg-muted"],
  ["shadow-paper-mute", "shadow-fg-muted"],

  // ── brass-line (always meant: a 1px hairline border) ───────────────────
  ["border-brass-line", "border-mist-10"],
  ["bg-brass-line", "bg-mist-10"],
  ["from-brass-line", "from-mist-10"],
  ["to-brass-line", "to-mist-10"],
  ["via-brass-line", "via-mist-10"],
  ["ring-brass-line", "ring-mist-10"],
  ["divide-brass-line", "divide-mist-10"],

  // ── cinnabar-glow ───────────────────────────────────────────────────────
  ["bg-cinnabar-glow", "bg-cyan-glow"],
  ["text-cinnabar-glow", "text-cyan-glow"],
  ["border-cinnabar-glow", "border-cyan-glow"],
  ["from-cinnabar-glow", "from-cyan-glow"],
  ["to-cinnabar-glow", "to-cyan-glow"],
  ["via-cinnabar-glow", "via-cyan-glow"],
  ["ring-cinnabar-glow", "ring-cyan-glow"],
  ["shadow-cinnabar-glow", "shadow-cyan-glow"],

  // ── Animation / utility class names ─────────────────────────────────────
  ["pulse-cinnabar", "pulse-cyan"],
  ["text-shimmer-cinnabar", "text-shimmer-cyan"],

  // ── Inline CSS-var references (TopChrome, EmptyComposerState, etc.) ─────
  ["var(--color-ink-raised)", "var(--color-surface)"],
  ["var(--color-ink-edge)", "var(--color-elevated)"],
  ["var(--color-paper-mute)", "var(--color-fg-muted)"],
  ["var(--color-brass-line)", "var(--color-mist-10)"],
  ["var(--color-cinnabar-glow)", "var(--color-cyan-glow)"],
  ["var(--color-cinnabar)", "var(--color-cyan)"],
  ["var(--color-brass)", "var(--color-fg-faint)"],
  ["var(--color-paper)", "var(--color-fg)"],
  ["var(--color-ink)", "var(--color-void)"],
  ["var(--ease-atelier)", "var(--ease-composio)"],

  // ── Simple ink → void (generic page bg) ─────────────────────────────────
  ["bg-ink", "bg-void"],
  ["text-ink", "text-void"],
  ["border-ink", "border-void"],
  ["from-ink", "from-void"],
  ["to-ink", "to-void"],
  ["via-ink", "via-void"],
  ["ring-ink", "ring-void"],
  ["divide-ink", "divide-void"],
  ["fill-ink", "fill-void"],
  ["stroke-ink", "stroke-void"],
  ["outline-ink", "outline-void"],
  ["shadow-ink", "shadow-void"],
  ["accent-ink", "accent-void"],
  ["caret-ink", "caret-void"],
  ["placeholder-ink", "placeholder-void"],

  // ── Simple paper → fg (primary text) ────────────────────────────────────
  ["text-paper", "text-fg"],
  ["bg-paper", "bg-fg"],
  ["border-paper", "border-fg"],
  ["from-paper", "from-fg"],
  ["to-paper", "to-fg"],
  ["via-paper", "via-fg"],
  ["ring-paper", "ring-fg"],
  ["divide-paper", "divide-fg"],
  ["fill-paper", "fill-fg"],
  ["stroke-paper", "stroke-fg"],
  ["outline-paper", "outline-fg"],
  ["shadow-paper", "shadow-fg"],
  ["accent-paper", "accent-fg"],
  ["caret-paper", "caret-fg"],
  ["placeholder-paper", "placeholder-fg"],
  ["decoration-paper", "decoration-fg"],

  // ── brass → fg-faint (text) / mist-10 (border) ──────────────────────────
  // brass was used for two purposes: hairlines (borders) and metadata text.
  // Borders go to mist-10 (the workhorse Composio border). Other usages go
  // to fg-faint (Whisper White) — the closest semantic match for "muted
  // technical accent text".
  ["border-brass", "border-mist-10"],
  ["divide-brass", "divide-mist-10"],
  ["text-brass", "text-fg-faint"],
  ["bg-brass", "bg-fg-faint"],
  ["from-brass", "from-fg-faint"],
  ["to-brass", "to-fg-faint"],
  ["via-brass", "via-fg-faint"],
  ["ring-brass", "ring-fg-faint"],
  ["fill-brass", "fill-fg-faint"],
  ["stroke-brass", "stroke-fg-faint"],
  ["outline-brass", "outline-fg-faint"],
  ["shadow-brass", "shadow-fg-faint"],
  ["accent-brass", "accent-fg-faint"],
  ["caret-brass", "caret-fg-faint"],
  ["placeholder-brass", "placeholder-fg-faint"],
  ["decoration-brass", "decoration-fg-faint"],

  // ── cinnabar → cyan (THE accent) ────────────────────────────────────────
  ["text-cinnabar", "text-cyan"],
  ["bg-cinnabar", "bg-cyan"],
  ["border-cinnabar", "border-cyan"],
  ["from-cinnabar", "from-cyan"],
  ["to-cinnabar", "to-cyan"],
  ["via-cinnabar", "via-cyan"],
  ["ring-cinnabar", "ring-cyan"],
  ["divide-cinnabar", "divide-cyan"],
  ["fill-cinnabar", "fill-cyan"],
  ["stroke-cinnabar", "stroke-cyan"],
  ["outline-cinnabar", "outline-cyan"],
  ["shadow-cinnabar", "shadow-cyan"],
  ["accent-cinnabar", "accent-cyan"],
  ["caret-cinnabar", "caret-cyan"],
  ["placeholder-cinnabar", "placeholder-cyan"],
  ["decoration-cinnabar", "decoration-cyan"],
];

const exts = new Set([".tsx", ".ts", ".css", ".md"]);

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (exts.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const stats = { filesScanned: 0, filesChanged: 0, totalReplacements: 0, byPattern: {} };

const files = await walk(SRC);
for (const file of files) {
  stats.filesScanned++;
  const original = await fs.readFile(file, "utf8");
  let next = original;
  for (const [from, to] of replacements) {
    if (!next.includes(from)) continue;
    const count = next.split(from).length - 1;
    next = next.split(from).join(to);
    stats.totalReplacements += count;
    stats.byPattern[from] = (stats.byPattern[from] ?? 0) + count;
  }
  if (next !== original) {
    await fs.writeFile(file, next, "utf8");
    stats.filesChanged++;
    console.log(`  ✓ ${path.relative(SRC, file)}`);
  }
}

console.log("");
console.log(`Files scanned:      ${stats.filesScanned}`);
console.log(`Files changed:      ${stats.filesChanged}`);
console.log(`Total replacements: ${stats.totalReplacements}`);
console.log("");
console.log("Top patterns:");
const top = Object.entries(stats.byPattern).sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [pat, count] of top) {
  console.log(`  ${String(count).padStart(4)}  ${pat}`);
}
