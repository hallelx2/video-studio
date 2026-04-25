import { useEffect, useState } from "react";
import { Folder, Mic, Save, Check, RotateCcw } from "lucide-react";
import { getConfig, pickFolder, saveConfig } from "../lib/agent-client.js";
import { DEFAULT_CONFIG, VOICE_OPTIONS, type AppConfig } from "../lib/types.js";
import { cn } from "../lib/cn.js";

export function SettingsRoute() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(DEFAULT_CONFIG));
  }, []);

  if (!config) return <div className="p-12 text-zinc-500">Loading...</div>;

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig(config);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleResetOnboarding = async () => {
    const next: AppConfig = { ...config, onboarding_complete: false };
    await saveConfig(next);
    window.location.href = "/onboarding";
  };

  const updateField = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig({ ...config, [key]: value });
  };

  const pickOrgFolder = async () => {
    const path = await pickFolder("Pick your projects folder");
    if (path) updateField("org_projects_path", path);
  };

  const pickOutreachFolder = async () => {
    const path = await pickFolder("Pick your obsidian outreach folder");
    if (path) updateField("obsidian_outreach_path", path);
  };

  const pickStudioFolder = async () => {
    const path = await pickFolder("Pick the Remotion studio workspace");
    if (path) updateField("studio_path", path);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-900 px-12 py-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">Configure your folders, voice, and defaults.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition",
            saving
              ? "cursor-not-allowed border-zinc-900 bg-zinc-900 text-zinc-600"
              : savedAt
                ? "border-green-600/30 bg-green-600/20 text-green-300"
                : "border-blue-600/30 bg-blue-600 text-white hover:bg-blue-500"
          )}
        >
          {savedAt ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {savedAt ? "Saved" : saving ? "Saving..." : "Save changes"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-12 py-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <Section
            title="Folders"
            description="Where Video Studio looks for your project repos and voice references."
            icon={<Folder className="h-4 w-4" />}
          >
            <FolderRow
              label="Projects folder"
              value={config.org_projects_path}
              required
              onPick={pickOrgFolder}
              placeholder="Required — pick the folder that contains your product repos"
            />
            <FolderRow
              label="Obsidian outreach folder"
              value={config.obsidian_outreach_path}
              onPick={pickOutreachFolder}
              placeholder="Optional — for launch-post voice references"
            />
            <FolderRow
              label="Studio workspace"
              value={config.studio_path}
              onPick={pickStudioFolder}
              placeholder="Optional — defaults to the bundled studio next to the app"
            />
          </Section>

          <Section
            title="Default narrator voice"
            description="The voice the agent uses when generating new scripts. Override per-product in brands.ts."
            icon={<Mic className="h-4 w-4" />}
          >
            <div className="grid grid-cols-1 gap-2">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => updateField("tts_voice", v.id)}
                  className={cn(
                    "flex items-start justify-between rounded-lg border px-4 py-3 text-left transition",
                    config.tts_voice === v.id
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
          </Section>

          <Section
            title="Reset"
            description="Re-run the onboarding flow. Your saved folder paths stay until you change them."
            icon={<RotateCcw className="h-4 w-4" />}
          >
            <button
              onClick={handleResetOnboarding}
              className="rounded-lg border border-zinc-900 bg-zinc-950/50 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700"
            >
              Re-run onboarding
            </button>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <div className="text-zinc-500">{icon}</div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">{title}</h2>
      </div>
      <p className="mb-5 text-sm text-zinc-500">{description}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FolderRow({
  label,
  value,
  required,
  onPick,
  placeholder,
}: {
  label: string;
  value: string | null;
  required?: boolean;
  onPick: () => void;
  placeholder: string;
}) {
  return (
    <button
      onClick={onPick}
      className="flex w-full items-start justify-between gap-4 rounded-xl border border-zinc-900 bg-zinc-950/50 p-4 text-left transition hover:border-zinc-700"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          {required && (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-blue-400">
              Required
            </span>
          )}
        </div>
        <div className="mt-1 truncate font-mono text-xs text-zinc-500">{value ?? placeholder}</div>
      </div>
      <Folder className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
    </button>
  );
}
