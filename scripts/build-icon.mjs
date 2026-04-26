#!/usr/bin/env node
/**
 * Convert build/icon.svg → build/icon.png and a few intermediate sizes.
 *
 * electron-builder picks up build/icon.png as the source for both Windows
 * .ico and macOS .icns at packaging time. For Linux it ships the PNG
 * directly. BrowserWindow.icon in dev also reads the PNG.
 *
 * Run via `pnpm build:icon` (one-shot) or it'll be invoked automatically
 * before electron-builder during `pnpm bundle`.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const svgPath = join(root, "build", "icon.svg");
const outDir = join(root, "build");

const SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function main() {
  await mkdir(outDir, { recursive: true });
  const svg = await readFile(svgPath);

  // Master 1024 PNG — what electron-builder consumes for ICO/ICNS generation.
  await sharp(svg, { density: 384 })
    .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(join(outDir, "icon.png"));

  // Linux distros want individual size variants under build/icons/<size>x<size>.png
  // when shipping AppImage / .deb. Generate a small set so packaging is clean.
  await mkdir(join(outDir, "icons"), { recursive: true });
  for (const size of SIZES) {
    await sharp(svg, { density: Math.max(96, size / 4) })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(join(outDir, "icons", `${size}x${size}.png`));
  }

  console.log(`[build-icon] wrote ${outDir}/icon.png + ${SIZES.length} size variants`);
}

main().catch((err) => {
  console.error("[build-icon] failed:", err);
  process.exit(1);
});
