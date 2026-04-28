import { useEffect, useState } from "react";
import { cn } from "../../lib/cn.js";
import { Popover } from "../ui/Popover.js";
import { findPersona, PERSONAS, type PersonaOption } from "../../lib/types.js";

/**
 * Persona picker — same shape as ModelPicker. Sits inline in the composer.
 * Each persona prepends a voice-direction block to the agent's system prompt
 * for the run. Picking 'Conversational' specifically asks the agent to write
 * two-speaker podcast-style dialogue and use a pair of Kokoro voices.
 */
export function PersonaPicker({
  personaId,
  onChange,
}: {
  personaId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = findPersona(personaId) ?? PERSONAS[0];

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="start"
      className="w-[360px]"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex items-center gap-2 rounded-full border border-fg-muted/15 bg-void px-3 py-1.5",
            "font-mono text-[11px] tracking-wide text-fg transition-colors",
            "hover:border-fg-muted/30 hover:bg-elevated"
          )}
          title="Persona / voice override"
        >
          <PersonaGlyph kind={active.id} />
          <span>{active.label}</span>
          <ChevronDown
            className={cn("h-3 w-3 text-fg-muted transition-transform", open && "rotate-180")}
          />
        </button>
      )}
    >
      <PersonaMenu activeId={personaId} onPick={(id) => { onChange(id); setOpen(false); }} />
    </Popover>
  );
}

function PersonaMenu({
  activeId,
  onPick,
}: {
  activeId: string;
  onPick: (id: string) => void;
}) {
  // Auto-focus the active row for keyboard nav.
  const ref = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    void ref;
  }, []);

  return (
    <div>
      <header className="flex items-center gap-2 border-b border-fg-muted/10 px-4 py-3">
        <PersonaGlyph kind="founder" />
        <span className="font-display text-sm font-semibold text-fg">Persona</span>
      </header>

      <p className="px-4 py-2.5 font-mono text-[10px] leading-relaxed text-fg-muted">
        Each persona prepends a voice override to the agent's system prompt
        for the next run. Founder is the default.
      </p>

      <ul className="max-h-72 overflow-y-auto p-1.5">
        {PERSONAS.map((persona) => {
          const isActive = persona.id === activeId;
          return (
            <li key={persona.id}>
              <button
                type="button"
                onClick={() => onPick(persona.id)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                  isActive ? "bg-elevated" : "hover:bg-elevated/60"
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {isActive ? (
                    <DotMark className="h-3 w-3 text-cyan" />
                  ) : (
                    <PersonaGlyph kind={persona.id} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-sm text-fg">
                    {persona.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
                    {persona.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Glyphs (per-persona character mark) ──────────────────────────────────

function PersonaGlyph({ kind }: { kind: PersonaOption["id"] | string }) {
  const className = "h-3 w-3 shrink-0";
  switch (kind) {
    case "founder":
      // Crosshair / target — anchored, decisive
      return (
        <svg viewBox="0 0 12 12" className={cn(className, "text-cyan")} aria-hidden>
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M6 1.5V4 M6 8V10.5 M1.5 6H4 M8 6H10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="6" cy="6" r="1" fill="currentColor" />
        </svg>
      );
    case "conversational":
      // Two overlapping speech bubbles
      return (
        <svg viewBox="0 0 12 12" className={cn(className, "text-fg-faint")} aria-hidden>
          <path
            d="M1.5 3 H 7.5 V 7 H 4 L 2.5 8.5 V 7 H 1.5 Z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M5.5 5 H 10.5 V 8 H 8 L 9 9.5 V 8 H 7.5 L 6.5 9 V 7.5 H 5.5 Z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
    case "technical":
      // Angle brackets
      return (
        <svg viewBox="0 0 12 12" className={cn(className, "text-fg-muted")} aria-hidden>
          <path
            d="M4 3 L 1.5 6 L 4 9 M 8 3 L 10.5 6 L 8 9"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
    case "editorial":
      // Quotation marks
      return (
        <svg viewBox="0 0 12 12" className={cn(className, "text-fg")} aria-hidden>
          <path
            d="M2 4 V 7 H 4 L 3.5 9 M 6.5 4 V 7 H 8.5 L 8 9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 12 12" className={cn(className, "text-fg-muted")} aria-hidden>
          <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      );
  }
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function DotMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <circle cx="6" cy="6" r="2.5" fill="currentColor" />
    </svg>
  );
}
