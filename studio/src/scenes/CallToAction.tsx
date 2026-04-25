import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import type { VideoFormat } from "../lib/formats.js";
import { geist } from "../lib/theme.js";

const sans = loadSans();
const mono = loadMono();

export interface CallToActionProps {
  url: string;
  eyebrow?: string;
  secondary?: string;
  format: VideoFormat;
  accent?: string;
}

const SIZES: Record<VideoFormat, { url: number; eyebrow: number; secondary: number; padding: number }> = {
  linkedin: { url: 108, eyebrow: 32, secondary: 38, padding: 120 },
  x: { url: 88, eyebrow: 28, secondary: 34, padding: 160 },
  youtube: { url: 96, eyebrow: 32, secondary: 38, padding: 180 },
  "youtube-short": { url: 112, eyebrow: 36, secondary: 42, padding: 80 },
  hero: { url: 80, eyebrow: 26, secondary: 32, padding: 140 },
  pitch: { url: 96, eyebrow: 32, secondary: 38, padding: 180 },
};

export const CallToAction: React.FC<CallToActionProps> = ({ url, eyebrow, secondary, format, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sizes = SIZES[format];

  const urlSpring = spring({ frame, fps, config: { stiffness: 180, damping: 20, mass: 1 } });
  const urlOpacity = interpolate(urlSpring, [0, 1], [0, 1]);
  const urlScale = interpolate(urlSpring, [0, 1], [0.94, 1]);

  const eyebrowSpring = spring({ frame: frame - 4, fps, config: { stiffness: 200, damping: 22 } });
  const secondarySpring = spring({ frame: frame - 10, fps, config: { stiffness: 200, damping: 22 } });
  const eyebrowOpacity = interpolate(eyebrowSpring, [0, 1], [0, 1]);
  const secondaryOpacity = interpolate(secondarySpring, [0, 1], [0, 1]);
  const eyebrowY = interpolate(eyebrowSpring, [0, 1], [16, 0]);
  const secondaryY = interpolate(secondarySpring, [0, 1], [16, 0]);

  const accentColor = accent ?? geist.accent;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: geist.background,
        fontFamily: sans.fontFamily,
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
            color: geist.subtle,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 40,
            opacity: eyebrowOpacity,
            transform: `translateY(${eyebrowY}px)`,
          }}
        >
          {eyebrow}
        </div>
      )}
      <div
        style={{
          fontFamily: mono.fontFamily,
          fontSize: sizes.url,
          color: geist.foreground,
          fontWeight: 600,
          letterSpacing: "-0.03em",
          opacity: urlOpacity,
          transform: `scale(${urlScale})`,
          padding: "24px 48px",
          borderBottom: `4px solid ${accentColor}`,
          marginBottom: 24,
        }}
      >
        {url}
      </div>
      {secondary && (
        <div
          style={{
            fontFamily: mono.fontFamily,
            fontSize: sizes.secondary,
            color: geist.muted,
            fontWeight: 500,
            marginTop: 32,
            opacity: secondaryOpacity,
            transform: `translateY(${secondaryY}px)`,
          }}
        >
          {secondary}
        </div>
      )}
    </AbsoluteFill>
  );
};
