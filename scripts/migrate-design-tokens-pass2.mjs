/**
 * Pass 2: catch directional border colors and a handful of stragglers
 * the first migration didn't cover (border-l-*, border-r-*, border-t-*,
 * border-b-*, border-s-*, border-e-*, border-x-*, border-y-*).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "src");

const sides = ["l", "r", "t", "b", "s", "e", "x", "y"];
const replacements = [];

// Directional border colors. Specific tokens first.
for (const s of sides) {
  // Compound (most specific)
  replacements.push([`border-${s}-ink-raised`, `border-${s}-surface`]);
  replacements.push([`border-${s}-ink-edge`, `border-${s}-elevated`]);
  replacements.push([`border-${s}-paper-mute`, `border-${s}-fg-muted`]);
  replacements.push([`border-${s}-brass-line`, `border-${s}-mist-10`]);
  replacements.push([`border-${s}-cinnabar-glow`, `border-${s}-cyan-glow`]);
  // Simple
  replacements.push([`border-${s}-ink`, `border-${s}-void`]);
  replacements.push([`border-${s}-paper`, `border-${s}-fg`]);
  replacements.push([`border-${s}-brass`, `border-${s}-mist-10`]); // hairline → workhorse mist border
  replacements.push([`border-${s}-cinnabar`, `border-${s}-cyan`]);
}

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

const files = await walk(SRC);
for (const file of files) {
  const original = await fs.readFile(file, "utf8");
  let next = original;
  for (const [from, to] of replacements) {
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
