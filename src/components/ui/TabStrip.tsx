import { cn } from "../../lib/cn.js";

/**
 * Underline-on-active tab strip. No pills, no rounded backgrounds.
 * Per DESIGN.md: chrome-thin, hairline-bottom on the strip itself.
 */
export interface Tab<T extends string> {
  id: T;
  label: string;
  badge?: string;
}

export function TabStrip<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: ReadonlyArray<Tab<T>>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("hairline flex items-stretch gap-0 border-b", className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-2 px-5 py-3 font-mono text-[10px] uppercase tracking-widest transition-colors",
              isActive ? "text-paper" : "text-paper-mute hover:text-paper"
            )}
          >
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="tabular text-cinnabar">{tab.badge}</span>
            )}
            {isActive && (
              <span className="absolute bottom-[-1px] left-3 right-3 h-px bg-cinnabar" />
            )}
          </button>
        );
      })}
    </div>
  );
}
