/**
 * Shared types between the Electron main process and the React renderer.
 * Nothing in here imports from electron — it's safe to use in both contexts.
 */

export type VideoFormat = "linkedin" | "x" | "youtube" | "youtube-short" | "hero" | "pitch";

export type VideoType = "hackathon-demo" | "product-launch" | "tutorial" | "storyline" | "custom";

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

export interface AppConfig {
  orgProjectsPath: string | null;
  workspacePath: string | null;
  ttsVoice: string;
  defaultFormats: VideoFormat[];
  defaultVideoType: VideoType;
  onboardingComplete: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  orgProjectsPath: null,
  workspacePath: null,
  ttsVoice: "af_nova",
  defaultFormats: ["linkedin", "x"],
  defaultVideoType: "product-launch",
  onboardingComplete: false,
};

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
  videoType: VideoType;
  formats: VideoFormat[];
  /** User-supplied brief / extra direction. Optional for non-custom video types. */
  brief?: string;
}

export interface UsageInfo {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export type AgentEvent =
  /** Synthetic — injected by the renderer when the user types in the chat composer.
   *  Never emitted by the agent itself; flows through the same event log so the
   *  reducer can place it inline in the activity stream alongside agent events. */
  | {
      type: "user_message";
      text: string;
      kind: "brief" | "interrupt" | "approval-response" | "follow-up";
    }
  | { type: "progress"; phase: string; message?: string; progress?: number }
  | {
      type: "prompt";
      id: string;
      question: string;
      options?: string[];
      payload?: Record<string, unknown>;
    }
  | { type: "agent_text"; messageId?: string; text: string }
  | { type: "agent_tool_use"; id: string; tool: string; input: unknown }
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
  };
  agent: {
    generate(req: GenerateRequest): Promise<void>;
    respond(promptId: string, response: string): Promise<void>;
    cancel(): Promise<void>;
    isRunning(): Promise<boolean>;
    /** Returns an unsubscribe function. */
    onEvent(handler: (event: AgentEvent) => void): () => void;
  };
  fs: {
    /** Read a UTF-8 text file. Returns null if the file doesn't exist. */
    readText(path: string): Promise<string | null>;
    /** Atomically write UTF-8 text to a file. Creates parent dirs. */
    writeText(path: string, content: string): Promise<void>;
  };
  dialog: {
    pickFolder(title?: string): Promise<string | null>;
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
  };
}

declare global {
  interface Window {
    studio: StudioBridge;
  }
}
