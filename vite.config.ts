import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

/**
 * Vite config for the renderer (React UI).
 * The Electron main process is built separately by tsc — see electron/tsconfig.json.
 *
 * `base: "./"` is required so Electron's `file://` protocol resolves assets correctly
 * when loading the production bundle.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  clearScreen: false,
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/electron/dist/**", "**/agent/dist/**", "**/dist/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
