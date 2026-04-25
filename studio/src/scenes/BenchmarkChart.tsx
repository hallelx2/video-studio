import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Geist";
import type { VideoFormat } from "../lib/formats.js";
import { geist } from "../lib/theme.js";

const { fontFamily } = loadFont();

export interface BenchmarkBar {
  label: string;
  value: number;
  color?: string;
}

export interface BenchmarkChartProps {
  title: string;
  unit?: string;
  bars: BenchmarkBar[];
  format: VideoFormat;
}

const SIZES: Record<VideoFormat, { title: number; label: number; value: number; barHeight: number; gap: number; padding: number }> = {
  linkedin: { title: 68, label: 36, value: 48, barHeight: 72, gap: 28, padding: 100 },
  x: { title: 60, label: 32, value: 42, barHeight: 64, gap: 24, padding: 140 },
  youtube: { title: 68, label: 36, value: 48, barHeight: 72, gap: 28, padding: 160 },
  "youtube-short": { title: 76, label: 40, value: 52, barHeight: 80, gap: 32, padding: 80 },
  hero: { title: 56, label: 32, value: 40, barHeight: 60, gap: 20, padding: 120 },
  pitch: { title: 72, label: 38, value: 52, barHeight: 76, gap: 30, padding: 160 },
};

export const BenchmarkChart: React.FC<BenchmarkChartProps> = ({ title, unit, bars, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sizes = SIZES[format];
  const maxValue = Math.max(...bars.map((b) => b.value));

  const titleSpring = spring({ frame, fps, config: { stiffness: 200, damping: 22, mass: 1 } });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);
  const titleY = interpolate(titleSpring, [0, 1], [20, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: geist.background,
        fontFamily,
        padding: sizes.padding,
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: sizes.title,
          color: geist.foreground,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: sizes.gap * 2,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: sizes.gap }}>
        {bars.map((bar, i) => {
          const barDelay = 10 + i * 6;
          const barSpring = spring({
            frame: frame - barDelay,
            fps,
            config: { stiffness: 150, damping: 22, mass: 1 },
          });
          const widthPct = interpolate(barSpring, [0, 1], [0, (bar.value / maxValue) * 100]);
          const animatedValue = Math.round(interpolate(barSpring, [0, 1], [0, bar.value]));
          const opacity = interpolate(barSpring, [0, 1], [0, 1]);

          return (
            <div key={bar.label} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span
                  style={{
                    fontSize: sizes.label,
                    color: geist.muted,
                    fontWeight: 500,
                    opacity,
                  }}
                >
                  {bar.label}
                </span>
                <span
                  style={{
                    fontSize: sizes.value,
                    color: geist.foreground,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.02em",
                    opacity,
                  }}
                >
                  {animatedValue}
                  {unit && (
                    <span style={{ color: geist.subtle, fontSize: sizes.value * 0.7, marginLeft: 4 }}>
                      {unit}
                    </span>
                  )}
                </span>
              </div>
              <div
                style={{
                  height: sizes.barHeight,
                  backgroundColor: "#161618",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    backgroundColor: bar.color ?? geist.accent,
                    borderRadius: 6,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
