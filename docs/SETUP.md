# Video Studio — Setup Checklist

One-time setup to run the app for the first time.

## 1. Prerequisites

Install these if you don't already have them:

| Tool | Install command | Why |
|---|---|---|
| Node 20+ | Use `fnm` / `nvm` | agent sidecar + Vite |
| pnpm 9.15+ | `corepack enable && corepack prepare pnpm@9.15.0 --activate` | workspace manager |
| Rust toolchain | https://rustup.rs | Tauri backend |
| Tauri 2 OS deps | https://tauri.app/start/prerequisites | WebView2 on Windows, etc. |
| Claude Code CLI | `npm i -g @anthropic-ai/claude-code` | subscription auth |
| FFmpeg | https://ffmpeg.org/download.html | post-processing |

Once the Claude Code CLI is installed, run:

```bash
claude login
```

This opens a browser, you sign in, and it persists credentials at `~/.claude/`. The video-studio agent reads those credentials automatically.

## 2. Clone-and-run

```bash
cd C:\Users\HomePC\Documents\organisation-projects\video-studio

# Install root + agent + studio workspaces
pnpm install

# Copy env template and fill in your keys
cp .env.example .env
# Edit .env: set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID at minimum

# Build the agent sidecar (compiles TypeScript → agent/dist/)
pnpm agent:build

# Launch the desktop app
pnpm dev
```

First `pnpm dev` takes ~2–5 minutes because Cargo compiles Tauri 2 + all Rust deps. Subsequent runs are 5–10 seconds.

## 3. First generation

1. App opens showing the project picker. It reads `ORG_PROJECTS_PATH` and lists every folder that has a README.md.
2. Click **Vectorless**.
3. Formats default to `linkedin` + `x`. Toggle as desired.
4. Click **Generate video**.
5. The agent streams progress into the right pane. Watch it read the README, draft the script, then pause.
6. When the agent emits a `script-approval` prompt, read the scenes and click **approve** (or **edit** to reject and iterate).
7. The agent generates voiceover via ElevenLabs (~30s), writes the composition, and renders each format (~2–5 min per format depending on your machine).
8. Output lands in `studio/output/vectorless/launch-hero-linkedin.mp4` etc.

## 4. Directory map after first run

```
studio/
├── src/
│   ├── Root.tsx                              ← agent appended a <Folder name="vectorless">
│   └── compositions/
│       └── vectorless/
│           ├── launch-hero.script.ts         ← agent wrote this
│           └── launch-hero.tsx               ← agent wrote this
└── public/
    ├── audio/vectorless/launch-hero/
    │   ├── 01-hook.mp3                       ← ElevenLabs cache
    │   ├── 01-hook.meta.json                 ← hash sidecar
    │   └── ...
    ├── manifests/vectorless/launch-hero.json ← scene durations + metadata
    └── assets/vectorless/
        ├── logo.svg                           ← you drop this
        └── screen-recordings/
            └── query-demo.mp4                 ← you drop this
```

## 5. Iterating on a video

**Change the narration for one scene:**
1. Edit `studio/src/compositions/<product>/<comp>.script.ts`
2. In the app, click **Re-render** — the agent detects the hash change and only regenerates that one audio file

**Add a screen recording:**
1. Drop `yourfile.mp4` into `studio/public/assets/<product>/screen-recordings/`
2. Reference it by filename in your script as `{ component: "ScreenRecording", props: { src: "assets/<product>/screen-recordings/yourfile.mp4" } }`
3. Re-render

**Swap the voice:**
1. Change `ELEVENLABS_VOICE_ID` in `.env`, OR add a `voiceId` override to the product entry in `studio/src/lib/brands.ts`
2. Delete the cached MP3s for that product: `rm -rf studio/public/audio/<product>/`
3. Re-render

## 6. Troubleshooting

**"agent sidecar not found"**
→ Run `pnpm agent:build` before `pnpm dev`.

**"claude command not found" inside the agent**
→ The Agent SDK falls back to `ANTHROPIC_API_KEY` if `claude` isn't on PATH. Install and `claude login` first.

**Tauri window opens but stays blank**
→ Check the devtools (Ctrl+Shift+I in debug builds). If you see "failed to connect to localhost:5173", the Vite dev server isn't running. `pnpm frontend:dev` in a separate terminal.

**Remotion render hangs at 0%**
→ First render downloads headless Chromium (~200 MB). Give it a few minutes. Check `studio/node_modules/puppeteer/` exists.

**ElevenLabs returns 401**
→ Double-check `ELEVENLABS_API_KEY` in `.env`, restart the app. The agent reads env at spawn time, not hot-reload.

**Font not loading ("Geist" not found)**
→ `@remotion/google-fonts/Geist` should handle it automatically. If it doesn't, run `pnpm --filter @video-studio/studio install` again.

## 7. What's NOT in v0.1

The following are deferred to v0.2+:
- Per-scene regeneration UI (current flow re-runs the whole video)
- Multi-product dashboard (only one project at a time)
- Custom brand themes beyond `brands.ts`
- Video preview player inside the app (it opens the file with the OS default player for now)
- Bundled `.msi` / `.dmg` distribution (run from `pnpm dev` only)
- Multi-agent / parallel render queue
- GPU-accelerated rendering

Good enough to produce launch-week videos for vectorless and coursify. Iterate from there.
