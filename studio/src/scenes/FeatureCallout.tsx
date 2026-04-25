import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Geist";
import type { VideoFormat } from "../lib/formats.js";
import { geist } from "../lib/theme.js";

const { fontFamily } = loadFont();

export interface FeatureCalloutProps {
  headline: string;
  body?: string;
  iconGlyph?: string;
  format: VideoFormat;
  accent?: string;
}

const SIZES: Record<VideoFormat, { headline: number; body: number; icon: number; padding: number }> = {
  linkedin: { headline: 92, body: 42, icon: 120, padding: 120 },
  x: { headline: 80, body: 38, icon: 96, padding: 160 },
  youtube: { headline: 88, body: 42, icon: 104, padding: 180 },
  "youtube-short": { headline: 96, body: 48, icon: 128, padding: 96 },
  hero: { headline: 72, body: 36, icon: 88, padding: 160 },
  pitch: { headline: 88, body: 42, icon: 104, padding: 180 },
};

export const FeatureCallout: React.FC<FeatureCalloutProps> = ({ headline, body, iconGlyph = "●", format, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sizes = SIZES[format];

  const iconSpring = spring({ frame, fps, config: { stiffness: 180, damping: 18, mass: 1 } });
  const headlineSpring = spring({ frame: frame - 6, fps, config: { stiffness: 200, damping: 20, mass: 1 } });
  const bodySpring = spring({ frame: frame - 12, fps, config: { stiffness: 200, damping: 20, mass: 1 } });

  const iconScale = interpolate(iconSpring, [0, 1], [0.82, 1]);
  const iconOpacity = interpolate(iconSpring, [0, 1], [0, 1]);
  const headlineOpacity = interpolate(headlineSpring, [0, 1], [0, 1]);
  const bodyOpacity = interpolate(bodySpring, [0, 1], [0, 1]);
  const headlineY = interpolate(headlineSpring, [0, 1], [24, 0]);
  const bodyY = interpolate(bodySpring, [0, 1], [24, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: geist.background,
        fontFamily,
        alignItems: "flex-start",
        justifyContent: "center",
        flexDirection: "column",
        padding: sizes.padding,
      }}
    >
      <div
        style={{
          width: sizes.icon,
          height: sizes.icon,
          borderRadius: sizes.icon * 0.22,
          backgroundColor: (accent ?? geist.accent) + "26",
          border: `2px solid ${accent ?? geist.accent}`,
          color: accent ?? geist.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: sizes.icon * 0.5,
          marginBottom: 48,
          transform: `scale(${iconScale})`,
          opacity: iconOpacity,
        }}
      >
        {iconGlyph}
      </div>
      <div
        style={{
          fontSize: sizes.headline,
          color: geist.foreground,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
          maxWidth: "85%",
        }}
      >
        {headline}
      </div>
      {body && (
        <div
          style={{
            fontSize: sizes.body,
            color: geist.muted,
            fontWeight: 400,
            marginTop: 28,
            opacity: bodyOpacity,
            transform: `translateY(${bodyY}px)`,
            maxWidth: "75%",
            lineHeight: 1.4,
          }}
        >
          {body}
        </div>
      )}
    </AbsoluteFill>
  );
};
