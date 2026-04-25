import {
  AbsoluteFill,
  CalculateMetadataFunction,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Geist";
import type { VideoFormat } from "../lib/formats.js";

const { fontFamily } = loadFont();

export type PlaceholderProps = {
  title: string;
  subtitle: string;
  format: VideoFormat;
};

export const placeholderCalculateMetadata: CalculateMetadataFunction<PlaceholderProps> = () => {
  return {
    durationInFrames: 150,
  };
};

export const PlaceholderComp: React.FC<PlaceholderProps> = ({ title, subtitle, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({
    frame,
    fps,
    config: { stiffness: 200, damping: 20, mass: 1 },
  });
  const subtitleSpring = spring({
    frame: frame - 8,
    fps,
    config: { stiffness: 200, damping: 20, mass: 1 },
  });

  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);
  const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1]);
  const titleY = interpolate(titleSpring, [0, 1], [24, 0]);
  const subtitleY = interpolate(subtitleSpring, [0, 1], [24, 0]);

  const titleSize = format === "linkedin" ? 140 : 120;
  const subtitleSize = format === "linkedin" ? 48 : 42;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0A0A0A",
        fontFamily,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: 120,
      }}
    >
      <div
        style={{
          fontSize: titleSize,
          color: "#FFFFFF",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textAlign: "center",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: subtitleSize,
          color: "#A1A1AA",
          fontWeight: 400,
          marginTop: 32,
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
          textAlign: "center",
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  );
};
