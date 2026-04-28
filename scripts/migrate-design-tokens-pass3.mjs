/**
 * Pass 3: rebrand documentation comments and user-facing theme labels.
 * "Atelier Noir" → "Composio" naming, comment-level cinnabar/brass/paper-mute
 * references swapped for cyan/mist/fg-muted equivalents so docstrings match
 * the running code.
 *
 * Theme IDs (`noir`, `creme`) are preserved — they're persisted config values.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "src");

// User-facing label rebrands (keep order — most specific first).
const labelReplacements = [
  // Settings theme picker labels
  ['label: "Atelier Noir", description: "Deep ink canvas. The default."',
   'label: "Composio Dark", description: "Pitch-black canvas. The default."'],
  ['label: "Atelier Crème", description: "Warm paper canvas. Same identity in daylight."',
   'label: "Composio Daylight", description: "Warm paper canvas. Same identity in daylight."'],

  // TopChrome theme-toggle aria label
  ['`Switch to Atelier ${next === "noir" ? "Noir" : "Crème"}`',
   '`Switch to ${next === "noir" ? "Composio Dark" : "Composio Daylight"}`'],
];

// Documentation / comment rebrands.
const docReplacements = [
  // Concept-level renames
  ["Atelier Noir shell", "Composio shell"],
  ["Atelier Noir defaults", "Composio defaults"],
  ["leave Atelier Noir", "leave the Composio surface"],
  ["Atelier-Noir SVG icons", "Composio SVG icons"],
  ["Atelier-Noir", "Composio"],
  ["Atelier Noir", "Composio Dark"],

  // Color-vocabulary in comments → new vocabulary
  ["brass hairline divider", "mist-10 hairline divider"],
  ["brass leading edge", "mist-10 leading edge"],
  ["brass accent on emphasis", "cyan accent on emphasis"],
  ["brass on Sonnet, paper-mute on Haiku", "fg-muted on Sonnet, fg-faint on Haiku"],
  ["brass for elapsed", "fg-faint for elapsed"],
  ["paper-mute hover", "fg-muted hover"],

  // Inline body-comment color references
  ["cinnabar fill along the bottom edge", "cyan fill along the bottom edge"],
  ["cinnabar for active", "cyan for active"],
  ["cinnabar dot for the active selection", "cyan dot for the active selection"],
  ["cinnabar dot in the upper-right", "cyan dot in the upper-right"],
  ["cinnabar heartbeat", "cyan heartbeat"],
  ["cinnabar, the 'aha' beat", "cyan, the 'aha' beat"],
  ["Brass accent (not cinnabar", "Mist accent (not cyan"],
  ["{/* Concept rays — brass, faint */}", "{/* Concept rays — mist, faint */}"],
  ["// emphasis on Opus, brass on Sonnet, paper-mute on Haiku.",
   "// emphasis on Opus, fg-muted on Sonnet, fg-faint on Haiku."],
];

const exts = new Set([".tsx", ".ts", ".css", ".md"]);

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (exts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const stats = { filesChanged: 0, totalReplacements: 0 };
const all = [...labelReplacements, ...docReplacements];

const files = await walk(SRC);
for (const file of files) {
  const original = await fs.readFile(file, "utf8");
  let next = original;
  for (const [from, to] of all) {
    if (!next.includes(from)) continue;
    const count = next.split(from).length - 1;
    next = next.split(from).join(to);
    stats.totalReplacements += count;
  }
  if (next !== original) {
    await fs.writeFile(file, next, "utf8");
    stats.filesChanged++;
    console.log(`  ✓ ${path.relative(SRC, file)}`);
  }
}

console.log("");
console.log(`Files changed:      ${stats.filesChanged}`);
console.log(`Total replacements: ${stats.totalReplacements}`);
