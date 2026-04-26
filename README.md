# Video Studio

> **Atelier Noir** — an agent-driven desktop video studio.
> Built on **Electron + Claude Agent SDK + HyperFrames + Kokoro TTS**.
> Uses your local Claude subscription. No API keys. No TTS billing. No vendor lock.

<p align="center">
  <img src="build/icon.png" width="160" alt="Video Studio app icon — lens-and-play monogram on deep ink"/>
</p>

---

## Why this exists

You already have a Claude subscription. You already have folders full of projects worth filming. You don't want to pay another vendor for renders, narration, or "AI video" credits — and you don't want a black-box product that hides what the model is doing.

**Video Studio** is a desktop app that watches your project folder, drives an agent through a transparent multi-stage pipeline, and lets you intervene at any point. The agent reads your README, drafts a script in your voice, narrates with a free local TTS, composes an HTML+GSAP scene tree, and renders MP4s — and you see every tool call as it happens.

## What's in the box

- **Agentic chat UI** — every message, every tool call, every reasoning trace is a part of the event log. Nothing is wiped between runs. Pure event-sourced state, Hypatia-style.
- **Sessions per project** — ChatGPT/NotebookLM-style sidebar; sessions persist as JSON in `<userData>/sessions/<projectId>/<sessionId>.json`.
- **Home + Playground** — a greeting page with recent sessions and a Playground mode that runs the same workbench without any source project.
- **Six video archetypes** — Hackathon · Product Launch · Explainer · Tutorial · Storyline · Custom — each with a stage-tuned scene plan.
- **Inline approval gates** — the agent pauses for your sign-off on the script and the composition, with a revision loop. Clarification questions render as their own brass-bordered card.
- **Persona system** — Founder · Engineer · Educator · Marketer · Conversational (podcast/duo) — appended to the system prompt before each run.
- **Model picker** — Opus 4.7 / Sonnet 4.5 / Haiku, switched per session.
- **Atelier Noir + Atelier Crème** — full dark + light themes, switched live.
- **Native menu + zoom** — `⌘+` / `⌘-` / `⌘0` zoom, `⌘N` new session, `⌘K` global search, `⌘.` cancel.
- **System health check** — Settings page detects Claude CLI, login, Node, FFmpeg, HyperFrames, and Git on demand.
- **OS notifications** — fires when the window is unfocused so long renders don't get stranded.
- **Inline preview iframe** — renders open in an embedded `<iframe>` pinned to the artifact panel, so you can scrub a composition without leaving the app.
- **Branded icon + chrome** — lens-and-play monogram, custom title bar, no leftover Electron defaults.

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Desktop shell | **Electron 33** | CommonJS main, ESM renderer + agent |
| UI | **React 19 + Vite 8 + Tailwind v4** | CSS variables via `@theme`, `data-theme` switches Noir/Crème |
| Routing | **react-router-dom 7** (hash) | Required for `file://` in packaged builds |
| Agent | **Claude Agent SDK** in a Node child process | NDJSON over stdio |
| Video engine | **HyperFrames** | HTML + GSAP → MP4 |
| TTS | **Kokoro-82M** via `npx hyperframes tts` | Free, offline, no billing |
| Icons | hand-rolled SVGs in `src/components/icons/` + `lucide-react` fallbacks | |
| Visual identity | **`DESIGN.md`** | Hard gate for both UI and video output |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Electron BrowserWindow (icon: build/icon.png)                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  React renderer (Vite)                                     │ │
│  │  Routes: / Home   /projects   /project/:id   /playground   │ │
│  │          /settings   /onboarding                           │ │
│  │  Shell: TopChrome · SearchPalette · grain overlay          │ │
│  │  Workbench: SessionSidebar · ActivityStream · ArtifactPanel│ │
│  │  Composer:  ModelPicker · PersonaPicker · slash menu       │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │ window.studio.* (typed contextBridge)    │
│  ┌────────────────────▼───────────────────────────────────────┐ │
│  │  Electron main (CJS)                                       │ │
│  │  · agent-bridge: spawn agent, parse NDJSON, fire OS notif  │ │
│  │  · session-store: per-project JSON event logs              │ │
│  │  · projects:     scan organisation-projects/               │ │
│  │  · system-checks: detect Claude/Node/FFmpeg/HF/Git/auth    │ │
│  │  · app-menu:     File/Edit/View/Window + zoom accelerators │ │
│  └────────────────────┬───────────────────────────────────────┘ │
└────────────────────────┼─────────────────────────────────────────┘
                         │ child_process + stdio (NDJSON)
┌────────────────────────▼─────────────────────────────────────────┐
│  Node agent (agent/dist/index.js)                                │
│  · @anthropic-ai/claude-agent-sdk against ~/.claude/ login       │
│  · Persona voicePrompt appended to agent/prompts/system.md       │
│  · Six-stage pipeline:                                           │
│      1. Read source + DESIGN.md (or skip in Playground)          │
│      2. Draft script → APPROVAL GATE (revision loop)             │
│      3. Generate narration (Kokoro)                              │
│      4. Compose HyperFrames scene tree                           │
│      5. Compose-approval gate (optional)                         │
│      6. Lint + validate contrast + render MP4 per format         │
└──────────────────────────────────────────────────────────────────┘
```

State in the renderer is **derived** — there is no parallel mutable model. The event log is the truth; everything you see (sessions, stage timeline, run metrics, terminal indicators) is computed from `events` via `deriveAgentState()`. New runs **append** to the log, never replace.

## The three modes

| Mode | When to use | Source |
|---|---|---|
| **Home** (`/`) | Landing — greeting, recent sessions, browse projects | — |
| **Project Workbench** (`/project/:id`) | You have a real project (README + assets); produce on-brand videos | `organisation-projects/<id>/` |
| **Playground** (`/playground`) | Quick demo, exploration, or a video idea with no parent project | none — agent runs without source reads |

The Playground is the same Workbench component with `projectIdOverride="__playground__"`. The agent's stage 1 detects the sentinel and skips source-file reads.

## Sessions

Each project (and Playground) keeps a list of sessions in `<userData>/sessions/<projectId>/`. A session is a JSON file with:

- `meta` — title, createdAt, updatedAt, scaffold (model, persona, video type, formats)
- `events` — the full append-only event log

Sessions appear in the left rail grouped by recency (Today / Yesterday / Last 7 days / Older). Click to load the full log, rename in place, or delete.

## Personas

Personas are voice overlays that get appended to the agent's system prompt before each run.

| Persona | Voice |
|---|---|
| **Founder** (default) | First-person product-launch narrator. Confident, slightly scrappy. |
| **Engineer** | Precise, mechanism-first. Fewer adjectives, more specifics. |
| **Educator** | Friendly explainer. Defines jargon. Builds intuition. |
| **Marketer** | Outcome-led. Hook → stakes → proof → CTA. |
| **Conversational** | Two-host podcast cadence. Banter, callbacks, "well, actually" beats. |

Pick one per session via the picker in the composer.

## Models

| Model | Use when |
|---|---|
| **Opus 4.7** (default) | First draft of a complex narrative; long reasoning windows; revisions |
| **Sonnet 4.5** | Day-to-day; faster than Opus, still solid for most scripts |
| **Haiku** | Quick edits, voice tweaks, "rerun the last step" |

Switch via the model picker in the composer.

## Themes

The full UI is themable via CSS variables and a single `data-theme` attribute on `<html>`.

- **Atelier Noir** (default) — deep ink canvas, brass + cinnabar accents, cream paper
- **Atelier Crème** — paper canvas, brass strokes, ink type, same cinnabar accent

Toggle from the top chrome (sun/moon button) or from Settings.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘N` / `Ctrl+N` | New session |
| `⌘K` / `Ctrl+K` | Global search palette |
| `⌘+` / `Ctrl+=` | Zoom in |
| `⌘-` / `Ctrl+-` | Zoom out |
| `⌘0` / `Ctrl+0` | Reset zoom |
| `⌘.` / `Ctrl+.` | Cancel running agent |
| `Esc` | Close palette / dismiss menu |
| `/` (in composer) | Open slash command menu |

## Approval flow

Long-running runs pause for your sign-off at deterministic points:

1. **Script approval** — after the script is drafted. Approve, edit inline, or send revision notes (up to 5 rounds).
2. **Compose approval** *(optional, configurable per scaffold)* — after the HyperFrames composition is authored, before render. Inspect, then approve / revise.
3. **Clarification cards** — at any point the agent can render a brass-bordered question card if it doesn't have enough information. You answer in the card; the run resumes.

All approvals route through `agent:respond` with a stable `promptId` — you can have multiple gates outstanding without ambiguity.

## Settings

The Settings page is split into twelve sections. All write to `<userData>/config.json` and live-apply where reasonable (theme, notifications, runtime).

| Section | What you control |
|---|---|
| System status | Run health checks for Claude CLI, login, Node, FFmpeg, HyperFrames, Git |
| Profile | Display name on Home greeting |
| Theme | Noir / Crème |
| Folders | `organisation-projects/` path, workspace path, output override |
| Runtime | Agent runtime (`claude-code` today; `codex` / `cursor-cli` stubs) |
| Model | Default model per session |
| Persona | Default persona |
| Voice | Default Kokoro voice |
| Video type | Default archetype |
| Render preferences | Quality (draft/standard/high) + FPS (24/30/60) |
| Notifications | OS-level notifications when window unfocused |
| Advanced | Preview iframe port, reset to defaults |

## Prerequisites

- **Node 20+** — `corepack enable && corepack prepare pnpm@9.15.0 --activate`
- **FFmpeg** — required by HyperFrames render. https://ffmpeg.org/download.html
- **Claude Code CLI** — `npm i -g @anthropic-ai/claude-code` then `claude login` once
- *(optional)* **Git** — surfaced in system checks; nice to have for project hygiene

That's it. No Rust, no Bun, no API keys, no billing surface, no cloud.

## First-time setup

```powershell
cd C:\Users\HomePC\Documents\organisation-projects\video-studio
pnpm install
pnpm dev
```

`pnpm dev` runs Vite + the Electron main process + a TS watcher concurrently. First launch downloads the Electron binary (~100 MB).

The first time you launch, Onboarding asks for your projects folder. After that, you land on Home with a greeting and a Recent panel.

## Daily use

```powershell
pnpm dev
```

1. Pick a project from Home (or jump to Playground)
2. Open or create a session
3. Set model / persona / video type via the composer
4. Type a brief — or hit a video-type pill to seed it
5. Watch the agent stream
6. Approve the script when prompted
7. (Optional) Approve the composition
8. Preview rendered MP4s in the embedded iframe or open the workspace folder

## Building installers

```powershell
pnpm bundle           # current OS
pnpm bundle:win       # Windows .exe (NSIS)
pnpm bundle:mac       # macOS .dmg
pnpm bundle:linux     # Linux AppImage
```

`pnpm bundle` runs `pnpm build && pnpm build:icon && electron-builder`. The icon step regenerates `build/icon.png` (and the size variants under `build/icons/`) from `build/icon.svg` so the .exe / .icns / Linux PNG set is always fresh.

Output lands in `dist/installers/`.

## Repo layout

```
video-studio/
├── DESIGN.md                       ← Atelier Noir spec (UI + video aesthetic)
├── README.md                       ← this file
├── build/
│   ├── icon.svg                    ← lens-and-play monogram source
│   ├── icon.png                    ← 1024×1024 generated by scripts/build-icon.mjs
│   └── icons/<size>x<size>.png     ← Linux size variants
├── scripts/
│   ├── build-icon.mjs              ← sharp-based SVG → PNG fan-out
│   └── dev-electron.mjs            ← dev auto-restart with Windows-safe lock handling
├── electron/                       ← main process (CommonJS)
│   ├── main.ts                     ← BrowserWindow + IPC registry
│   ├── preload.ts                  ← contextBridge: window.studio.*
│   ├── agent-bridge.ts             ← spawn agent, NDJSON, OS notifications
│   ├── session-store.ts            ← per-project session JSON files
│   ├── system-checks.ts            ← Claude/Node/FFmpeg/HF/Git probes
│   ├── app-menu.ts                 ← native File/Edit/View/Window menu
│   ├── projects.ts                 ← scan organisation-projects/
│   ├── config.ts                   ← load/save config
│   └── types.ts                    ← shared types (no electron import)
├── src/                            ← React renderer (ESM)
│   ├── App.tsx                     ← shell: TopChrome + Outlet + SearchPalette
│   ├── main.tsx                    ← hash router, route table
│   ├── routes/
│   │   ├── Home.tsx                ← greeting + recent sessions + projects
│   │   ├── Projects.tsx            ← grid of all projects
│   │   ├── Workbench.tsx           ← per-project agent UI
│   │   ├── Playground.tsx          ← workbench with no source project
│   │   ├── Onboarding.tsx          ← first-run setup
│   │   ├── Settings.tsx            ← 12-section settings page
│   │   └── ErrorBoundary.tsx
│   ├── components/
│   │   ├── ui/                     ← TopChrome, TabStrip, Pulse, Popover…
│   │   ├── agent/                  ← Composer, ActivityStream, ArtifactPanel,
│   │   │                             SessionSidebar, ModelPicker, PersonaPicker,
│   │   │                             SearchPalette, InlineApproval,
│   │   │                             StreamEndIndicator, MarkdownText, …
│   │   └── icons/                  ← hand-rolled SVG icons (Atelier set)
│   ├── lib/
│   │   ├── agent-client.ts         ← typed window.studio.* wrapper
│   │   ├── derive-agent-state.ts   ← event-log → view-model
│   │   └── types.ts                ← re-exports + UI-only types
│   └── index.css                   ← Atelier Noir + Crème tokens
└── agent/                          ← Node sidecar (Claude Agent SDK)
    ├── prompts/system.md           ← agent's master brief
    └── src/
        ├── index.ts                ← NDJSON event loop on stdio
        └── tasks/
            ├── generate-video.ts   ← six-stage orchestration
            └── …
```

## Dev loop

`pnpm dev` runs three workers under [`concurrently`](https://github.com/open-cli-tools/concurrently):

1. **`vite`** — renders `src/` on port 5173
2. **`tsc -p electron/tsconfig.json -w`** — recompiles `electron/*.ts` → `electron/dist/*.js`
3. **`scripts/dev-electron.mjs`** — watches `electron/dist/main.js`, kills + respawns Electron on every change

The auto-restart script:
- Awaits the `exit` event before respawning (Windows-safe — child processes hold a lock on the user-data dir)
- Adds a 600 ms grace period on Windows to let the lock release
- Filters Chromium DevTools `Autofill.enable` noise from stdio
- Strips `ELECTRON_RUN_AS_NODE` from the env in case it leaked from a parent shell

## Visual identity

Both the UI and the default video aesthetic are governed by [`DESIGN.md`](./DESIGN.md). The `frontend-design` skill and the `hyperframes` skill enforce it as a hard gate — every UI choice and every video composition traces back to that file.

Per-project brands fork it: if `<organisation-projects>/<project>/DESIGN.md` exists, the agent uses *that* instead. From the artifact panel you can edit a project's DESIGN.md and "save as project default" without leaving the app.

## How the agent uses your local Claude

`@anthropic-ai/claude-agent-sdk` runs **without `ANTHROPIC_API_KEY` in the environment**. The SDK auto-detects your Claude Code login at `~/.claude/` and routes requests through your Pro/Max subscription. Every tool call streams back to the renderer as a live `tool_use` / `tool_result` event.

Skills the agent loads on demand (from `~/.claude/skills/`):

- `hyperframes` + `hyperframes-cli` — composition rules and CLI commands
- HyperFrames references — `typography.md`, `transitions.md`, `motion-principles.md`, `captions.md`, `tts.md`
- `ffmpeg` — only when post-processing is needed

## Troubleshooting

| Symptom | Fix |
|---|---|
| `claude: command not found` | `npm i -g @anthropic-ai/claude-code` then `claude login` |
| Render hangs on first run | HyperFrames downloads bundled Chromium (~200 MB); be patient on first render |
| Electron won't launch | `pnpm install && pnpm rebuild electron` |
| `Lock file can not be created` (dev restart) | Old child still holding the lock — this is auto-handled by `dev-electron.mjs` ≥ this commit; wait 1 s and retry |
| `requestSingleInstanceLock is undefined` | `ELECTRON_RUN_AS_NODE=1` leaked from parent shell — open a fresh terminal |
| OS notifications never appear | Settings → Notifications → enable; on macOS, allow notifications in System Settings → Notifications → Video Studio |
| `sessions:list` IPC handler not registered | Stale `electron/dist/main.js` — kill and re-run `pnpm dev` |

## License

MIT — do what you want with it.
