import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import { Popover } from "../ui/Popover.js";
import { findModel, MODEL_OPTIONS, type ModelOption } from "../../lib/types.js";

/**
 * Search-palette model picker. Trigger is a small chip showing the active
 * model; clicking opens a popover with a search input and the full model
 * list. Type to filter, click (or press the keyboard shortcut) to select.
 *
 * Visual: shadcn-style — tight tracking, subtle borders, fg-muted hover,
 * cyan dot for the active selection. Lives inside the Composer.
 */
export function ModelPicker({
  modelId,
  onChange,
}: {
  modelId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = findModel(modelId) ?? MODEL_OPTIONS[0];

  // Global keyboard shortcut: Ctrl+1..5 picks a model from anywhere in the workbench.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const num = Number(e.key);
      if (!Number.isInteger(num) || num < 1 || num > MODEL_OPTIONS.length) return;
      // Avoid stealing keystrokes when the user is typing in an editable element.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      const picked = MODEL_OPTIONS.find((m) => m.shortcut === num);
      if (picked) onChange(picked.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onChange]);

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
            "flex items-center gap-2 rounded-full border border-fg-muted/20 bg-void px-3 py-1.5",
            "font-mono text-[11px] tracking-wide text-fg transition-colors",
            "hover:border-fg-muted/40 hover:bg-elevated"
          )}
        >
          <FamilyMark family={active.family} />
          <span>{active.label}</span>
          <ChevronDown className={cn("h-3 w-3 text-fg-muted transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      <ModelMenu activeId={modelId} onPick={(id) => { onChange(id); setOpen(false); }} />
    </Popover>
  );
}

function ModelMenu({ activeId, onPick }: { activeId: string; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MODEL_OPTIONS;
    return MODEL_OPTIONS.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div>
      <header className="flex items-center gap-2 border-b border-fg-muted/10 px-4 py-3">
        <FamilyMark family="opus" />
        <span className="font-display text-sm font-semibold text-fg">Claude</span>
      </header>

      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-fg-muted/15 bg-void px-3 py-2 focus-within:border-fg-muted/30">
          <SearchIcon className="h-3.5 w-3.5 text-fg-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="w-full bg-transparent font-sans text-sm text-fg placeholder:text-fg-muted/80 focus:outline-none"
            type="search"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      <ul className="max-h-72 overflow-y-auto p-1.5">
        {visible.map((model) => {
          const isActive = model.id === activeId;
          return (
            <li key={model.id}>
              <button
                type="button"
                onClick={() => onPick(model.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                  isActive ? "bg-elevated" : "hover:bg-elevated/60"
                )}
              >
                <span className="shrink-0">
                  {isActive ? (
                    <DotMark className="h-3 w-3 text-cyan" />
                  ) : (
                    <StarMark className="h-3 w-3 text-fg-muted/50" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-sm text-fg">
                    {model.label}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-fg-muted">
                    {model.description}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-fg-muted/15 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                  Ctrl+{model.shortcut}
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            no model matches "{query}"
          </li>
        )}
      </ul>
    </div>
  );
}

// ─── Inline glyphs (no extra imports — keep the picker self-contained) ────

function FamilyMark({ family }: { family: ModelOption["family"] }) {
  // Simple sparkle/asterisk glyph for the model brand mark. Cinnabar
  // emphasis on Opus, fg-muted on Sonnet, fg-faint on Haiku.
  const tone =
    family === "opus" ? "text-cyan" : family === "sonnet" ? "text-fg-faint" : "text-fg-muted";
  return (
    <svg viewBox="0 0 12 12" className={cn("h-3 w-3 shrink-0", tone)} aria-hidden>
      <path
        d="M6 0v12M0 6h12M1.8 1.8l8.4 8.4M10.2 1.8l-8.4 8.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={className} aria-hidden>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path
        d="M6 1.5l1.4 2.85 3.1.45-2.25 2.2.55 3.1L6 8.6l-2.8 1.5.55-3.1-2.25-2.2 3.1-.45L6 1.5z"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinejoin="round"
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
