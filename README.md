# Video Studio

> Agent-driven desktop video generator.
> Built on **Electron + Claude Agent SDK + HyperFrames + Kokoro TTS**.
> Uses your local Claude subscription — no API key billing. No TTS billing either.

## What it does

Pick a project from your `organisation-projects/` folder, pick the kind of video you want — **hackathon demo · product launch · tutorial · storyline · custom** — and the agent:

1. Reads the project's README, IMPROVEMENTS, launch posts, and any in-folder DESIGN.md
2. Resolves the visual identity (project DESIGN.md → forks the global Atelier Noir DESIGN.md)
3. Drafts a script in a senior-founder voice
4. **Pauses on a hard gate** for your approval (with a revision loop)
5. Generates narration via `npx hyperframes tts` (Kokoro-82M, free, offline)
6. Authors a HyperFrames composition (HTML + GSAP) per requested aspect ratio
7. Lints + validates contrast, then renders MP4s via `npx hyperframes render`
8. Streams every tool call live so you can watch and intervene

Zero billing — agent uses your Claude Pro/Max subscription, Kokoro is free.

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | **Electron 33** (CommonJS main, ESM renderer) |
| UI | **React 19 + Vite 8 + Tailwind v4** |
| Agent | Node child process running **Claude Agent SDK**, NDJSON over stdio |
| Video engine | **HyperFrames** (HTML + GSAP → MP4) |
| TTS | **Kokoro-82M** via `npx hyperframes tts` |
| Visual identity | **Atelier Noir** — see `DESIGN.md` |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Electron BrowserWindow                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React renderer (Vite)                                │  │
│  │  · Onboarding · Projects · Workbench · Settings       │  │
│  │  · TopChrome · TabStrip · RenderProgress · Pulse     │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │ window.studio.* (typed contextBridge) │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │  Electron main process (CJS)                          │  │
│  │  · agent-bridge: spawn agent, parse NDJSON            │  │
│  │  · projects:    scan organisation-projects/          │  │
│  │  · config:      load/save <userData>/config.json     │  │
│  └──────────────────┬───────────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────────┘
                      │ child_process + stdio (JSONL)
┌─────────────────────▼──────────────────────────────────────┐
│  Node agent (agent/dist/index.js)                           │
│  · Claude Agent SDK against ~/.claude/ local credentials    │
│  · Six-stage pipeline: read → DESIGN → script → tts →       │
│    compose → lint+validate → render                         │
│  · Spawns: npx hyperframes init / tts / lint / render       │
└─────────────────────────────────────────────────────────────┘
```

## Visual identity

The desktop UI and the default video aesthetic are governed by [`DESIGN.md`](./DESIGN.md). Read it before changing colours, fonts, motion, or layout language. **Both the `frontend-design` skill and the `hyperframes` skill enforce it as a hard gate** — every UI choice and every video composition must trace back to the file.

Per-project brands fork it: if a project has its own `DESIGN.md`, the agent uses that instead.

## Prerequisites

- **Node 20+** — `corepack enable && corepack prepare pnpm@9.15.0 --activate`
- **FFmpeg** — required by HyperFrames render (https://ffmpeg.org/download.html)
- **Claude Code CLI** — `npm i -g @anthropic-ai/claude-code` then `claude login`
- That's it. No Rust, no Bun, no API keys, no billing surface.

## First-time setup

```powershell
cd C:\Users\HomePC\Documents\organisation-projects\video-studio
pnpm install
pnpm dev
```

`pnpm dev` runs Vite + the Electron main process concurrently. First launch downloads the Electron binary (~100 MB).

The first time you launch, you'll see an Onboarding flow — pick your projects folder and a default Kokoro voice.

## Daily use

```powershell
pnpm dev
```

In the UI:
1. Pick a project from the left rail
2. Open the workbench
3. Pick a video type, formats, and (optionally) write a brief
4. Hit **Generate video**
5. Watch the agent stream
6. Approve the script when prompted (or request changes — up to 5 revision rounds)
7. Preview the rendered MP4s in `<userData>/workspace/<project>/output/`

## Building an installer

```powershell
pnpm bundle           # Windows .exe (NSIS)
pnpm bundle:mac       # macOS .dmg
pnpm bundle:linux     # Linux AppImage
```

Output lands in `dist/installers/`.

## Repo layout

```
video-studio/
├── DESIGN.md             ← visual identity (governs everything)
├── electron/             ← main process, preload, agent bridge (CJS)
├── src/                  ← React renderer (ESM)
│   ├── components/ui/    ← TopChrome, TabStrip, RenderProgress, Pulse
│   ├── routes/           ← Onboarding · Projects · Workbench · Settings
│   └── lib/              ← agent-client, types re-export, cn helper
└── agent/                ← Node sidecar (Claude Agent SDK + HyperFrames)
    ├── prompts/system.md ← agent's master brief
    └── src/tasks/        ← per-stage orchestration
```

## How the agent uses your local Claude

The agent imports `@anthropic-ai/claude-agent-sdk` with **no `ANTHROPIC_API_KEY` in the environment**. The SDK auto-detects your Claude Code login at `~/.claude/` and routes requests through your Pro/Max subscription. Every tool call streams back to the renderer as a live event.

Skills the agent loads on demand (from `~/.claude/skills/`):

- `hyperframes` + `hyperframes-cli` — composition rules and CLI commands
- HyperFrames references: `typography.md`, `transitions.md`, `motion-principles.md`, `captions.md`, `tts.md`
- `ffmpeg` — only when post-processing is needed

## Troubleshooting

- **"claude command not found"** — install the Claude Code CLI and run `claude login`
- **Render hangs** — HyperFrames downloads bundled Chromium on first render (~200 MB); be patient
- **Electron won't launch** — `pnpm install` then `pnpm rebuild electron` to refetch the binary

## License

MIT — do what you want with it.
