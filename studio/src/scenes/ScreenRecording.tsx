import { AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Geist";
import type { VideoFormat } from "../lib/formats.js";
import { geist } from "../lib/theme.js";

const { fontFamily } = loadFont();

export interface ScreenRecordingProps {
  src: string;
  caption?: string;
  chrome?: "browser" | "none";
  format: VideoFormat;
  /** Optional zoom — scales the video from `zoom[0]` to `zoom[1]` across the scene */
  zoom?: [number, number];
}

const SIZES: Record<VideoFormat, { padding: number; caption: number; radius: number }> = {
  linkedin: { padding: 80, caption: 32, radius: 16 },
  x: { padding: 120, caption: 32, radius: 14 },
  youtube: { padding: 140, caption: 34, radius: 16 },
  "youtube-short": { padding: 48, caption: 30, radius: 20 },
  hero: { padding: 120, caption: 28, radius: 14 },
  pitch: { padding: 140, caption: 34, radius: 16 },
};

export const ScreenRecording: React.FC<ScreenRecordingProps> = ({
  src,
  caption,
  chrome = "browser",
  format,
  zoom = [1.0, 1.06],
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sizes = SIZES[format];

  const entrance = spring({ frame, fps, config: { stiffness: 200, damping: 22, mass: 1 } });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const y = interpolate(entrance, [0, 1], [24, 0]);

  const zoomScale = interpolate(frame, [0, durationInFrames], zoom, { extrapolateRight: "clamp" });

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
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: format === "youtube-short" ? "95%" : "85%",
          borderRadius: sizes.radius,
          overflow: "hidden",
          border: `1px solid ${geist.border}`,
          backgroundColor: "#0D0D0F",
          boxShadow: "0 40px 120px -30px rgba(0,0,0,0.9)",
          opacity,
          transform: `translateY(${y}px)`,
        }}
      >
        {chrome === "browser" && <BrowserChrome />}
        <div
          style={{
            transform: `scale(${zoomScale})`,
            transformOrigin: "center center",
          }}
        >
          <Video src={staticFile(src)} style={{ width: "100%", display: "block" }} />
        </div>
      </div>
      {caption && (
        <div
          style={{
            fontSize: sizes.caption,
            color: geist.muted,
            fontWeight: 400,
            marginTop: 32,
            maxWidth: "70%",
            textAlign: "center",
            opacity,
          }}
        >
          {caption}
        </div>
      )}
    </AbsoluteFill>
  );
};

const BrowserChrome: React.FC = () => (
  <div
    style={{
      backgroundColor: "#151517",
      borderBottom: `1px solid ${geist.border}`,
      padding: "14px 20px",
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}
  >
    <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: "#FF5F57" }} />
    <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: "#FEBC2E" }} />
    <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: "#28C840" }} />
  </div>
);
