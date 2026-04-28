<div align="center">

# Video Studio

![Video Studio — 2-minute walkthrough](assets/video-studio-demo.gif)

<sub>Prefer audio + full quality? <a href="https://github.com/hallelx2/video-studio/releases/download/v0.1.1/video-studio-demo.mp4">Download the MP4</a> (5.4 MB).</sub>

**A desktop agent-driven video studio.** Compose, narrate, and render videos through a single in-app conversation with a Claude agent that drafts scripts, lays out HyperFrames compositions, and renders Chromium-safe MP4s — all without leaving the window.

[![License: MIT](https://img.shields.io/badge/license-MIT-cyan.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/hallelx2/video-studio?include_prereleases&color=cyan)](https://github.com/hallelx2/video-studio/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/hallelx2/video-studio/release-please.yml?branch=main&label=release-please)](https://github.com/hallelx2/video-studio/actions)
[![Electron](https://img.shields.io/badge/electron-33-9feaf9?logo=electron&logoColor=black)](https://www.electronjs.org)
[![React](https://img.shields.io/badge/react-19-61dafb?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/vite-8-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind](https://img.shields.io/badge/tailwind-4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Claude Agent SDK](https://img.shields.io/badge/claude--agent--sdk-opus%204.7-d97757)](https://docs.anthropic.com/claude/docs/agent-sdk)
[![HyperFrames](https://img.shields.io/badge/hyperframes-0.4-ec4899)](https://github.com/heygen-com/hyperframes)
[![Conventional Commits](https://img.shields.io/badge/conventional%20commits-1.0.0-fa6673?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)

</div>

---

## What it does

Video Studio is the cockpit for an agent that ships finished videos. You describe what you want; the agent turns that into:

- **A script** drafted with the persona, tone, and beat structure you set.
- **A narration track** generated through [Kokoro TTS](https://github.com/hexgrad/kokoro) — runs entirely on your machine, no per-character billing.
- **HTML compositions** authored as HyperFrames documents — multi-aspect (1080×1080, 1920×1080, 9:16, …) with shared media and per-aspect tuning.
- **A rendered MP4** post-processed into Chromium-safe H.264 / `yuv420p` so the in-app preview can stream the result without a transcode dance.

Every step is interruptible. The agent's reasoning streams into an activity feed, tool calls are surfaced inline, and the user can correct course at any approval point — `/redraft`, `/renarrate`, `/recompose`, or `/rerender` re-enter the pipeline at exactly the right stage instead of starting over.

## Highlights

- **In-app preview** — clicking *preview* spawns the HyperFrames dev server and renders it inside a slide-in panel. No external browser windows ever pop. The OS browser remains the explicit escape hatch via *open in browser ↗*.
- **Stage-retry slash commands** — `/redraft → /renarrate → /recompose → /rerender` cascade left-to-right, so a tweak high in the pipeline invalidates everything downstream.
- **Composio design system** — pitch-black canvas, white-opacity hairline borders, rationed Electric Cyan / Composio Cobalt accents. Dual-font identity: geometric sans + JetBrains Mono. See [`DESIGN.md`](DESIGN.md).
- **Resilient render path** — rendered MP4s are post-processed into Chromium-safe profiles, with a one-click *fix codec* recovery for files that arrived encoded outside the safe set.
- **Custom `studio-media://` protocol** — the renderer streams arbitrary local files through Electron without exposing the filesystem to the renderer process.
- **Type-safe IPC bridge** — every renderer ↔ main call is defined once in `electron/types.ts` and consumed identically on both sides.

## Stack

| Layer        | Tech                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| Shell        | [Electron 33](https://www.electronjs.org), TypeScript                                         |
| Renderer     | [React 19](https://react.dev), [Vite 8](https://vite.dev), [Tailwind 4](https://tailwindcss.com) |
| Agent        | [Claude Agent SDK](https://docs.anthropic.com/claude/docs/agent-sdk) (Opus 4.7 · 1M context)  |
| Composition  | [HyperFrames](https://github.com/heygen-com/hyperframes) HTML compositions, GSAP timelines    |
| Rendering    | HyperFrames render → FFmpeg post-process (H.264 / `yuv420p`)                                  |
| Audio        | [Kokoro TTS](https://github.com/hexgrad/kokoro) — local, on-device narration (no API key, no metering) |
| Packaging    | [electron-builder](https://www.electron.build) — Windows, macOS, Linux                        |

## Getting started

### Prerequisites

- **Node.js ≥ 22**
- **pnpm ≥ 9** — `npm i -g pnpm`
- **FFmpeg** on `PATH` — required by HyperFrames render and the post-process step
- An **Anthropic API key** for the Claude Agent SDK
- **Kokoro TTS** runs locally — no extra API key needed for narration. The first run downloads the voice model (~330 MB) once and caches it.

### Install & run

```bash
git clone https://github.com/hallelx2/video-studio.git
cd video-studio
pnpm install
pnpm dev
```

`pnpm dev` boots four concurrent processes (Vite, agent watch, electron tsc watch, electron run) and opens the studio window. Settings → API keys when you first launch.

### Bundle for distribution

```bash
pnpm bundle:win     # Windows nsis installer + portable
pnpm bundle:mac     # macOS dmg
pnpm bundle:linux   # AppImage + deb
pnpm bundle         # current platform only
```

Artifacts land in `dist-electron/`.

## Repository layout

```
video-studio/
├── electron/             main / preload / agent bridge / config / IPC types
├── agent/                @video-studio/agent — runs the Claude Agent SDK loop
├── src/                  renderer (React 19 + Vite + Tailwind)
│   ├── components/agent  ActivityStream, InlineApproval, PreviewPanel, …
│   ├── components/ui     design-system primitives
│   ├── lib               preview-context, agent-client, media-url
│   └── routes            Home, Workbench, Projects, Settings, Onboarding
├── scripts/              one-off codemods + dev launchers
├── composio/             upstream design-system reference
├── DESIGN.md             design system spec — single source of truth
└── .github/workflows/    release-please + cross-platform build jobs
```

## Conventions

- **Conventional commits** — `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`. Release-please consumes these to compute the next version and write `CHANGELOG.md`.
- **Design tokens first** — never hardcode a color or spacing value in a component. If a token is missing, add it to `src/index.css` and document it in `DESIGN.md` first.
- **Type-safe IPC** — every new IPC method goes through `StudioBridge` in `electron/types.ts` and is exposed in `electron/preload.ts`.
- **Comments earn their keep** — only when *why* is non-obvious. Don't restate what the code already says.

## Releases

Releases are managed by [release-please](https://github.com/googleapis/release-please). Every push to `main` either:

1. **Opens / updates a release PR** with the next version, an entry-by-entry changelog, and a manifest bump — driven entirely by the conventional-commit subjects since the last tag.
2. **On merge of that PR**, tags `vX.Y.Z`, drafts a GitHub Release, and the cross-platform build workflow attaches Windows / macOS / Linux installers as release assets.

You don't bump `package.json` by hand — release-please does it.

## License

MIT © Halleluyah Oludele. See [LICENSE](LICENSE).

---

<sub>Built with [Claude Code](https://claude.com/claude-code) ✺ Co-authored by Claude Opus 4.7 (1M context).</sub>
