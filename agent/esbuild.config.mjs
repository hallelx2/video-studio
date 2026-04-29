#!/usr/bin/env node
/**
 * Bundle the agent into a single CJS file so the packaged Electron app
 * doesn't need to ship a node_modules tree alongside it.
 *
 * Why CJS even though the source is ESM: when the agent runs as
 * ELECTRON_RUN_AS_NODE inside the asar, the closest package.json
 * (agent/dist/package.json that this script writes) declares
 * "type": "commonjs". A CJS bundle is the most portable target — it
 * works in dev (Electron 33 / Node 20) and in the packaged asar without
 * any extra .mjs / .cjs naming dance.
 *
 * `platform=node` keeps Node built-ins (fs, path, child_process, …)
 * external. With `bundle: true` and `external: []`, esbuild inlines
 * every npm dep so claude-agent-sdk and zod become part of the single
 * file.
 *
 * Pass `--watch` to keep rebuilding on source changes (used by the
 * agent's `dev` script — replaces the previous `tsc -w` which produced
 * multi-file ESM output that conflicted with the CJS package.json drop
 * sitting in the same directory).
 */
import { context as createContext, build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const config = {
  entryPoints: [join(here, "src", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: join(here, "dist", "index.js"),
  sourcemap: true,
  external: [],
  logLevel: "info",
};

// Always drop the {"type":"commonjs"} alongside the bundle so Node
// loaders honor the bundle format regardless of the parent
// agent/package.json (ESM for source authoring) or the root
// package.json (also ESM). Run before the build so even a watch-mode
// initial build sees the file.
function ensurePackageJson() {
  const distDir = join(here, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(
    join(distDir, "package.json"),
    JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
    "utf8"
  );
}

ensurePackageJson();

if (watch) {
  const ctx = await createContext(config);
  await ctx.watch();
  console.log("[agent/esbuild] watching for changes…");
  // Keep the process alive — esbuild's watch mode runs on its own
  // worker, but the main loop must remain so the dev runner doesn't
  // see the script exit.
} else {
  await build(config);
  console.log(`[agent/esbuild] wrote ${join(here, "dist", "index.js")}`);
}
