# SaaS Video Style Guide — Companion to system.md

This file is loaded only when explicitly referenced. It contains the detailed visual rules for SaaS-style product videos.

## The Geist Visual System

**Color palette (dark mode default):**

```ts
export const geist = {
  background: "#0A0A0A",      // near-black canvas
  foreground: "#FFFFFF",       // headlines
  muted: "#A1A1AA",            // body text, captions
  subtle: "#71717A",           // tertiary labels
  border: "#262626",           // 1px separators
  accent: "#0070F3",           // primary CTA blue (override per-product)
  success: "#0070F3",
  danger: "#F31260",
  warning: "#F5A524",
};
```

**Typography scale:**

| Role | Font | Weight | Size (LinkedIn 1080×1080) | Size (YouTube 1920×1080) |
|---|---|---|---|---|
| Hero title | Geist Sans | 700 | 140px | 120px |
| Headline | Geist Sans | 600 | 96px | 72px |
| Body | Geist Sans | 400 | 48px | 42px |
| Caption | Geist Sans | 500 | 36px | 32px |
| Code | Geist Mono | 500 | 42px | 36px |

Always apply `letterSpacing: -0.02em` to headlines. Tight tracking = premium.

## Motion Language

**Default spring config** (use for all reveal animations):

```ts
spring({
  frame: frame - delay,
  fps,
  config: { stiffness: 200, damping: 20, mass: 1 },
})
```

**Stagger children** by 3–5 frames for list reveals. Never simultaneous.

**Transitions between scenes:**
- Crossfade (default) — `interpolate(frame, [startFrame, startFrame + 10], [0, 1])`
- Slide-up — 24px offset, spring-eased
- Spring-scale — 0.94 → 1.0 over 12 frames

**Never use:** linear easing, snap transitions, fade-to-black between every scene, zoom-burns (unless explicitly doc-photo style).

## Layout Grids

**Linkedin square (1080×1080):**
- Padding: 80px all sides
- Safe area: 920×920 (content inside this)
- Vertical rhythm: 24px base unit

**X / YouTube landscape (1920×1080):**
- Padding: 120px horizontal, 80px vertical
- Safe area: 1680×920

**YouTube Short (1080×1920):**
- Padding: 64px horizontal, 120px top (leave room for caption burn-in at bottom), 240px bottom
- Safe area: 952×1560

**Hero (1920×1080):**
- Same as X but NO CTA band — hero videos loop and must not end on a URL card (it looks weird on repeat)

## Scene Composition Patterns

### Title Card
- Background: solid `#0A0A0A`
- Spring-in hero title, stagger the subtitle by 5 frames
- Optional: product logo in top-left (120px max width), timestamp in bottom-right for investor decks

### Feature Callout
- Icon (Lucide or custom SVG) + headline + one-sentence body
- Icon: 96px, `strokeWidth=1.5`, color `accent`
- Icon spring-scales in from 0.8 → 1.0 over 14 frames

### Code Snippet
- Geist Mono, 42px
- Syntax highlighting using the Shiki `github-dark-default` theme
- Typewriter reveal: one character per 2 frames, accelerate after 30 chars
- Optional caret: 2-frame blink cycle

### Screen Recording
- Import via Remotion's `<Video>` component
- Wrap in a device chrome SVG (browser top bar or macOS window chrome)
- Slight zoom: 1.0 → 1.08 over the full duration, subtle parallax
- Ken-Burns pan if the focal area is known

### Comparison Split
- 50/50 vertical split: left `#141414`, right `#0A0A0A`
- Labels at top: *"Traditional RAG"* vs *"Vectorless"* (40% muted)
- Assets slide in from off-screen, staggered 6 frames

### Benchmark Chart
- Horizontal bar chart
- Animated fill: `spring` from width 0 → target, staggered 8 frames per bar
- Numeric labels animate from 0 to target value synced with bar
- Axis labels 36px, bar labels 48px

### Call to Action
- URL card: `vectorless.store` in Geist Mono, 84px
- Secondary line: GitHub path or CTA text in muted
- Spring-in, no slide — CTA arrives with authority
- NO "Sign up free" / "Try now" / "Click here" language. The URL is the CTA.

## Audio Mixing

- **Voiceover:** ElevenLabs default volume (0.85) — do not normalize
- **Music bed:** 0.12 volume, ducked by 0.04 while narration is active
- **SFX:** 0.6 volume, 8-frame fade on both sides, never on every scene (reserve for emphasis beats)

Music selection: instrumental, sub-100 BPM, ambient electronic or cinematic. Never vocal, never royalty-free library music that's been in a million ads. Use `elevenlabs/music` skill to generate custom beds on request.

## What NOT to Do

- Do not use stock footage of "people shaking hands in an office"
- Do not use animated 3D logos unless the user specifically asks
- Do not use "line draws" (the SVG self-drawing effect) — dated
- Do not show the product name more than twice in a video — once at open, once at CTA
- Do not add a typewriter to every text element — reserve it for code blocks
- Do not use ease-in-out on everything — spring is the default motion language

## What To Do When In Doubt

- Slow it down by 20%. Amateur videos are always too fast.
- Add more whitespace. Amateur videos always crowd the frame.
- Cut a scene. Most videos have one scene too many.
- Re-read the voice section of `system.md`.
