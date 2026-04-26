import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getConfig,
  getSystemHealth,
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

export function SettingsRoute() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

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
  const pickOutput = async () => {
    const path = await pickFolder("Pick where rendered MP4s should land");
    if (path) update("outputDirectory", path);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="hairline flex items-center justify-between border-b px-12 py-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
            configuration · {config.profileName || "default"}
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
          {/* ─── System status ──────────────────────────────────────────── */}
          <Section
            eyebrow="00"
            title="System status"
            action={
              <button
                onClick={refreshHealth}
                disabled={healthLoading}
                className={cn(
                  "border-b pb-0.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  healthLoading
                    ? "cursor-not-allowed border-paper-mute/30 text-paper-mute/40"
                    : "border-cinnabar text-cinnabar hover:text-paper"
                )}
              >
                {healthLoading ? "checking…" : "re-check"}
              </button>
            }
          >
            {health ? (
              <ul className="grid grid-cols-1 gap-px overflow-hidden rounded border border-brass-line bg-brass-line">
                {health.entries.map((entry) => (
                  <li key={entry.key}>
                    <HealthRow entry={entry} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
                {healthLoading ? "checking…" : "no report yet"}
              </p>
            )}
          </Section>

          {/* ─── Profile ───────────────────────────────────────────────── */}
          <Section eyebrow="01" title="Profile">
            <TextField
              label="Profile name"
              value={config.profileName}
              placeholder="e.g. Personal, Work, Client A"
              onChange={(v) => update("profileName", v)}
            />
          </Section>

          {/* ─── Theme ─────────────────────────────────────────────────── */}
          <Section eyebrow="02" title="Theme">
            <RadioGrid
              options={[
                { id: "noir", label: "Atelier Noir", description: "Deep ink canvas. The default." },
                { id: "creme", label: "Atelier Crème", description: "Warm paper canvas. Same identity in daylight." },
              ]}
              activeId={config.theme}
              onPick={(id) => update("theme", id as ThemeId)}
            />
          </Section>

          {/* ─── Folders ───────────────────────────────────────────────── */}
          <Section eyebrow="03" title="Folders">
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

          {/* ─── Agent runtime ─────────────────────────────────────────── */}
          <Section eyebrow="04" title="Agent runtime">
            <p className="mb-3 text-xs leading-relaxed text-paper-mute">
              The CLI that drives the agent loop. Today only Claude Code is wired —
              Codex and Cursor support are queued for a future release.
            </p>
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

          {/* ─── Default model ─────────────────────────────────────────── */}
          <Section eyebrow="05" title="Default Claude model">
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

          {/* ─── Default persona ───────────────────────────────────────── */}
          <Section eyebrow="06" title="Default persona">
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

          {/* ─── Default narrator voice ────────────────────────────────── */}
          <Section eyebrow="07" title="Default narrator voice">
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

          {/* ─── Default video type ────────────────────────────────────── */}
          <Section eyebrow="08" title="Default video type">
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

          {/* ─── Render preferences ────────────────────────────────────── */}
          <Section eyebrow="09" title="Render preferences">
            <p className="mb-3 text-xs leading-relaxed text-paper-mute">
              Passed through to <span className="font-mono text-paper">npx hyperframes render</span>.
              Quality affects bitrate and final-pass duration; FPS affects render time
              and motion smoothness. 60fps roughly doubles render time.
            </p>
            <div className="space-y-3">
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
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
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-paper-mute">
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
                          ? "border-cinnabar bg-cinnabar/10 text-cinnabar"
                          : "border-paper-mute/15 text-paper hover:border-paper-mute/30"
                      )}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ─── Notifications ─────────────────────────────────────────── */}
          <Section eyebrow="10" title="Notifications">
            <ToggleRow
              label="Native OS notifications"
              description="Fire when the agent reaches an approval gate, finishes a render, or hits a fatal error — only if the window isn't focused."
              value={config.notificationsEnabled}
              onChange={(v) => update("notificationsEnabled", v)}
            />
          </Section>

          {/* ─── Advanced ──────────────────────────────────────────────── */}
          <Section eyebrow="11" title="Advanced">
            <NumberField
              label="HyperFrames preview port"
              description="Port the dev server binds to when you launch a composition preview."
              value={config.previewPort}
              min={1024}
              max={65535}
              onChange={(v) => update("previewPort", v)}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

// ─── Section primitives ───────────────────────────────────────────────────

function Section({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
            {eyebrow}
          </p>
          <h2 className="display-sm mt-2 text-2xl text-paper">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function HealthRow({ entry }: { entry: HealthEntry }) {
  const tone = entry.ok ? "ok" : entry.required ? "alarm" : "warn";
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 bg-ink px-4 py-3">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          tone === "ok" && "bg-paper",
          tone === "warn" && "bg-brass",
          tone === "alarm" && "bg-alarm"
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-paper">{entry.label}</span>
          {!entry.required && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute/85">
              optional
            </span>
          )}
          {entry.version && (
            <span className="font-mono text-[10px] tabular text-brass">v{entry.version}</span>
          )}
        </span>
        {entry.path && (
          <span className="mt-0.5 block truncate font-mono text-[10px] text-paper-mute/85">
            {entry.path}
          </span>
        )}
        {entry.note && (
          <span
            className={cn(
              "mt-1 block text-xs leading-relaxed",
              entry.ok ? "text-paper-mute" : entry.required ? "text-alarm" : "text-brass"
            )}
          >
            {entry.note}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] uppercase tracking-widest",
          tone === "ok" && "text-paper",
          tone === "warn" && "text-brass",
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
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-brass-line bg-brass-line">
      {options.map((opt) => {
        const isActive = opt.id === activeId;
        return (
          <button
            key={opt.id}
            onClick={() => !opt.disabled && onPick(opt.id)}
            disabled={opt.disabled}
            className={cn(
              "block bg-ink px-5 py-3 text-left transition-colors",
              opt.disabled
                ? "cursor-not-allowed opacity-50"
                : isActive
                  ? "bg-ink-edge"
                  : "hover:bg-ink-raised"
            )}
          >
            <span className="flex items-baseline justify-between gap-4">
              <span className="flex items-baseline gap-3">
                <span
                  className={
                    isActive
                      ? "h-1.5 w-1.5 rounded-full bg-cinnabar"
                      : "h-1.5 w-1.5"
                  }
                />
                <span className="text-sm font-medium text-paper">{opt.label}</span>
                {opt.badge && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-brass">
                    {opt.badge}
                  </span>
                )}
              </span>
              {opt.tag && (
                <span className="font-mono text-[10px] tabular text-paper-mute">
                  {opt.tag}
                </span>
              )}
            </span>
            {opt.description && (
              <span className="ml-[18px] mt-1 block text-xs leading-relaxed text-paper-mute">
                {opt.description}
              </span>
            )}
          </button>
        );
      })}
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
      <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-paper-mute">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="hairline w-full border bg-ink-raised px-4 py-2.5 font-sans text-sm text-paper placeholder:text-paper-mute/55 focus:border-paper-mute/40 focus:outline-none"
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
      <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-paper-mute">
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
        className="hairline w-32 border bg-ink-raised px-4 py-2.5 font-mono text-sm tabular text-paper focus:border-paper-mute/40 focus:outline-none"
      />
      {description && (
        <span className="mt-2 block text-xs leading-relaxed text-paper-mute">
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
      className="hairline flex w-full items-start justify-between gap-6 border bg-ink-raised px-5 py-4 text-left transition-colors hover:bg-ink-edge"
    >
      <span className="block min-w-0 flex-1">
        <span className="text-sm font-medium text-paper">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-paper-mute">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
          value
            ? "border-cinnabar bg-cinnabar/30"
            : "border-paper-mute/30 bg-ink"
        )}
      >
        <span
          className={cn(
            "h-3.5 w-3.5 rounded-full transition-all",
            value ? "ml-[18px] bg-cinnabar" : "ml-0.5 bg-paper-mute/60"
          )}
        />
      </span>
    </button>
  );
}
