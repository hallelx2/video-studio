#!/usr/bin/env node
/**
 * After `tsc -p electron/tsconfig.json` emits CommonJS into electron/dist/,
 * drop a minimal package.json there with `"type": "commonjs"`. Without
 * this Node's ESM loader honors the root package.json's `"type":"module"`
 * inside the packaged asar and refuses to run the CJS output:
 *
 *   ReferenceError: exports is not defined in ES module scope
 *
 * Closest-package-wins: a package.json in the dist tree overrides the
 * root inheritance for everything in that directory. Chained after every
 * tsc invocation so dev and packaged builds behave identically.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, "electron", "dist");
mkdirSync(distDir, { recursive: true });
writeFileSync(
  join(distDir, "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
  "utf8"
);
console.log(`[finalize-electron-build] wrote ${join(distDir, "package.json")}`);
