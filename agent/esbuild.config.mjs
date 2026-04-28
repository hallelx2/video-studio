#!/usr/bin/env node
/**
 * Bundle the agent into a single CJS file so the packaged Electron app
 * doesn't need to ship a node_modules tree alongside it.
 *
 * Why CJS even though the source is ESM: when the agent runs as
 * ELECTRON_RUN_AS_NODE inside the asar, the closest package.json
 * (electron/dist/package.json from our packaging fix) declares
 * "type": "commonjs". A CJS bundle is the most portable target — it
 * works in dev (Electron 33 / Node 20) and in the packaged asar without
 * any extra .mjs / .cjs naming dance.
 *
 * `platform=node` keeps Node built-ins (fs, path, child_process, …)
 * external. `packages=bundle` (the default with --bundle) inlines every
 * npm dep, so claude-agent-sdk and zod become part of the single file.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(here, "src", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: join(here, "dist", "index.js"),
  sourcemap: true,
  // Keep optional / native-side deps that puppeteer-style packages
  // probe for at runtime out of the bundle. They aren't actually used
  // by the agent's code path; bundling them just produces noisy resolve
  // warnings without affecting correctness.
  external: [],
  logLevel: "info",
});

// Drop a {"type":"commonjs"} so Node loaders honor the bundle format
// regardless of the parent agent/package.json (which is ESM for source
// authoring) or the root package.json (also ESM).
const distDir = join(here, "dist");
mkdirSync(distDir, { recursive: true });
writeFileSync(
  join(distDir, "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
  "utf8"
);
console.log(`[agent/esbuild] wrote ${join(distDir, "package.json")}`);
