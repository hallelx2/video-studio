import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Geist";
import type { VideoFormat } from "../lib/formats.js";
import { geist } from "../lib/theme.js";

const { fontFamily } = loadFont();

export interface TitleCardProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  format: VideoFormat;
}

const SIZES: Record<VideoFormat, { title: number; subtitle: number; eyebrow: number; padding: number }> = {
  linkedin: { title: 140, subtitle: 48, eyebrow: 28, padding: 120 },
  x: { title: 110, subtitle: 42, eyebrow: 26, padding: 140 },
  youtube: { title: 120, subtitle: 48, eyebrow: 28, padding: 160 },
  "youtube-short": { title: 140, subtitle: 54, eyebrow: 32, padding: 96 },
  hero: { title: 100, subtitle: 40, eyebrow: 24, padding: 140 },
  pitch: { title: 120, subtitle: 48, eyebrow: 28, padding: 160 },
};

export const TitleCard: React.FC<TitleCardProps> = ({ title, subtitle, eyebrow, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sizes = SIZES[format];

  const titleSpring = spring({ frame, fps, config: { stiffness: 200, damping: 20, mass: 1 } });
  const subtitleSpring = spring({ frame: frame - 8, fps, config: { stiffness: 200, damping: 20, mass: 1 } });
  const eyebrowSpring = spring({ frame: frame - 2, fps, config: { stiffness: 200, damping: 20, mass: 1 } });

  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);
  const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1]);
  const eyebrowOpacity = interpolate(eyebrowSpring, [0, 1], [0, 1]);
  const titleY = interpolate(titleSpring, [0, 1], [32, 0]);
  const subtitleY = interpolate(subtitleSpring, [0, 1], [24, 0]);
  const eyebrowY = interpolate(eyebrowSpring, [0, 1], [16, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: geist.background,
        fontFamily,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: sizes.padding,
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontSize: sizes.eyebrow,
            color: geist.accent,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 32,
            opacity: eyebrowOpacity,
            transform: `translateY(${eyebrowY}px)`,
          }}
        >
          {eyebrow}
        </div>
      )}
      <div
        style={{
          fontSize: sizes.title,
          color: geist.foreground,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textAlign: "center",
          maxWidth: "90%",
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: sizes.subtitle,
            color: geist.muted,
            fontWeight: 400,
            marginTop: 40,
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            textAlign: "center",
            maxWidth: "80%",
            lineHeight: 1.3,
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
