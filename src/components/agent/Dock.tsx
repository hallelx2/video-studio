import { cn } from "../../lib/cn.js";

/**
 * Bottom-anchored layout shell for HITL surfaces — questions, permissions,
 * follow-ups. Inspired by OpenCode's DockPrompt: header / body / tray, where
 * the user can still see the agent activity above the dock (no full takeover).
 *
 * Three slots:
 *   - header: icon + title + meta (one row)
 *   - body: rich content (script preview, scene cards, textarea, etc)
 *   - tray: action buttons aligned right
 */
export function Dock({
  kind,
  className,
  children,
}: {
  kind: "question" | "permission" | "review";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-component="dock"
      data-kind={kind}
      className={cn(
        "hairline relative z-10 flex flex-col border-t bg-ink",
        kind === "permission" && "border-t-cinnabar/40",
        kind === "question" && "border-t-cinnabar",
        className
      )}
    >
      {children}
    </section>
  );
}

export function DockHeader({
  eyebrow,
  title,
  meta,
  active,
}: {
  eyebrow: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <header className="hairline flex items-baseline justify-between gap-6 border-b px-12 py-4">
      <div className="flex items-baseline gap-3">
        <span className="flex items-center gap-2">
          {active && <span className="pulse-cinnabar h-1 w-1 rounded-full bg-cinnabar" />}
          <span className="font-mono text-[10px] uppercase tracking-widest text-cinnabar">
            {eyebrow}
          </span>
        </span>
        <span className="display-sm text-xl text-paper">{title}</span>
      </div>
      {meta && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-paper-mute">
          {meta}
        </span>
      )}
    </header>
  );
}

export function DockBody({
  scrollable,
  className,
  children,
}: {
  scrollable?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "px-12 py-5",
        scrollable && "max-h-[60vh] overflow-y-auto",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DockTray({ children }: { children: React.ReactNode }) {
  return (
    <footer className="hairline flex items-center justify-end gap-8 border-t bg-ink-raised px-12 py-4">
      {children}
    </footer>
  );
}
