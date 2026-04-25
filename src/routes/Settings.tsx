import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getConfig, pickFolder, saveConfig } from "../lib/agent-client.js";
import { DEFAULT_CONFIG, VOICE_OPTIONS, VIDEO_TYPES, type AppConfig, type VideoType } from "../lib/types.js";
import { cn } from "../lib/cn.js";

export function SettingsRoute() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(DEFAULT_CONFIG));
  }, []);

  if (!config) {
    return (
      <div className="grain flex h-full items-center justify-center bg-ink">
        <span className="pulse-cinnabar h-2 w-2 rounded-full bg-cinnabar" />
      </div>
    );
  }

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

  const update = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig({ ...config, [key]: value });
  };

  const pickOrg = async () => {
    const path = await pickFolder("Pick your projects folder");
    if (path) update("orgProjectsPath", path);
  };

  const pickWorkspace = async () => {
    const path = await pickFolder("Pick the workspace where HyperFrames projects will be created");
    if (path) update("workspacePath", path);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="hairline flex items-center justify-between border-b px-12 py-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            configuration
          </p>
          <h1 className="display-sm mt-2 text-4xl text-paper">Settings</h1>
        </div>
        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm text-paper-mute transition-colors hover:text-paper">
            ← back
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "border-b pb-1 text-sm font-medium transition-colors",
              saving
                ? "cursor-not-allowed border-paper-mute/30 text-paper-mute/50"
                : savedAt
                  ? "border-paper text-paper"
                  : "border-cinnabar text-cinnabar hover:text-paper"
            )}
          >
            {savedAt ? "saved ✓" : saving ? "saving…" : "save changes →"}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-12 py-12">
        <div className="mx-auto max-w-3xl space-y-16">
          <Section eyebrow="01" title="Folders">
            <Row
              label="Projects folder"
              value={config.orgProjectsPath}
              required
              placeholder="Required — the folder that holds your product repos"
              onPick={pickOrg}
            />
            <Row
              label="Workspace"
              value={config.workspacePath}
              placeholder="Optional — where HyperFrames projects are created (defaults to app data)"
              onPick={pickWorkspace}
            />
          </Section>

          <Section eyebrow="02" title="Default narrator voice">
            <div className="grid grid-cols-1 gap-px border border-brass-line bg-brass-line">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => update("ttsVoice", v.id)}
                  className={cn(
                    "flex items-center justify-between bg-ink px-5 py-4 text-left transition-colors",
                    config.ttsVoice === v.id ? "bg-ink-edge" : "hover:bg-ink-raised"
                  )}
                >
                  <span className="flex items-baseline gap-4">
                    <span
                      className={
                        config.ttsVoice === v.id
                          ? "h-1.5 w-1.5 rounded-full bg-cinnabar"
                          : "h-1.5 w-1.5"
                      }
                    />
                    <span className="text-sm font-medium text-paper">{v.label}</span>
                    <span className="text-xs text-paper-mute">{v.description}</span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-paper-mute">
                    {v.id}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          <Section eyebrow="03" title="Default video type">
            <div className="grid grid-cols-1 gap-px border border-brass-line bg-brass-line">
              {VIDEO_TYPES.map((v) => (
                <button
                  key={v.id}
                  onClick={() => update("defaultVideoType", v.id as VideoType)}
                  className={cn(
                    "block bg-ink px-5 py-4 text-left transition-colors",
                    config.defaultVideoType === v.id ? "bg-ink-edge" : "hover:bg-ink-raised"
                  )}
                >
                  <span className="flex items-baseline justify-between">
                    <span className="flex items-baseline gap-4">
                      <span
                        className={
                          config.defaultVideoType === v.id
                            ? "h-1.5 w-1.5 rounded-full bg-cinnabar"
                            : "h-1.5 w-1.5"
                        }
                      />
                      <span className="text-sm font-medium text-paper">{v.label}</span>
                    </span>
                    <span className="font-mono text-[10px] tabular uppercase tracking-wider text-paper-mute">
                      {v.defaultScenes} scenes · {v.defaultDuration}s
                    </span>
                  </span>
                  <span className="ml-[26px] mt-1 block text-xs leading-relaxed text-paper-mute">
                    {v.description}
                  </span>
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">{eyebrow}</p>
        <h2 className="display-sm mt-2 text-2xl text-paper">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  required,
  placeholder,
  onPick,
}: {
  label: string;
  value: string | null;
  required?: boolean;
  placeholder: string;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className="hairline flex w-full items-center justify-between border bg-ink-raised px-5 py-4 text-left transition-colors hover:bg-ink-edge"
    >
      <span className="block min-w-0 flex-1">
        <span className="flex items-center gap-3">
          <span className="text-sm font-medium text-paper">{label}</span>
          {required && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-cinnabar">
              required
            </span>
          )}
        </span>
        <span className="mt-1 block truncate font-mono text-xs text-paper-mute">
          {value ?? placeholder}
        </span>
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        change →
      </span>
    </button>
  );
}
