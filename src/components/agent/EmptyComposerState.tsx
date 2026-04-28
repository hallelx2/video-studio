import { cn } from "../../lib/cn.js";
import { VIDEO_TYPES, type VideoType, type VideoTypeOption } from "../../lib/types.js";

/**
 * Empty-state hero for an empty session (or a project with no sessions yet).
 *
 * No scaffold rail, no stage timeline, no noise. Just a quiet question and
 * five pill cards — one per video type — with custom Composio SVG icons.
 *
 * Click a pill → the parent creates the session with that video type as the
 * scaffold and immediately kicks off a build. Typing into the composer below
 * is the alternate path for a custom brief.
 */
export function EmptyComposerState({
  projectName,
  onPick,
}: {
  projectName: string;
  onPick: (videoType: VideoType) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-void px-12 py-16">
      <div className="mx-auto w-full max-w-3xl">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          new session · {projectName}
        </p>
        <h1 className="display mt-4 text-6xl text-fg">What should we make?</h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-fg-muted">
          Pick a starting point below — the agent will read your project, draft a script,
          and pause for your approval before spending any time on narration or rendering.
          Or type a custom brief in the chat below.
        </p>

        <ul className="mt-12 grid grid-cols-1 gap-px border border-fg-muted/15 bg-fg-muted/15 sm:grid-cols-2">
          {VIDEO_TYPES.map((type) => (
            <li key={type.id}>
              <PillCard type={type} onClick={() => onPick(type.id as VideoType)} />
            </li>
          ))}
        </ul>

        <p className="mt-10 font-mono text-[10px] uppercase tracking-widest text-fg-muted/80">
          or type a brief below ↓
        </p>
      </div>
    </div>
  );
}

function PillCard({
  type,
  onClick,
}: {
  type: VideoTypeOption;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative block h-full w-full bg-void p-6 text-left transition-colors",
        "hover:bg-elevated focus-visible:bg-elevated"
      )}
    >
      <div className="flex items-start gap-5">
        <span className="shrink-0">
          <Icon kind={type.id as VideoType} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="display-sm text-xl text-fg">{type.label}</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-muted">
            {type.description}
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted/85">
            <span className="tabular text-fg-faint">{type.defaultScenes}</span> scenes
            <span className="mx-2 text-fg-muted/40">·</span>
            <span className="tabular text-fg-faint">~{type.defaultDuration}s</span>
          </p>
        </div>
        <span
          aria-hidden
          className="self-start font-mono text-base text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          →
        </span>
      </div>
    </button>
  );
}

// ─── Custom Composio SVG icons ────────────────────────────────────────
// 32×32 viewBox · 1.25 stroke · currentColor · cyan accent on emphasis
// strokes. No fills except where a glyph needs weight (the rocket nose, the
// custom sparkle's center dot).

function Icon({ kind }: { kind: VideoType }) {
  const wrap = "h-12 w-12 text-fg";
  switch (kind) {
    case "hackathon-demo":
      return <ZapIcon className={wrap} />;
    case "product-launch":
      return <RocketIcon className={wrap} />;
    case "explainer":
      return <BulbIcon className={wrap} />;
    case "tutorial":
      return <BookIcon className={wrap} />;
    case "storyline":
      return <FilmIcon className={wrap} />;
    case "custom":
      return <SparkleIcon className={wrap} />;
  }
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M19 3 L7 18 L14 18 L11 29 L25 13 L18 13 L19 3 Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M19 3 L7 18 L14 18"
        stroke="var(--color-cyan)"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {/* Rocket body */}
      <path
        d="M16 3 C 21 8, 22 14, 22 19 L 16 23 L 10 19 C 10 14, 11 8, 16 3 Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Window */}
      <circle
        cx="16"
        cy="12"
        r="2.5"
        stroke="var(--color-cyan)"
        strokeWidth="1.25"
        fill="none"
      />
      {/* Fins */}
      <path
        d="M10 19 L 6 24 L 10 22 M 22 19 L 26 24 L 22 22"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {/* Exhaust */}
      <path
        d="M14 26 L 14 29 M 16 26 L 16 30 M 18 26 L 18 29"
        stroke="var(--color-fg-faint)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {/* Open book spread */}
      <path
        d="M5 7 L 16 9 L 27 7 L 27 25 L 16 27 L 5 25 Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Spine */}
      <path
        d="M16 9 L 16 27"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      {/* Step lines (left page) */}
      <path
        d="M9 14 L 13 14 M 9 18 L 13 18 M 9 22 L 12 22"
        stroke="var(--color-fg-muted)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* Step lines (right page) */}
      <path
        d="M19 14 L 23 14 M 19 18 L 23 18 M 19 22 L 22 22"
        stroke="var(--color-fg-muted)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* Bookmark */}
      <path
        d="M21 7.4 L 21 13 L 23 11.5 L 25 13 L 25 7"
        stroke="var(--color-cyan)"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function FilmIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {/* Film strip outer */}
      <rect
        x="3"
        y="7"
        width="26"
        height="18"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
      />
      {/* Sprocket holes — top */}
      <path
        d="M5 9.5 L 7 9.5 M 9 9.5 L 11 9.5 M 13 9.5 L 15 9.5 M 17 9.5 L 19 9.5 M 21 9.5 L 23 9.5 M 25 9.5 L 27 9.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Sprocket holes — bottom */}
      <path
        d="M5 22.5 L 7 22.5 M 9 22.5 L 11 22.5 M 13 22.5 L 15 22.5 M 17 22.5 L 19 22.5 M 21 22.5 L 23 22.5 M 25 22.5 L 27 22.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Frame dividers */}
      <path
        d="M11 12 L 11 20 M 21 12 L 21 20"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      {/* Center frame highlight */}
      <path
        d="M14 14 L 18 14 L 18 18 L 14 18 Z"
        stroke="var(--color-cyan)"
        strokeWidth="1.25"
        fill="none"
      />
    </svg>
  );
}

function BulbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {/* Bulb glass */}
      <path
        d="M16 4 C 10.5 4 7 8 7 13 C 7 16.5 8.5 19 10.5 21 L 10.5 23 L 21.5 23 L 21.5 21 C 23.5 19 25 16.5 25 13 C 25 8 21.5 4 16 4 Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Filament — cyan, the 'aha' beat */}
      <path
        d="M12 13 L 14.5 16 L 17.5 13 L 20 16"
        stroke="var(--color-cyan)"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Screw base */}
      <path
        d="M11 24 L 21 24 M 12 26 L 20 26 M 13 28 L 19 28"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* Concept rays — mist, faint */}
      <path
        d="M16 1 L 16 2.5 M 4 13 L 5.5 13 M 28 13 L 26.5 13 M 7.5 5 L 8.6 6 M 24.5 5 L 23.4 6"
        stroke="var(--color-fg-faint)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {/* Major sparkle */}
      <path
        d="M16 4 L 17 14 L 28 16 L 17 18 L 16 28 L 15 18 L 4 16 L 15 14 Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Center dot */}
      <circle cx="16" cy="16" r="1.4" fill="var(--color-cyan)" />
      {/* Minor sparkles */}
      <path
        d="M25 7 L 25.5 9 L 27 9.5 L 25.5 10 L 25 12 L 24.5 10 L 23 9.5 L 24.5 9 Z"
        stroke="var(--color-fg-faint)"
        strokeWidth="1"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M7 23 L 7.5 24.5 L 9 25 L 7.5 25.5 L 7 27 L 6.5 25.5 L 5 25 L 6.5 24.5 Z"
        stroke="var(--color-fg-faint)"
        strokeWidth="1"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
