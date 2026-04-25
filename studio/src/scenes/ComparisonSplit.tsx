import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Geist";
import type { VideoFormat } from "../lib/formats.js";
import { geist } from "../lib/theme.js";

const { fontFamily } = loadFont();

export interface ComparisonSplitProps {
  leftLabel: string;
  leftBody: string;
  rightLabel: string;
  rightBody: string;
  format: VideoFormat;
  /** Position the divider vertically (default) or horizontally */
  orientation?: "vertical" | "horizontal";
}

const SIZES: Record<VideoFormat, { label: number; body: number; padding: number }> = {
  linkedin: { label: 38, body: 56, padding: 80 },
  x: { label: 34, body: 52, padding: 100 },
  youtube: { label: 38, body: 58, padding: 120 },
  "youtube-short": { label: 42, body: 62, padding: 64 },
  hero: { label: 32, body: 48, padding: 100 },
  pitch: { label: 38, body: 58, padding: 120 },
};

export const ComparisonSplit: React.FC<ComparisonSplitProps> = ({
  leftLabel,
  leftBody,
  rightLabel,
  rightBody,
  format,
  orientation = "vertical",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sizes = SIZES[format];

  const leftSpring = spring({ frame, fps, config: { stiffness: 180, damping: 22, mass: 1 } });
  const rightSpring = spring({ frame: frame - 8, fps, config: { stiffness: 180, damping: 22, mass: 1 } });

  const leftOpacity = interpolate(leftSpring, [0, 1], [0, 1]);
  const rightOpacity = interpolate(rightSpring, [0, 1], [0, 1]);
  const leftX = interpolate(leftSpring, [0, 1], [-24, 0]);
  const rightX = interpolate(rightSpring, [0, 1], [24, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: geist.background,
        fontFamily,
        flexDirection: orientation === "vertical" ? "row" : "column",
      }}
    >
      <div
        style={{
          flex: 1,
          backgroundColor: "#141416",
          padding: sizes.padding,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          opacity: leftOpacity,
          transform: `translateX(${leftX}px)`,
          borderRight: orientation === "vertical" ? `1px solid ${geist.border}` : undefined,
          borderBottom: orientation === "horizontal" ? `1px solid ${geist.border}` : undefined,
        }}
      >
        <div
          style={{
            fontSize: sizes.label,
            color: geist.subtle,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 24,
          }}
        >
          {leftLabel}
        </div>
        <div
          style={{
            fontSize: sizes.body,
            color: "#737378",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {leftBody}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          backgroundColor: geist.background,
          padding: sizes.padding,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          opacity: rightOpacity,
          transform: `translateX(${rightX}px)`,
        }}
      >
        <div
          style={{
            fontSize: sizes.label,
            color: geist.accent,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 24,
          }}
        >
          {rightLabel}
        </div>
        <div
          style={{
            fontSize: sizes.body,
            color: geist.foreground,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {rightBody}
        </div>
      </div>
    </AbsoluteFill>
  );
};
