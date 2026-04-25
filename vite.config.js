import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-ignore
var host = process.env.TAURI_DEV_HOST;
export default defineConfig({
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
        port: 5173,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                protocol: "ws",
                host: host,
                port: 5174,
            }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**", "**/studio/**", "**/agent/dist/**"],
        },
    },
    resolve: {
        alias: {
            "@": "/src",
        },
    },
});
