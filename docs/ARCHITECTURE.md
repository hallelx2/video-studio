# Video Studio — Architecture

## Three-process architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Tauri window (Rust + native OS webview)                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React frontend (Vite + Tailwind + shadcn)               │   │
│  │                                                          │   │
│  │  - Project picker (reads organisation-projects/)        │   │
│  │  - Workbench (generate, approve, preview, re-render)    │   │
│  │  - Live agent stream view                               │   │
│  └───────────────┬──────────────────────────────────────────┘   │
│                  │ Tauri invoke() / event channel               │
│  ┌───────────────▼──────────────────────────────────────────┐   │
│  │  Rust backend (src-tauri/)                               │   │
│  │                                                          │   │
│  │  - Spawns the agent sidecar (on-demand, per task)       │   │
│  │  - Proxies stdin/stdout between frontend and sidecar    │   │
│  │  - Reads organisation-projects/ directory               │   │
│  │  - Manages studio/ workspace paths                      │   │
│  └───────────────┬──────────────────────────────────────────┘   │
└──────────────────┼──────────────────────────────────────────────┘
                   │ stdin/stdout (JSONL)
┌──────────────────▼──────────────────────────────────────────────┐
│  Node agent sidecar (agent/dist/index.js)                        │
│                                                                  │
│  - Imports @anthropic-ai/claude-agent-sdk                        │
│  - Uses ~/.claude/ subscription auth (no API key billing)        │
│  - Auto-loads skills from ~/.claude/skills/                      │
│  - Runs the system prompt from agent/prompts/system.md           │
│  - Streams tool calls + progress back to stdout                  │
└──────────────────┬──────────────────────────────────────────────┘
                   │ spawns child processes as needed
┌──────────────────▼──────────────────────────────────────────────┐
│  Remotion CLI (short-lived, per render)                          │
│                                                                  │
│  - Runs inside studio/ workspace                                 │
│  - Renders compositions to studio/output/<product>/*.mp4         │
└──────────────────────────────────────────────────────────────────┘
```

## Why this shape

1. **Tauri instead of Electron:** 3–5 MB binary vs 150 MB. Native webview. Rust backend gives us proper process management without Node overhead in the main process.

2. **Node sidecar instead of Rust-native agent:** the Claude Agent SDK ships TypeScript-first, and the Remotion ecosystem is Node-native. Rust would fight every step.

3. **On-demand sidecar spawning:** each `generate-video` task spawns a fresh Node process. No long-running agent daemon. Simpler lifecycle, no zombie processes, crash recovery is automatic. Trade-off: ~1s cold start per task, which is fine for a multi-minute render job.

4. **Remotion CLI as a subprocess of the sidecar:** the sidecar owns the studio workspace and runs `npx remotion render` when it needs to. The Rust backend never touches Remotion directly.

5. **JSONL over stdio:** the simplest possible IPC. One JSON object per line, parsed by both the Rust backend and the frontend. No HTTP server, no named pipes, no websockets. Tauri's `Command.spawn()` returns a `Child` with stdin/stdout streams — that's all we need.

## Data flow for a single generate-video task

```
1. User clicks "Generate video for vectorless (linkedin + x)"
   → Frontend calls Tauri invoke("generate_video", { product, formats })

2. Rust spawns `node agent/dist/index.js generate-video <json-args>`
   → Agent process starts, reads system.md, loads SDK

3. Agent runs `query()` with the system prompt
   → SDK resolves ~/.claude/ auth, uses the user's subscription
   → SDK auto-mounts ~/.claude/skills/ as available tools

4. Agent reads README, drafts script (Stage 1-2)
   → Streams `{"type":"progress","phase":"reading_readme",...}` to stdout
   → Rust forwards each line to the frontend via a Tauri event

5. Agent emits `{"type":"prompt","id":"script-approval",...}` and HALTS
   → Frontend displays the script in a modal, user clicks "Approve"
   → Frontend calls Tauri invoke("respond_to_prompt", { id, response })
   → Rust writes the response to the agent's stdin as a single JSON line

6. Agent resumes Stage 3-5: voiceover, composition, render
   → Each phase streams progress
   → Final `{"type":"result","status":"success",...}` message

7. Rust captures the result, sends to frontend
   → Frontend shows the MP4 preview, render button
```

## File ownership

| Path | Owned by | Written by |
|---|---|---|
| `src-tauri/` | Rust | developer (you) |
| `src/` | Frontend | developer (you) |
| `agent/src/` | Sidecar code | developer (you) |
| `agent/prompts/` | Agent brain | developer (you) — treat as source code |
| `studio/src/scenes/` | Scene library | developer (you, with skill help) |
| `studio/src/lib/` | Pipeline helpers | developer (you) |
| `studio/src/compositions/<product>/` | **Agent** | the agent writes these per product |
| `studio/public/audio/<product>/` | **Agent** | cached ElevenLabs MP3s |
| `studio/public/manifests/<product>/` | **Agent** | per-composition metadata |
| `studio/public/assets/<product>/` | User | you drop screen recordings / logos here |
| `studio/output/<product>/` | Agent (final artifacts) | rendered MP4s |

## Security posture

- The agent runs with `permissionMode: "bypassPermissions"` because this is a trusted desktop app you run yourself. Do NOT copy this pattern into a multi-user server.
- The ElevenLabs API key lives in `.env`, which is in `.gitignore`. It is passed to the sidecar via environment variable, never persisted in source.
- The agent has file-system write access ONLY to `studio/` — the system prompt tells it so, but this is enforced by convention, not by sandbox. If you want true enforcement, wrap the sidecar in a Tauri shell command with a restricted `cwd` and set `allowedTools` to exclude `Bash` for non-render tasks.
- The agent has read-only access to `organisation-projects/` and `obsidian/` via explicit paths in the system prompt.

## Extension points

- **Add a new product:** drop assets in `studio/public/assets/<product>/`, add an entry to `studio/src/lib/brands.ts`, run a generate task.
- **Add a new format:** add an entry to `studio/src/lib/formats.ts` with dimensions and target duration; update scene components to read the new `format` prop value.
- **Add a new scene component:** create `studio/src/scenes/YourScene.tsx`, export from `studio/src/scenes/registry.ts`, reference by name in script files.
- **Replace ElevenLabs with Resemble.ai:** swap the voice stage — load `remotion-resemble-ai` skill instead of `elevenlabs-remotion`. The rest of the pipeline is unchanged.
- **Add a custom MCP server:** pass it to the Agent SDK's `mcpServers` option in `agent/src/claude.ts`.
