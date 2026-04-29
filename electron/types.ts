/**
 * Shared types between the Electron main process and the React renderer.
 * Nothing in here imports from electron — it's safe to use in both contexts.
 */

export type VideoFormat = "linkedin" | "x" | "youtube" | "youtube-short" | "hero" | "pitch";

export type VideoType =
  | "hackathon-demo"
  | "product-launch"
  | "explainer"
  | "tutorial"
  | "storyline"
  | "custom";

export interface VideoTypeOption {
  id: VideoType;
  label: string;
  description: string;
  /** Default scene count the agent should target. */
  defaultScenes: number;
  /** Default duration target in seconds. */
  defaultDuration: number;
}

export const VIDEO_TYPES: VideoTypeOption[] = [
  {
    id: "hackathon-demo",
    label: "Hackathon Demo",
    description: "Punchy 60-90s build narrative — problem → solution → demo → impact.",
    defaultScenes: 5,
    defaultDuration: 75,
  },
  {
    id: "product-launch",
    label: "Product Launch",
    description: "Six-act SaaS launch arc — hook, stakes, reveal, proof, mechanism, CTA.",
    defaultScenes: 6,
    defaultDuration: 90,
  },
  {
    id: "explainer",
    label: "Explainer",
    description: "Concept walkthrough — problem, reframe, mechanism, why it matters.",
    defaultScenes: 5,
    defaultDuration: 75,
  },
  {
    id: "tutorial",
    label: "Tutorial",
    description: "Step-by-step walkthrough with screen captures and labelled callouts.",
    defaultScenes: 7,
    defaultDuration: 180,
  },
  {
    id: "storyline",
    label: "Storyline",
    description: "Narrative-led — character / pain / journey / payoff. Cinematic pacing.",
    defaultScenes: 5,
    defaultDuration: 120,
  },
  {
    id: "custom",
    label: "Custom",
    description: "User-supplied brief. The agent designs the structure from your prompt.",
    defaultScenes: 6,
    defaultDuration: 90,
  },
];

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  hasReadme: boolean;
  hasLaunchPost: boolean;
  hasDesignDoc: boolean;
  description: string | null;
}

export type ThemeId = "noir" | "creme";

/**
 * Agent runtime — the binary that drives the agent loop.
 * Today only `claude-code` is implemented. The other ids are stubs so the
 * AppConfig schema, the Settings UI, and the bridge dispatch table all
 * have a place to land when Codex / Cursor support is added later.
 */
export type AgentRuntime = "claude-code" | "codex" | "cursor-cli";

export type RenderQuality = "draft" | "standard" | "high";
export type RenderFps = 24 | 30 | 60;

export interface AppConfig {
  orgProjectsPath: string | null;
  workspacePath: string | null;
  ttsVoice: string;
  defaultFormats: VideoFormat[];
  defaultVideoType: VideoType;
  /** Which agent runtime to drive the loop with. Today only claude-code is wired. */
  runtime: AgentRuntime;
  /** Model id passed to the Claude Agent SDK on every run. */
  selectedModel: string;
  /** Persona id whose voicePrompt is appended to the agent system prompt. */
  selectedPersona: string;
  /** Atelier theme — 'noir' (dark) or 'creme' (light). Default 'noir'. */
  theme: ThemeId;
  /** Render preferences passed through to `npx hyperframes render`. */
  renderQuality: RenderQuality;
  renderFps: RenderFps;
  /** Optional override for where rendered MP4s land. Defaults to workspace/<project>/output. */
  outputDirectory: string | null;
  /** Port the HyperFrames preview dev server binds to. */
  previewPort: number;
  /** Fire OS notifications for prompt + result + error events when window is unfocused. */
  notificationsEnabled: boolean;
  /** Optional display name for the active profile. Free text. */
  profileName: string;
  /** Absolute path to the Python interpreter that hyperframes tts (Kokoro)
   *  should use. Set when the user has multiple Pythons on PATH and the
   *  default invocation lands on the wrong one (Microsoft Store stub on
   *  Windows is the canonical case). The bridge exports this as the
   *  `PYTHON` env var AND prepends its dirname to `PATH` so anything
   *  downstream that doesn't honor `PYTHON` still sees the right binary
   *  first. Null = let the runtime auto-detect from PATH. */
  pythonBin: string | null;
  onboardingComplete: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  orgProjectsPath: null,
  workspacePath: null,
  ttsVoice: "af_nova",
  defaultFormats: ["linkedin", "x"],
  defaultVideoType: "product-launch",
  runtime: "claude-code",
  selectedModel: "claude-opus-4-7",
  selectedPersona: "founder",
  theme: "noir",
  renderQuality: "standard",
  renderFps: 30,
  outputDirectory: null,
  previewPort: 3002,
  notificationsEnabled: true,
  profileName: "Default",
  pythonBin: null,
  onboardingComplete: false,
};

/** Catalog of runtimes — used by the Settings UI to render the picker. */
export interface RuntimeOption {
  id: AgentRuntime;
  label: string;
  description: string;
  /** False until we ship support; the Settings UI greys it out + shows 'soon'. */
  available: boolean;
}

export const RUNTIME_OPTIONS: RuntimeOption[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    description: "Anthropic's Claude Code CLI + the Claude Agent SDK. Uses your local subscription auth.",
    available: true,
  },
  {
    id: "codex",
    label: "Codex",
    description: "OpenAI Codex CLI (gpt-5-codex). Requires OPENAI_API_KEY.",
    available: false,
  },
  {
    id: "cursor-cli",
    label: "Cursor CLI",
    description: "Cursor's headless agent. Requires Cursor Pro and the cursor-agent CLI.",
    available: false,
  },
];

export const RENDER_QUALITY_OPTIONS: Array<{
  id: RenderQuality;
  label: string;
  description: string;
}> = [
  { id: "draft", label: "Draft", description: "Fast, lower bitrate — for iteration." },
  { id: "standard", label: "Standard", description: "Balanced — good for review and most delivery." },
  { id: "high", label: "High", description: "Slowest, highest bitrate — final delivery." },
];

export const RENDER_FPS_OPTIONS: RenderFps[] = [24, 30, 60];

/** Models the user can pick. The first id is the default. */
export interface ModelOption {
  id: string;
  family: "opus" | "sonnet" | "haiku";
  label: string;
  description: string;
  /** 1-indexed; rendered as Ctrl+N shortcut next to the row. */
  shortcut: number;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "claude-opus-4-7",
    family: "opus",
    label: "Claude Opus 4.7",
    description: "Most capable. Best reasoning, slowest, highest cost.",
    shortcut: 1,
  },
  {
    id: "claude-opus-4-6",
    family: "opus",
    label: "Claude Opus 4.6",
    description: "Prior Opus generation. Stable, well-tuned.",
    shortcut: 2,
  },
  {
    id: "claude-opus-4-5",
    family: "opus",
    label: "Claude Opus 4.5",
    description: "Older Opus. Use for cost-aware long runs.",
    shortcut: 3,
  },
  {
    id: "claude-sonnet-4-6",
    family: "sonnet",
    label: "Claude Sonnet 4.6",
    description: "Balanced. Faster than Opus, often good enough.",
    shortcut: 4,
  },
  {
    id: "claude-haiku-4-5",
    family: "haiku",
    label: "Claude Haiku 4.5",
    description: "Fastest. Use for cheap, simple jobs.",
    shortcut: 5,
  },
];

export function findModel(id: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((m) => m.id === id);
}

// ─── Personas — voice/tone overrides applied at run time ─────────────────
// Each persona prepends a small directive block to the agent's system
// prompt. 'founder' is the default (empty override — system.md already
// specifies the senior-founder voice). The other personas reshape the
// narration style without changing the pipeline structure.

export interface PersonaOption {
  id: string;
  label: string;
  description: string;
  /**
   * Block of voice instructions appended to the system prompt at run time.
   * Empty string for the default 'founder' persona — that voice is already
   * baked into agent/prompts/system.md.
   */
  voicePrompt: string;
}

export const PERSONAS: PersonaOption[] = [
  {
    id: "founder",
    label: "Founder",
    description: "Senior technical founder — contrarian hook, specific claims, no marketing-speak.",
    voicePrompt: "",
  },
  {
    id: "conversational",
    label: "Conversational",
    description: "Podcast-style dialogue. Two voices trade insight — warm, casual, back-and-forth.",
    voicePrompt: [
      "PERSONA OVERRIDE — Conversational / podcast-style dialogue.",
      "",
      "Write this video as a two-speaker conversation. Both speakers appear in every scene's narration field, prefixed with `[A]:` and `[B]:` markers (one turn per line, blank line between speakers).",
      "",
      "- Speaker A is the host: curious, asks the question that opens the scene.",
      "- Speaker B is the expert: answers with specifics, examples, the actual claim.",
      "- Keep individual turns to 1–2 sentences. 4–8 turns per scene total.",
      "- Maintain the founder voice rules (no marketing-speak, no forbidden words, specifics over generalities).",
      "- Stage 4 (TTS): generate per-speaker WAV clips. Use voice `af_bella` for A and `am_michael` for B. Each scene's manifest entry should list both clips with their speaker tag and a sequencing offset so they play in order.",
      "- Stage 5 (composition): show a small speaker label that swaps in/out as the active speaker changes — same Atelier Noir typographic palette, brass for A's label, cinnabar for B's label.",
      "- The script.json scenes array gains an optional `speakers: [{ speaker: 'A' | 'B', text: string, durationSec: number }]` field that the composition reads. Keep the legacy `narration` field too as a flat-text rollup for backward compatibility with single-voice tools.",
    ].join("\n"),
  },
  {
    id: "technical",
    label: "Technical",
    description: "Engineer-to-engineer. Precise jargon, real numbers, no hand-waving.",
    voicePrompt: [
      "PERSONA OVERRIDE — Technical / engineer-to-engineer.",
      "",
      "- Use precise terminology and tool/protocol names.",
      "- Cite real benchmarks: latency p50/p99, throughput, memory, cost figures.",
      "- Code spans (`vector_search`, `768-d embedding`) where they sharpen the claim.",
      "- Skip explanatory hand-waving — the audience is fluent.",
      "- The hook can be a contrarian engineering claim (\"O(n²) is the original sin of vector retrieval\").",
    ].join("\n"),
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Long-form magazine narrative. Slower hooks, layered sentences, room for reflection.",
    voicePrompt: [
      "PERSONA OVERRIDE — Editorial / long-form magazine.",
      "",
      "- Each scene narration runs 3–4 sentences instead of 1–2.",
      "- Use layered sentence structures — independent clauses, vivid imagery, occasional dependent clauses for rhythm.",
      "- Hook can be slower and more anticipatory; trust the viewer to wait.",
      "- Add one sentence of context before the substantive claim in each scene.",
      "- Total duration target: closer to the upper bound of the video type's duration range.",
    ].join("\n"),
  },
];

export function findPersona(id: string): PersonaOption | undefined {
  return PERSONAS.find((p) => p.id === id);
}

/** Kokoro voices shipped with HyperFrames. */
export const VOICE_OPTIONS: Array<{ id: string; label: string; description: string }> = [
  { id: "af_nova", label: "Nova (US-F)", description: "Clear, modern, neutral" },
  { id: "af_bella", label: "Bella (US-F)", description: "Warm, conversational" },
  { id: "af_sarah", label: "Sarah (US-F)", description: "Professional, measured" },
  { id: "am_adam", label: "Adam (US-M)", description: "Mature, authoritative" },
  { id: "am_michael", label: "Michael (US-M)", description: "Friendly, founder-like" },
  { id: "bf_emma", label: "Emma (UK-F)", description: "British, refined" },
  { id: "bm_george", label: "George (UK-M)", description: "British, calm" },
];

export const FORMAT_OPTIONS: Array<{ id: VideoFormat; label: string; aspect: string; description: string }> = [
  { id: "linkedin", label: "LinkedIn Square", aspect: "1:1 · 1080×1080", description: "Professional feed, sound-off" },
  { id: "x", label: "X / Twitter", aspect: "16:9 · 1920×1080", description: "Founder thread, sound-on" },
  { id: "youtube", label: "YouTube", aspect: "16:9 · 1920×1080", description: "Long-form, sound-on" },
  { id: "youtube-short", label: "YouTube Short", aspect: "9:16 · 1080×1920", description: "Mobile vertical" },
  { id: "hero", label: "Website Hero", aspect: "16:9 · loop", description: "Landing page autoplay" },
  { id: "pitch", label: "Investor Pitch", aspect: "16:9 · 1920×1080", description: "Decks, partner intros" },
];

export interface GenerateRequest {
  projectId: string;
  /** Per-session scope so each thread under a project gets its own
   *  workspace subdirectory: <workspace>/<projectId>/<sessionId>/. Without
   *  this, every session in the same project edits the same script.json /
   *  composition / renders, and the agent's resume detection picks up
   *  artifacts from a sibling session. Optional for backward compat:
   *  legacy callers fall back to the project-only path. */
  sessionId?: string;
  videoType: VideoType;
  formats: VideoFormat[];
  /** User-supplied brief / extra direction. Optional for non-custom video types. */
  brief?: string;
  /** Model id to drive the agent with. Falls back to config.selectedModel. */
  model?: string;
  /** Persona id whose voicePrompt overrides the default founder voice. */
  persona?: string;
}

export interface UsageInfo {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Semantic state names emitted by the agent on activity events. These are
 * mapped to a pool of display verbs in the renderer (one state → many
 * synonyms) so the UI can rotate "Drafting · Crafting · Polishing"
 * without the agent having to be clever about copy.
 */
export type ActivityState =
  | "reading"
  | "considering"
  | "drafting"
  | "revising"
  | "narrating"
  | "composing"
  | "rendering"
  | "polishing"
  | "stitching"
  | "waiting"
  | "retrying";

export type AgentEvent =
  /** Synthetic — injected by the renderer when the user types in the chat composer.
   *  Never emitted by the agent itself; flows through the same event log so the
   *  reducer can place it inline in the activity stream alongside agent events. */
  | {
      type: "user_message";
      text: string;
      kind: "brief" | "interrupt" | "approval-response" | "follow-up";
    }
  | {
      type: "progress";
      phase: string;
      message?: string;
      progress?: number;
      /** Optional scope: when a stage is acting on a specific scene, this
       *  threads the scene id through so the renderer's per-scene UI can
       *  pick the right card. Backward compatible — existing emit sites
       *  that don't supply it continue to work. */
      sceneId?: string;
    }
  /** Fine-grained activity events used by the renderer to surface
   *  Claude-Code-style rotating verbs ("Drafting · Pondering · Crafting")
   *  on scene cards and the active-canvas overlay. The agent emits a
   *  semantic state name; the renderer maps it through a verb pool and
   *  rotates synonyms over time. Throttled at the agent side so a
   *  long-running stage doesn't flood the IPC channel. */
  | {
      type: "activity";
      state: ActivityState;
      sceneId?: string;
      subject?: string;
    }
  | {
      type: "prompt";
      id: string;
      question: string;
      options?: string[];
      payload?: Record<string, unknown>;
    }
  | { type: "agent_text"; messageId?: string; text: string }
  | { type: "agent_tool_use"; id: string; messageId?: string; tool: string; input: unknown }
  | { type: "agent_tool_result"; id: string; isError?: boolean; text?: string }
  | { type: "agent_log"; level: string; text: string }
  | {
      type: "agent_result";
      subtype?: string;
      usage?: UsageInfo | null;
      costUsd?: number;
      durationMs?: number;
    }
  | {
      type: "result";
      status: "success" | "needs_input" | "failed";
      message?: string;
      artifacts?: {
        compositionPath?: string;
        outputs?: Array<{ format: string; path: string }>;
        warnings?: string[];
      };
    }
  | { type: "error"; scope?: string; message: string; recoverable?: boolean }
  | { type: "raw"; text: string };

/**
 * Surface exposed to the renderer via preload contextBridge as `window.studio`.
 * Every method is async — IPC is inherently asynchronous.
 */
export interface StudioBridge {
  config: {
    get(): Promise<AppConfig>;
    save(config: AppConfig): Promise<void>;
  };
  projects: {
    list(): Promise<ProjectInfo[]>;
    /** Write a project's source-of-truth DESIGN.md (lives next to the
     *  project's README in the user's organisation-projects folder).
     *  Returns the absolute path that was written. Future sessions for
     *  this project will pick this file up as the design baseline. */
    setDesignDefault(projectId: string, content: string): Promise<{ path: string }>;
  };
  agent: {
    generate(req: GenerateRequest): Promise<void>;
    respond(promptId: string, response: string): Promise<void>;
    cancel(): Promise<void>;
    isRunning(): Promise<boolean>;
    /** Returns an unsubscribe function. */
    onEvent(handler: (event: AgentEvent) => void): () => void;
    /**
     * Wipe cached pipeline artifacts for a stage so the next agent run
     * regenerates from that point. Cascades downstream:
     *   redraft   — script + narration + compositions + outputs
     *   renarrate — narration + compositions + outputs
     *   recompose — compositions + outputs
     *   rerender  — outputs only
     * Returns the file paths actually removed.
     */
    invalidateStage(
      projectId: string,
      stage: "redraft" | "renarrate" | "recompose" | "rerender"
    ): Promise<{ removed: string[] }>;
  };
  fs: {
    /** Read a UTF-8 text file. Returns null if the file doesn't exist. */
    readText(path: string): Promise<string | null>;
    /** Atomically write UTF-8 text to a file. Creates parent dirs. */
    writeText(path: string, content: string): Promise<void>;
    /** Lightweight stat probe. Never throws — missing files return exists:false. */
    stat(path: string): Promise<{
      exists: boolean;
      isFile: boolean;
      size: number;
      mtimeMs: number;
      error?: string;
    }>;
    /**
     * Transcode an MP4 in place to a strictly browser-safe profile
     * (libx264 high@4.0, yuv420p, AAC, +faststart). Lets the renderer
     * fix renders that Chromium's <video> rejects without re-running
     * the whole pipeline.
     */
    transcodeWebSafe(
      path: string
    ): Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  };
  sessions: {
    /** List sessions for a project (most recent first). */
    list(projectId: string): Promise<SessionMeta[]>;
    /** Load a single session including its event log. */
    load(projectId: string, sessionId: string): Promise<SessionFile | null>;
    /** Create a new session with the given scaffold. */
    create(
      projectId: string,
      scaffold: SessionScaffold,
      title?: string
    ): Promise<SessionFile>;
    /** Save events + scaffold to an existing session. */
    save(
      projectId: string,
      sessionId: string,
      events: AgentEvent[],
      scaffold: SessionScaffold
    ): Promise<void>;
    rename(projectId: string, sessionId: string, title: string): Promise<void>;
    delete(projectId: string, sessionId: string): Promise<void>;
  };
  dialog: {
    pickFolder(title?: string): Promise<string | null>;
    /** OS open-file dialog. Optional filters narrow the visible files
     *  (e.g. `{ name: "Executables", extensions: ["exe"] }`). */
    pickFile(args?: {
      title?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }): Promise<string | null>;
  };
  shell: {
    openPath(path: string): Promise<void>;
    revealInFolder(path: string): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
  preview: {
    /** Start the HyperFrames preview dev server in the given workspace.
     *  Returns the URL the user can open in a browser. */
    start(workspacePath: string): Promise<{ url: string }>;
    stop(): Promise<void>;
    state(): Promise<{ running: boolean; url: string | null; workspace: string | null }>;
  };
  meta: {
    appVersion(): Promise<string>;
    platform(): Promise<NodeJS.Platform>;
    /** Subscribe to native-menu commands (File > New Session, File > Search…).
     *  Returns an unsubscribe function. */
    onMenuCommand(handler: (cmd: "new-session" | "open-search") => void): () => void;
  };
  system: {
    /** Run health checks against every required tool — returns a report
     *  the Settings page renders as a status table. Slow path (~2-8s on
     *  first call, fast on cached PATH lookups), so cache from the renderer
     *  side. */
    health(): Promise<HealthReport>;
  };
}

// Re-exported from system-checks.ts via the ambient declaration below so
// the renderer can import it without reaching into Node-only code.
export interface HealthEntry {
  key: string;
  label: string;
  required: boolean;
  ok: boolean;
  version: string | null;
  path: string | null;
  note: string | null;
}

export interface HealthReport {
  checkedAt: number;
  entries: HealthEntry[];
}

// ─── Session types (shared between renderer and main) ────────────────────
// session-store.ts (Node-only) re-uses these definitions. Keeping them in
// types.ts so the renderer can import without reaching into Node-only code.

export interface SessionScaffold {
  videoType: VideoType;
  formats: VideoFormat[];
  modelId: string;
}

export interface SessionMeta {
  id: string;
  projectId: string;
  title: string;
  scaffold: SessionScaffold;
  createdAt: number;
  updatedAt: number;
  eventCount: number;
}

export interface SessionFile {
  version: number;
  meta: SessionMeta;
  events: AgentEvent[];
}

declare global {
  interface Window {
    studio: StudioBridge;
  }
}
