# Video Studio

> Agent-driven desktop video generator for SaaS product launches.
> Built on Tauri 2 + Claude Agent SDK + Remotion + edge-tts.
> Uses your local Claude subscription — no API key billing. No TTS billing either.

## What it does

Pick a product from your `organisation-projects/` folder, hit **Generate**, and the agent:

1. Reads the product's README + IMPROVEMENTS + launch post
2. Drafts a 6-scene script in a senior-founder voice
3. Gates on your approval before generating voiceover
4. Generates narration via Microsoft Edge Read Aloud (free, no API key, cached by text hash)
5. Writes a Remotion composition with Geist-style visuals
6. Renders multi-format MP4s (LinkedIn square, X landscape, YouTube, hero)
7. Shows you the live tool-call stream the whole time

Zero billing — the agent uses your Claude Pro/Max subscription via the SDK's auto-detected local credentials, and edge-tts is free with no quotas.

## Prerequisites

- **Node 20+**, **pnpm 9+** — `corepack enable && corepack prepare pnpm@9.15.0 --activate`
- **Bun 1.2+** — `npm i -g bun` (used to compile the agent sidecar into a self-contained executable)
- **Rust** — `rustup` from https://rustup.rs
- **Tauri 2 system deps** — see https://tauri.app/start/prerequisites
- **Claude Code CLI** — `npm i -g @anthropic-ai/claude-code` and run `claude login` once

## First-time setup

```bash
cd C:\Users\HomePC\Documents\organisation-projects\video-studio

# 1. Install workspace dependencies
pnpm install

# 2. Copy env template — defaults are fine for dev
cp .env.example .env

# 3. Compile the agent sidecar to a self-contained binary (Bun)
pnpm sidecar:windows   # or sidecar:macos / sidecar:linux

# 4. Run the desktop app
pnpm dev
```

First `pnpm dev` takes ~2 minutes (Rust compile). Subsequent runs are fast.

## Building a distributable installer

```bash
pnpm bundle
```

This compiles the agent with Bun, produces a Windows `.msi` + `.exe`, and includes
the agent sidecar binary inside the installer. Output lands in
`src-tauri/target/release/bundle/`. Cross-platform variants:

```bash
pnpm bundle:macos    # produces .dmg + .app
pnpm bundle:linux    # produces .deb + .AppImage
```

The bundled installer runs without Bun, Node, or pnpm on the user's machine —
the only external dep is the `claude` CLI for subscription auth.

## Architecture

```
video-studio/
├── src-tauri/         Rust backend (Tauri 2)
├── src/               React + Vite + Tailwind frontend (the desktop UI)
├── agent/             Node sidecar — Claude Agent SDK wrapper
│   ├── src/
│   └── prompts/       Master system prompt + style guides
├── studio/            Remotion workspace — scenes, compositions, assets
│   ├── src/
│   └── public/
└── docs/              Architecture, system prompts, skills reference
```

**Three processes at runtime:**
1. Tauri (Rust) owns the window + filesystem + spawns the sidecar
2. Node sidecar (long-running) runs the Claude Agent SDK and streams tool calls over stdio
3. Remotion CLI (short-lived, spawned by sidecar) renders the actual MP4s

## How the agent uses your local Claude

The agent sidecar imports `@anthropic-ai/claude-agent-sdk` with **no `ANTHROPIC_API_KEY` in the environment**. The SDK auto-detects your Claude Code login at `~/.claude/` and routes requests through your Pro/Max subscription. Every tool call is streamed back to the Tauri frontend as a live progress event.

The agent also automatically loads skills from `~/.claude/skills/` — specifically:

- `remotion-best-practices`, `create-remotion-geist`, `remotion-ads`, `remotion-bits`, `remotion-animation`
- `elevenlabs-remotion`, `text-to-speech`, `sound-effects`, `music`
- `frontend-design`, `canvas-design`, `web-design-guidelines`
- `ffmpeg`

See `agent/prompts/system.md` for the full brief the agent runs against.

## Daily use

```bash
pnpm dev                         # launches desktop app
```

In the UI:
1. Pick a product from the sidebar
2. Pick format(s) — default: linkedin + x
3. Hit **Generate**
4. Watch the agent stream, approve the script, wait for render
5. Preview the MP4, hit **Re-render** to iterate

## Troubleshooting

- **"claude command not found"** — install the Claude Code CLI and run `claude login`
- **"No ElevenLabs API key"** — check `.env` and restart the app
- **Render hangs at 0%** — first render downloads Chromium headless (~200 MB); be patient
- **Rust compile fails** — ensure you have the Tauri 2 system deps installed for your OS

## License

MIT — do what you want with it.
