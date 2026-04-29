import { cn } from "../../lib/cn.js";
import {
  FORMAT_OPTIONS,
  VIDEO_TYPES,
  type VideoFormat,
  type VideoType,
} from "../../lib/types.js";
import { ToolBar } from "./ToolBar.js";

/**
 * Top header strip for the preview-first Stage layout. Shows project
 * name, video type pill, format chips, and the `⋯` button that opens
 * DetailsModal. Deliberately quiet — chrome should recede so the
 * canvas below it owns the optical center.
 */
export function StageHeader({
  projectName,
  sessionTitle,
  projectId,
  sessionId,
  videoType,
  formats,
  running,
  globalActivity,
  hasScript,
  hasComposition,
  onChangeVideoType,
  onToggleFormat,
  onOpenDetails,
  onRecompose,
  onRerender,
}: {
  projectName: string;
  sessionTitle?: string | null;
  projectId: string | undefined;
  sessionId: string | null;
  videoType: VideoType;
  formats: VideoFormat[];
  running: boolean;
  globalActivity: string | null;
  hasScript: boolean;
  hasComposition: boolean;
  onChangeVideoType: (v: VideoType) => void;
  onToggleFormat: (f: VideoFormat) => void;
  onOpenDetails: () => void;
  onRecompose: () => void;
  onRerender: () => void;
}) {
  return (
    <header className="hairline flex items-center justify-between gap-6 border-b px-6 py-3">
      <div className="flex min-w-0 items-baseline gap-4">
        <span className="font-display text-base font-semibold text-fg">
          {sessionTitle ?? projectName}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {VIDEO_TYPES.find((t) => t.id === videoType)?.label ?? videoType}
        </span>
        <div className="flex items-baseline gap-1.5">
          {FORMAT_OPTIONS.map((f) => {
            const on = formats.includes(f.id as VideoFormat);
            return (
              <button
                key={f.id}
                onClick={() => onToggleFormat(f.id as VideoFormat)}
                disabled={running}
                title={`${f.label} · ${f.aspect}`}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  on
                    ? "border-cyan/40 bg-cyan/10 text-cyan"
                    : "border-mist-08 text-fg-faint hover:border-mist-12 hover:text-fg-muted"
                )}
              >
                {f.aspect}
              </button>
            );
          })}
        </div>
        {globalActivity && (
          <span className="ml-3 italic font-display text-xs text-fg-muted">
            {globalActivity}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-baseline gap-3">
        <ToolBar
          projectId={projectId}
          sessionId={sessionId}
          videoType={videoType}
          formats={formats}
          hasScript={hasScript}
          hasComposition={hasComposition}
          running={running}
          onRecomposeFallback={onRecompose}
          onRerenderFallback={onRerender}
        />
        {/* Video type swap — single tiny chip, opens a popover when clicked.
            For now it cycles through the next type on click. Cheap, gets the
            point across; richer popover ships in a later pass. */}
        <button
          onClick={() => {
            const idx = VIDEO_TYPES.findIndex((t) => t.id === videoType);
            const next = VIDEO_TYPES[(idx + 1) % VIDEO_TYPES.length];
            onChangeVideoType(next.id as VideoType);
          }}
          disabled={running}
          className="font-mono text-[10px] uppercase tracking-widest text-fg-faint hover:text-fg-muted disabled:opacity-50"
          title="Click to switch video type"
        >
          ⇄
        </button>
        <button
          onClick={onOpenDetails}
          aria-label="Show details"
          className="font-mono text-base text-fg-faint hover:text-fg-muted"
          title="Show details (recent activity, tools, logs)"
        >
          ⋯
        </button>
      </div>
    </header>
  );
}
