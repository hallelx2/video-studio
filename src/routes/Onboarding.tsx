import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getConfig, pickFolder, saveConfig } from "../lib/agent-client.js";
import { DEFAULT_CONFIG, VOICE_OPTIONS } from "../lib/types.js";
import { cn } from "../lib/cn.js";

type Step = "welcome" | "projects" | "voice";
const STEPS: Step[] = ["welcome", "projects", "voice"];

export function OnboardingRoute() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [orgPath, setOrgPath] = useState<string | null>(null);
  const [voice, setVoice] = useState<string>("af_nova");
  const [saving, setSaving] = useState(false);

  const handlePickProjects = async () => {
    const path = await pickFolder("Pick the folder that contains your product repos");
    if (path) setOrgPath(path);
  };

  const handleFinish = async () => {
    if (!orgPath) return;
    setSaving(true);
    try {
      const existing = await getConfig().catch(() => DEFAULT_CONFIG);
      await saveConfig({
        ...DEFAULT_CONFIG,
        ...existing,
        orgProjectsPath: orgPath,
        ttsVoice: voice,
        onboardingComplete: true,
      });
      navigate("/", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grain flex h-screen w-screen items-center justify-center bg-ink px-12">
      <div className="w-full max-w-2xl">
        <div className="mb-12 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "flex items-center gap-2 transition-colors",
                step === s ? "text-cinnabar" : isDone(step, s) ? "text-paper" : "text-paper-mute/80"
              )}
            >
              <span className="tabular">{String(i + 1).padStart(2, "0")}</span>
              <span>{s}</span>
              {i < STEPS.length - 1 && <span className="ml-2 text-paper-mute/40">/</span>}
            </span>
          ))}
        </div>

        {step === "welcome" && (
          <Stage>
            <Eyebrow>welcome</Eyebrow>
            <h1 className="display mt-4 text-7xl text-paper">Video Studio.</h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-paper-mute">
              An agent-driven video studio that turns any project folder into a launch-ready film.
              Local Claude. Local Kokoro. No API keys. Built around HyperFrames.
            </p>
            <Primary onClick={() => setStep("projects")}>Begin →</Primary>
          </Stage>
        )}

        {step === "projects" && (
          <Stage>
            <Eyebrow>step 01 / projects folder</Eyebrow>
            <h1 className="display-sm mt-4 text-5xl text-paper">Where do your projects live?</h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-paper-mute">
              Point us at the folder that holds your product repos. The agent treats every
              subfolder with a README or package.json as a candidate for video generation.
            </p>
            <button
              onClick={handlePickProjects}
              className="hairline mt-8 flex w-full items-start justify-between border bg-ink-raised p-5 text-left transition-colors hover:bg-ink-edge"
            >
              <span className="block text-sm font-medium text-paper">
                {orgPath ? "Selected folder" : "Choose folder…"}
              </span>
              <span className="block max-w-md truncate font-mono text-xs text-paper-mute">
                {orgPath ?? "click to open the native folder picker"}
              </span>
            </button>
            <Footer>
              <Secondary onClick={() => setStep("welcome")}>← back</Secondary>
              <Primary onClick={() => setStep("voice")} disabled={!orgPath}>
                Next →
              </Primary>
            </Footer>
          </Stage>
        )}

        {step === "voice" && (
          <Stage>
            <Eyebrow>step 02 / narrator voice</Eyebrow>
            <h1 className="display-sm mt-4 text-5xl text-paper">Pick a default narrator.</h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-paper-mute">
              Kokoro voices, built into HyperFrames. Free, offline, no API keys. Override
              per-project later if a brand wants something different.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-px border border-brass-line bg-brass-line">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={cn(
                    "flex items-center justify-between bg-ink px-5 py-4 text-left transition-colors",
                    voice === v.id ? "bg-ink-edge" : "hover:bg-ink-raised"
                  )}
                >
                  <span className="flex items-baseline gap-4">
                    {voice === v.id && <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" />}
                    <span className="text-sm font-medium text-paper">{v.label}</span>
                    <span className="text-xs text-paper-mute">{v.description}</span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-paper-mute">
                    {v.id}
                  </span>
                </button>
              ))}
            </div>
            <Footer>
              <Secondary onClick={() => setStep("projects")}>← back</Secondary>
              <Primary onClick={handleFinish} disabled={!orgPath || saving}>
                {saving ? "saving…" : "finish setup →"}
              </Primary>
            </Footer>
          </Stage>
        )}
      </div>
    </div>
  );
}

function isDone(current: Step, target: Step): boolean {
  return STEPS.indexOf(current) > STEPS.indexOf(target);
}

function Stage({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">{children}</p>
  );
}

function Primary({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "mt-10 inline-block border-b pb-1 text-sm font-medium transition-colors",
        disabled
          ? "cursor-not-allowed border-paper-mute/30 text-paper-mute/50"
          : "border-cinnabar text-cinnabar hover:text-paper"
      )}
    >
      {children}
    </button>
  );
}

function Secondary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-sm text-paper-mute transition-colors hover:text-paper"
    >
      {children}
    </button>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-10 flex items-center justify-between">{children}</div>;
}
