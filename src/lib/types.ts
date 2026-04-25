export interface ProductInfo {
  id: string;
  name: string;
  path: string;
  has_readme: boolean;
  has_launch_post: boolean;
  description: string | null;
}

export type VideoFormat = "linkedin" | "x" | "youtube" | "youtube-short" | "hero" | "pitch";

export interface AppConfig {
  org_projects_path: string | null;
  obsidian_outreach_path: string | null;
  studio_path: string | null;
  tts_voice: string | null;
  default_formats: VideoFormat[];
  onboarding_complete: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  org_projects_path: null,
  obsidian_outreach_path: null,
  studio_path: null,
  tts_voice: "en-US-AndrewNeural",
  default_formats: ["linkedin", "x"],
  onboarding_complete: false,
};

export interface AgentEvent {
  type:
    | "progress"
    | "prompt"
    | "error"
    | "result"
    | "agent_text"
    | "agent_log"
    | "agent_tool_use"
    | "agent_tool_result"
    | "agent_result"
    | "raw";
  // progress
  phase?: string;
  message?: string;
  progress?: number;
  // prompt
  id?: string;
  question?: string;
  options?: string[];
  payload?: Record<string, unknown>;
  // error
  scope?: string;
  recoverable?: boolean;
  // result
  status?: "success" | "needs_input" | "failed";
  artifacts?: {
    scriptPath?: string;
    manifestPath?: string;
    outputs?: Array<{ format: string; path: string }>;
    warnings?: string[];
  };
  // agent_text / agent_tool_*
  text?: string;
  tool?: string;
  input?: unknown;
  isError?: boolean;
}

export const VOICE_OPTIONS: Array<{ id: string; label: string; description: string }> = [
  { id: "en-US-AndrewNeural", label: "Andrew (US)", description: "Warm male, conversational" },
  { id: "en-US-AriaNeural", label: "Aria (US)", description: "Clear female, neutral" },
  { id: "en-US-ChristopherNeural", label: "Christopher (US)", description: "Deep male, authoritative" },
  { id: "en-US-EricNeural", label: "Eric (US)", description: "Mature male, serious" },
  { id: "en-US-JennyNeural", label: "Jenny (US)", description: "Warm female, friendly" },
  { id: "en-GB-RyanNeural", label: "Ryan (UK)", description: "British male, calm" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK)", description: "British female, professional" },
];

export const FORMAT_OPTIONS: Array<{ id: VideoFormat; label: string; aspect: string; description: string }> = [
  { id: "linkedin", label: "LinkedIn Square", aspect: "1:1 · 1080×1080", description: "Professional feed, sound-off" },
  { id: "x", label: "X / Twitter", aspect: "16:9 · 1920×1080", description: "Founder thread, sound-on" },
  { id: "youtube", label: "YouTube", aspect: "16:9 · 1920×1080", description: "Long-form, sound-on" },
  { id: "youtube-short", label: "YouTube Short", aspect: "9:16 · 1080×1920", description: "Mobile vertical" },
  { id: "hero", label: "Website Hero", aspect: "16:9 · loop", description: "Landing page autoplay" },
  { id: "pitch", label: "Investor Pitch", aspect: "16:9 · 1920×1080", description: "Decks, partner intros" },
];
