import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import type { VideoFormat } from "../lib/formats.js";
import { geist } from "../lib/theme.js";

const sans = loadSans();
const mono = loadMono();

export interface CodeSnippetProps {
  code: string;
  language?: string;
  caption?: string;
  format: VideoFormat;
}

const SIZES: Record<VideoFormat, { code: number; caption: number; padding: number }> = {
  linkedin: { code: 36, caption: 28, padding: 100 },
  x: { code: 34, caption: 28, padding: 120 },
  youtube: { code: 36, caption: 30, padding: 140 },
  "youtube-short": { code: 32, caption: 26, padding: 72 },
  hero: { code: 32, caption: 26, padding: 120 },
  pitch: { code: 36, caption: 30, padding: 140 },
};

export const CodeSnippet: React.FC<CodeSnippetProps> = ({ code, language, caption, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sizes = SIZES[format];

  const cardSpring = spring({ frame, fps, config: { stiffness: 200, damping: 22, mass: 1 } });
  const cardOpacity = interpolate(cardSpring, [0, 1], [0, 1]);
  const cardScale = interpolate(cardSpring, [0, 1], [0.96, 1]);
  const cardY = interpolate(cardSpring, [0, 1], [24, 0]);

  // Typewriter reveal: accelerate after 30 chars
  const visibleChars = Math.floor(
    interpolate(frame, [0, 30, 60, 120], [0, 30, 80, code.length], {
      extrapolateRight: "clamp",
    })
  );
  const visibleCode = code.slice(0, visibleChars);
  const showCaret = visibleChars < code.length;

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
      <div
        style={{
          backgroundColor: "#111113",
          border: `1px solid ${geist.border}`,
          borderRadius: 18,
          padding: "48px 56px",
          fontFamily: mono.fontFamily,
          fontSize: sizes.code,
          color: geist.foreground,
          lineHeight: 1.55,
          letterSpacing: "-0.01em",
          opacity: cardOpacity,
          transform: `translateY(${cardY}px) scale(${cardScale})`,
          maxWidth: "85%",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.8)",
          whiteSpace: "pre-wrap",
        }}
      >
        {language && (
          <div
            style={{
              fontSize: sizes.code * 0.55,
              color: geist.subtle,
              marginBottom: 20,
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {language}
          </div>
        )}
        {visibleCode}
        {showCaret && (
          <span
            style={{
              display: "inline-block",
              width: sizes.code * 0.55,
              height: sizes.code * 0.9,
              backgroundColor: geist.accent,
              verticalAlign: "text-bottom",
              marginLeft: 2,
              opacity: Math.floor(frame / 12) % 2 === 0 ? 1 : 0.2,
            }}
          />
        )}
      </div>
      {caption && (
        <div
          style={{
            fontSize: sizes.caption,
            color: geist.muted,
            fontFamily: sans.fontFamily,
            marginTop: 32,
            maxWidth: "70%",
            textAlign: "center",
            opacity: cardOpacity,
          }}
        >
          {caption}
        </div>
      )}
    </AbsoluteFill>
  );
};
