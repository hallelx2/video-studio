import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getConfig,
  getSystemHealth,
  pickFile,
  pickFolder,
  saveConfig,
} from "../lib/agent-client.js";
import {
  DEFAULT_CONFIG,
  MODEL_OPTIONS,
  PERSONAS,
  RENDER_FPS_OPTIONS,
  RENDER_QUALITY_OPTIONS,
  RUNTIME_OPTIONS,
  VIDEO_TYPES,
  VOICE_OPTIONS,
  type AgentRuntime,
  type AppConfig,
  type HealthEntry,
  type HealthReport,
  type RenderFps,
  type RenderQuality,
  type ThemeId,
  type VideoType,
} from "../lib/types.js";
import { cn } from "../lib/cn.js";

/**
 * Settings page — tabbed.
 *
 * The earlier flat layout listed all twelve sections in one scroll column
 * which felt heavy and made the page feel like a spec sheet. Split into
 * six tabs grouped by intent (System · General · Folders · Agent · Video
 * · Advanced) so every panel fits on one screen and the user is never
 * scrolling past unrelated knobs to reach the one they wanted.
 *
 * The Save button stays in the header — it operates on the whole config
 * regardless of which tab is open, so changes across tabs persist in a
 * single round-trip.
 */

type SettingsTab = "system" | "general" | "folders" | "agent" | "video" | "advanced";

const TABS: Array<{ id: SettingsTab; label: string; description: string }> = [
  { id: "system", label: "System", description: "Dependencies & health" },
  { id: "general", label: "General", description: "Profile · theme · notifications" },
  { id: "folders", label: "Folders", description: "Projects · workspace · output" },
  { id: "agent", label: "Agent", description: "Runtime · model · persona" },
  { id: "video", label: "Video", description: "Voice · type · render" },
  { id: "advanced", label: "Advanced", description: "Preview port" },
];

export function SettingsRoute() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("system");

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(DEFAULT_CONFIG));
    refreshHealth();
  }, []);

  const refreshHealth = () => {
    setHealthLoading(true);
    getSystemHealth()
      .then(setHealth)
      .catch(() => undefined)
      .finally(() => setHealthLoading(false));
  };

  if (!config) {
    return (
      <div className="grain flex h-full items-center justify-center bg-void">
        <span className="pulse-cyan h-2 w-2 rounded-full bg-cyan" />
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
  const pickOutput = async () => {
    const path = await pickFolder("Pick where rendered MP4s should land");
    if (path) update("outputDirectory", path);
  };
  const pickPython = async () => {
    const path = await pickFile({
      title: "Pick the Python interpreter to use for hyperframes tts",
      filters:
        navigator.platform.toLowerCase().startsWith("win")
          ? [{ name: "Python", extensions: ["exe"] }]
          : undefined,
    });
    if (path) update("pythonBin", path);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="hairline flex items-center justify-between border-b px-12 py-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            configuration · {config.profileName || "default"}
          </p>
          <h1 className="display-sm mt-2 text-4xl text-fg">Settings</h1>
        </div>
        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm text-fg-muted transition-colors hover:text-fg">
            ← back
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "border-b pb-1 text-sm font-medium transition-colors",
              saving
                ? "cursor-not-allowed border-fg-muted/30 text-fg-muted/50"
                : savedAt
                  ? "border-fg text-fg"
                  : "border-cyan text-cyan hover:text-fg"
            )}
          >
            {savedAt ? "saved ✓" : saving ? "saving…" : "save changes →"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Tab rail ─────────────────────────────────────────────────── */}
        <aside className="hairline w-64 shrink-0 overflow-y-auto border-r px-6 py-10">
          <p className="mb-4 px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            sections
          </p>
          <ul className="space-y-0.5">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "block w-full rounded px-3 py-2.5 text-left transition-colors",
                      isActive
                        ? "bg-surface text-fg"
                        : "text-fg-muted hover:bg-elevated hover:text-fg"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                          isActive ? "bg-cyan" : "bg-fg-muted/30"
                        )}
                      />
                      <span className="text-sm font-medium">{tab.label}</span>
                    </span>
                    <span className="ml-[18px] mt-0.5 block text-[11px] leading-snug text-fg-muted/70">
                      {tab.description}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ─── Active tab content ───────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-12 py-12">
          <div className="max-w-2xl space-y-12">
            {activeTab === "system" && (
              <Section
                title="System status"
                description="Live detection of every dependency the agent and renderer reach for. Re-run after installing a tool to confirm it's wired up."
                action={
                  <button
                    onClick={refreshHealth}
                    disabled={healthLoading}
                    className={cn(
                      "border-b pb-0.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                      healthLoading
                        ? "cursor-not-allowed border-fg-muted/30 text-fg-muted/40"
                        : "border-cyan text-cyan hover:text-fg"
                    )}
                  >
                    {healthLoading ? "checking…" : "re-check"}
                  </button>
                }
              >
                {health ? (
                  <ul className="grid grid-cols-1 gap-px overflow-hidden rounded border border-mist-10 bg-mist-10">
                    {health.entries.map((entry) => (
                      <li key={entry.key}>
                        <HealthRow entry={entry} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {healthLoading ? "checking…" : "no report yet"}
                  </p>
                )}
              </Section>
            )}

            {activeTab === "general" && (
              <>
                <Section eyebrow="01" title="Profile">
                  <TextField
                    label="Profile name"
                    value={config.profileName}
                    placeholder="e.g. Personal, Work, Client A"
                    onChange={(v) => update("profileName", v)}
                  />
                </Section>

                <Section eyebrow="02" title="Theme">
                  <RadioGrid
                    options={[
                      { id: "noir", label: "Composio Dark", description: "Pitch-black canvas. The default." },
                      { id: "creme", label: "Composio Daylight", description: "Warm paper canvas. Same identity in daylight." },
                    ]}
                    activeId={config.theme}
                    onPick={(id) => update("theme", id as ThemeId)}
                  />
                </Section>

                <Section eyebrow="03" title="Notifications">
                  <ToggleRow
                    label="Native OS notifications"
                    description="Fire when the agent reaches an approval gate, finishes a render, or hits a fatal error — only if the window isn't focused."
                    value={config.notificationsEnabled}
                    onChange={(v) => update("notificationsEnabled", v)}
                  />
                </Section>
              </>
            )}

            {activeTab === "folders" && (
              <Section
                title="Folders"
                description="Where the agent reads source projects and where it writes HyperFrames workspaces and rendered MP4s."
              >
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
                <Row
                  label="Output directory"
                  value={config.outputDirectory}
                  placeholder="Optional — where rendered MP4s land (defaults to workspace/<project>/output)"
                  onPick={pickOutput}
                />
              </Section>
            )}

            {activeTab === "agent" && (
              <>
                <Section
                  eyebrow="01"
                  title="Runtime"
                  description="The CLI that drives the agent loop. Today only Claude Code is wired — Codex and Cursor support are queued for a future release."
                >
                  <RadioGrid
                    options={RUNTIME_OPTIONS.map((r) => ({
                      id: r.id,
                      label: r.label,
                      description: r.description,
                      disabled: !r.available,
                      badge: r.available ? null : "soon",
                    }))}
                    activeId={config.runtime}
                    onPick={(id) => update("runtime", id as AgentRuntime)}
                  />
                </Section>

                <Section eyebrow="02" title="Default Claude model">
                  <RadioGrid
                    options={MODEL_OPTIONS.map((m) => ({
                      id: m.id,
                      label: m.label,
                      description: m.description,
                    }))}
                    activeId={config.selectedModel}
                    onPick={(id) => update("selectedModel", id)}
                  />
                </Section>

                <Section eyebrow="03" title="Default persona">
                  <RadioGrid
                    options={PERSONAS.map((p) => ({
                      id: p.id,
                      label: p.label,
                      description: p.description,
                    }))}
                    activeId={config.selectedPersona}
                    onPick={(id) => update("selectedPersona", id)}
                  />
                </Section>
              </>
            )}

            {activeTab === "video" && (
              <>
                <Section eyebrow="01" title="Default narrator voice">
                  <RadioGrid
                    options={VOICE_OPTIONS.map((v) => ({
                      id: v.id,
                      label: v.label,
                      description: v.description,
                      tag: v.id,
                    }))}
                    activeId={config.ttsVoice}
                    onPick={(id) => update("ttsVoice", id)}
                  />
                </Section>

                <Section eyebrow="02" title="Default video type">
                  <RadioGrid
                    options={VIDEO_TYPES.map((v) => ({
                      id: v.id,
                      label: v.label,
                      description: v.description,
                      tag: `${v.defaultScenes} scenes · ${v.defaultDuration}s`,
                    }))}
                    activeId={config.defaultVideoType}
                    onPick={(id) => update("defaultVideoType", id as VideoType)}
                  />
                </Section>

                <Section
                  eyebrow="03"
                  title="Render preferences"
                  description="Passed through to npx hyperframes render. Quality affects bitrate and final-pass duration; FPS affects render time and motion smoothness. 60 fps roughly doubles render time."
                >
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        Quality
                      </p>
                      <RadioGrid
                        options={RENDER_QUALITY_OPTIONS.map((q) => ({
                          id: q.id,
                          label: q.label,
                          description: q.description,
                        }))}
                        activeId={config.renderQuality}
                        onPick={(id) => update("renderQuality", id as RenderQuality)}
                      />
                    </div>
                    <div>
                      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        FPS
                      </p>
                      <div className="flex gap-2">
                        {RENDER_FPS_OPTIONS.map((fps) => (
                          <button
                            key={fps}
                            onClick={() => update("renderFps", fps as RenderFps)}
                            className={cn(
                              "rounded border px-4 py-2 font-mono text-xs tabular transition-colors",
                              config.renderFps === fps
                                ? "border-cyan bg-cyan/10 text-cyan"
                                : "border-fg-muted/15 text-fg hover:border-fg-muted/30"
                            )}
                          >
                            {fps}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Section>
              </>
            )}

            {activeTab === "advanced" && (
              <>
                <Section
                  eyebrow="01"
                  title="Python interpreter"
                  description="Pin a specific python.exe so hyperframes tts always reaches the interpreter where you installed kokoro-onnx + soundfile. Leave empty to let the runtime auto-detect from PATH. Set this when you have multiple Pythons (e.g. the Microsoft Store stub on Windows) or use venvs / conda envs that aren't always activated when Video Studio launches."
                >
                  <PathRow
                    label="python.exe"
                    value={config.pythonBin}
                    placeholder="Optional — leave empty to auto-detect from PATH"
                    onPick={pickPython}
                    onClear={() => update("pythonBin", null)}
                  />
                </Section>

                <Section eyebrow="02" title="HyperFrames preview port">
                  <NumberField
                    label="Port"
                    description="Port the dev server binds to when you launch a composition preview."
                    value={config.previewPort}
                    min={1024}
                    max={65535}
                    onChange={(v) => update("previewPort", v)}
                  />
                </Section>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Section primitives ───────────────────────────────────────────────────

function Section({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-6">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-cyan">
              {eyebrow}
            </p>
          )}
          <h2 className={cn("display-sm text-2xl text-fg", eyebrow && "mt-2")}>
            {title}
          </h2>
          {description && (
            <p className="mt-2 max-w-prose text-xs leading-relaxed text-fg-muted">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function HealthRow({ entry }: { entry: HealthEntry }) {
  const tone = entry.ok ? "ok" : entry.required ? "alarm" : "warn";
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 bg-void px-4 py-3">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          tone === "ok" && "bg-fg",
          tone === "warn" && "bg-fg-faint",
          tone === "alarm" && "bg-alarm"
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-fg">{entry.label}</span>
          {!entry.required && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted/85">
              optional
            </span>
          )}
          {entry.version && (
            <span className="font-mono text-[10px] tabular text-fg-faint">v{entry.version}</span>
          )}
        </span>
        {entry.path && (
          <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-muted/85">
            {entry.path}
          </span>
        )}
        {entry.note && (
          <span
            className={cn(
              "mt-1 block text-xs leading-relaxed",
              entry.ok ? "text-fg-muted" : entry.required ? "text-alarm" : "text-fg-faint"
            )}
          >
            {entry.note}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] uppercase tracking-widest",
          tone === "ok" && "text-fg",
          tone === "warn" && "text-fg-faint",
          tone === "alarm" && "text-alarm"
        )}
      >
        {entry.ok ? "ok" : entry.required ? "missing" : "absent"}
      </span>
    </div>
  );
}

interface RadioOption {
  id: string;
  label: string;
  description?: string;
  tag?: string;
  badge?: string | null;
  disabled?: boolean;
}

function RadioGrid({
  options,
  activeId,
  onPick,
}: {
  options: RadioOption[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-mist-10 bg-mist-10">
      {options.map((opt) => {
        const isActive = opt.id === activeId;
        return (
          <button
            key={opt.id}
            onClick={() => !opt.disabled && onPick(opt.id)}
            disabled={opt.disabled}
            className={cn(
              "block bg-void px-5 py-3 text-left transition-colors",
              opt.disabled
                ? "cursor-not-allowed opacity-50"
                : isActive
                  ? "bg-elevated"
                  : "hover:bg-surface"
            )}
          >
            <span className="flex items-baseline justify-between gap-4">
              <span className="flex items-baseline gap-3">
                <span
                  className={
                    isActive
                      ? "h-1.5 w-1.5 rounded-full bg-cyan"
                      : "h-1.5 w-1.5"
                  }
                />
                <span className="text-sm font-medium text-fg">{opt.label}</span>
                {opt.badge && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
                    {opt.badge}
                  </span>
                )}
              </span>
              {opt.tag && (
                <span className="font-mono text-[10px] tabular text-fg-muted">
                  {opt.tag}
                </span>
              )}
            </span>
            {opt.description && (
              <span className="ml-[18px] mt-1 block text-xs leading-relaxed text-fg-muted">
                {opt.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PathRow({
  label,
  value,
  placeholder,
  onPick,
  onClear,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPick: () => void;
  onClear?: () => void;
}) {
  return (
    <div className="hairline flex w-full items-center justify-between border bg-surface px-5 py-4">
      <div className="block min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        <span className="mt-1 block truncate font-mono text-xs text-fg-muted">
          {value ?? placeholder}
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-5">
        {value && onClear && (
          <button
            onClick={onClear}
            className="font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:text-alarm"
            title="Clear and fall back to PATH auto-detection"
          >
            clear
          </button>
        )}
        <button
          onClick={onPick}
          className="border-b border-cyan pb-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan transition-colors hover:text-fg"
        >
          {value ? "change →" : "pick →"}
        </button>
      </div>
    </div>
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
      className="hairline mb-2 flex w-full items-center justify-between border bg-surface px-5 py-4 text-left transition-colors last:mb-0 hover:bg-elevated"
    >
      <span className="block min-w-0 flex-1">
        <span className="flex items-center gap-3">
          <span className="text-sm font-medium text-fg">{label}</span>
          {required && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-cyan">
              required
            </span>
          )}
        </span>
        <span className="mt-1 block truncate font-mono text-xs text-fg-muted">
          {value ?? placeholder}
        </span>
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        change →
      </span>
    </button>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="hairline w-full border bg-surface px-4 py-2.5 font-sans text-sm text-fg placeholder:text-fg-muted/55 focus:border-fg-muted/40 focus:outline-none"
      />
    </label>
  );
}

function NumberField({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="hairline w-32 border bg-surface px-4 py-2.5 font-mono text-sm tabular text-fg focus:border-fg-muted/40 focus:outline-none"
      />
      {description && (
        <span className="mt-2 block text-xs leading-relaxed text-fg-muted">
          {description}
        </span>
      )}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="hairline flex w-full items-start justify-between gap-6 border bg-surface px-5 py-4 text-left transition-colors hover:bg-elevated"
    >
      <span className="block min-w-0 flex-1">
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-fg-muted">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
          value
            ? "border-cyan bg-cyan/30"
            : "border-fg-muted/30 bg-void"
        )}
      >
        <span
          className={cn(
            "h-3.5 w-3.5 rounded-full transition-all",
            value ? "ml-[18px] bg-cyan" : "ml-0.5 bg-fg-muted/60"
          )}
        />
      </span>
    </button>
  );
}
