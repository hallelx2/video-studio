import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Folder, Mic, Sparkles, Check } from "lucide-react";
import { getConfig, pickFolder, saveConfig } from "../lib/agent-client.js";
import { DEFAULT_CONFIG, VOICE_OPTIONS } from "../lib/types.js";
import { cn } from "../lib/cn.js";

type Step = "welcome" | "projects" | "outreach" | "voice" | "done";

export function OnboardingRoute() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [orgPath, setOrgPath] = useState<string | null>(null);
  const [outreachPath, setOutreachPath] = useState<string | null>(null);
  const [voice, setVoice] = useState<string>("en-US-AndrewNeural");
  const [saving, setSaving] = useState(false);

  const handlePickProjects = async () => {
    const path = await pickFolder("Pick the folder that contains your product repos");
    if (path) setOrgPath(path);
  };

  const handlePickOutreach = async () => {
    const path = await pickFolder("Pick your obsidian outreach folder (optional)");
    if (path) setOutreachPath(path);
  };

  const handleFinish = async () => {
    if (!orgPath) return;
    setSaving(true);
    try {
      const existing = await getConfig().catch(() => DEFAULT_CONFIG);
      await saveConfig({
        ...DEFAULT_CONFIG,
        ...existing,
        org_projects_path: orgPath,
        obsidian_outreach_path: outreachPath,
        tts_voice: voice,
        onboarding_complete: true,
      });
      navigate("/", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950 p-12">
      <div className="w-full max-w-2xl">
        <div className="mb-12 flex items-center gap-3">
          {(["welcome", "projects", "outreach", "voice"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium transition",
                  step === s
                    ? "border-blue-500 bg-blue-500 text-white"
                    : isStepDone(step, s)
                      ? "border-blue-500/30 bg-blue-500/20 text-blue-300"
                      : "border-zinc-800 bg-zinc-950 text-zinc-600"
                )}
              >
                {isStepDone(step, s) ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < 3 && (
                <div
                  className={cn(
                    "h-px w-8 transition",
                    isStepDone(step, s) ? "bg-blue-500/40" : "bg-zinc-900"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {step === "welcome" && (
          <Card>
            <Eyebrow icon={<Sparkles className="h-3.5 w-3.5" />}>Welcome</Eyebrow>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Video Studio</h1>
            <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-400">
              An agent-driven video studio that turns your product README into launch-ready videos.
              No API keys, no billing — just your local Claude subscription and free edge-tts voices.
            </p>
            <p className="mt-6 max-w-md text-sm text-zinc-500">
              Three quick questions and we'll get you set up.
            </p>
            <PrimaryButton onClick={() => setStep("projects")}>
              Get started <ArrowRight className="ml-1 h-4 w-4" />
            </PrimaryButton>
          </Card>
        )}

        {step === "projects" && (
          <Card>
            <Eyebrow icon={<Folder className="h-3.5 w-3.5" />}>Step 1 of 3 · Required</Eyebrow>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Where are your projects?</h1>
            <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-400">
              Pick the folder that contains your product repositories. Video Studio scans it for
              folders with a README.md or package.json and treats each one as a product you can generate videos for.
            </p>
            <div className="mt-8">
              <button
                onClick={handlePickProjects}
                className="flex w-full items-start gap-4 rounded-xl border border-zinc-900 bg-zinc-950/50 p-5 text-left transition hover:border-zinc-700 hover:bg-zinc-900/40"
              >
                <Folder className="mt-1 h-5 w-5 shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-200">
                    {orgPath ? "Selected folder" : "Choose folder..."}
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-zinc-500">
                    {orgPath ?? "Click to open the native folder picker"}
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-8 flex justify-between">
              <SecondaryButton onClick={() => setStep("welcome")}>Back</SecondaryButton>
              <PrimaryButton onClick={() => setStep("outreach")} disabled={!orgPath}>
                Next <ArrowRight className="ml-1 h-4 w-4" />
              </PrimaryButton>
            </div>
          </Card>
        )}

        {step === "outreach" && (
          <Card>
            <Eyebrow icon={<Folder className="h-3.5 w-3.5" />}>Step 2 of 3 · Optional</Eyebrow>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Voice references?</h1>
            <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-400">
              If you keep launch posts in obsidian, point us at the outreach folder. The agent reads
              <code className="mx-1 rounded bg-zinc-900 px-1 py-0.5 font-mono text-xs">
                outreach/{"<product>"}/posts/01-launch-day-founder-post.md
              </code>
              as a voice reference when drafting scripts.
            </p>
            <div className="mt-8">
              <button
                onClick={handlePickOutreach}
                className="flex w-full items-start gap-4 rounded-xl border border-zinc-900 bg-zinc-950/50 p-5 text-left transition hover:border-zinc-700 hover:bg-zinc-900/40"
              >
                <Folder className="mt-1 h-5 w-5 shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-200">
                    {outreachPath ? "Selected folder" : "Choose folder..."}
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-zinc-500">
                    {outreachPath ?? "Optional · skip if you don't have one"}
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-8 flex justify-between">
              <SecondaryButton onClick={() => setStep("projects")}>Back</SecondaryButton>
              <PrimaryButton onClick={() => setStep("voice")}>
                Next <ArrowRight className="ml-1 h-4 w-4" />
              </PrimaryButton>
            </div>
          </Card>
        )}

        {step === "voice" && (
          <Card>
            <Eyebrow icon={<Mic className="h-3.5 w-3.5" />}>Step 3 of 3 · Pick a voice</Eyebrow>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Default narrator voice</h1>
            <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-400">
              Pick the default voice for narration. You can override it per-product later in
              <code className="mx-1 rounded bg-zinc-900 px-1 py-0.5 font-mono text-xs">brands.ts</code>.
              All voices are free Microsoft Edge neural voices.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-2">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={cn(
                    "flex items-start justify-between rounded-lg border px-4 py-3 text-left transition",
                    voice === v.id
                      ? "border-blue-500/50 bg-blue-950/20"
                      : "border-zinc-900 bg-zinc-950/50 hover:border-zinc-800"
                  )}
                >
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{v.label}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">{v.description}</div>
                  </div>
                  <div className="font-mono text-[10px] text-zinc-600">{v.id}</div>
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-between">
              <SecondaryButton onClick={() => setStep("outreach")}>Back</SecondaryButton>
              <PrimaryButton onClick={handleFinish} disabled={!orgPath || saving}>
                {saving ? "Saving..." : "Finish setup"}
              </PrimaryButton>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

const STEP_ORDER: Step[] = ["welcome", "projects", "outreach", "voice", "done"];

function isStepDone(current: Step, target: Step): boolean {
  return STEP_ORDER.indexOf(current) > STEP_ORDER.indexOf(target);
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-900 bg-gradient-to-b from-zinc-950 to-zinc-950/50 p-10 shadow-2xl shadow-black/50">
      {children}
    </div>
  );
}

function Eyebrow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
      {icon}
      {children}
    </div>
  );
}

function PrimaryButton({
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
        "mt-8 inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition",
        disabled
          ? "cursor-not-allowed border-zinc-900 bg-zinc-900 text-zinc-600"
          : "border-blue-600/30 bg-blue-600 text-white hover:bg-blue-500"
      )}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-zinc-900 bg-transparent px-4 py-2 text-sm text-zinc-400 transition hover:border-zinc-800 hover:text-zinc-200"
    >
      {children}
    </button>
  );
}
