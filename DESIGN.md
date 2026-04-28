# DESIGN — Video Studio

This file is the **single source of visual truth** for the entire project. It governs:

- The desktop application UI (consumed by the `frontend-design` skill)
- The default aesthetic for generated videos (consumed by the `hyperframes` skill)

If a per-project brand exists (logo, brand colors, fonts in the source `organisation-projects/<name>/` folder), the agent forks this file into a project-scoped `DESIGN.md` and overrides the relevant sections. Otherwise, this is canon.

---

## 1. Concept — "Nocturnal Command Center"

A developer's late-night control panel where dense pitch-black surfaces hold electric cyan signals. Not a SaaS dashboard. Not a generic AI tool. The cockpit of a tool built *by* developers *for* developers — quiet authority, terminal-grade typography, and bioluminescent accents that emit light from within the dark.

References (in spirit, not in pixels): the hush of a code editor, the precision of an IDE chyron, the bioluminescence of deep-water organisms, the brutalist offset shadows of a raw control panel.

## 2. Style Prompt

> Pitch-black canvas (`#0f0f0f`) with content floating inside barely-visible white-opacity borders (4–12%). Dual-font identity: geometric sans for content, JetBrains Mono for technical credibility. Ultra-tight heading line-heights (0.87–1.0) creating compressed authority. Color rationed like a rare resource — pure white for primary text, semi-transparent white for secondary, and Electric Cyan or Composio Cobalt reserved exclusively for the agent's heartbeat (render progress, active selection, primary CTA). Hard-offset brutalist shadows (`4px 4px`) on select cards. No drop shadows on body, no purple gradients, no rounded display fonts, no system-ui as a stylistic choice.

## 3. Visual Theme & Atmosphere

The interface is a nocturnal command center — a dense, developer-focused darkness punctuated by electric cyan and deep cobalt signals. The entire experience is built on an almost-pure-black canvas (`#0f0f0f`) where content floats within barely-visible containment borders, creating the feeling of a high-tech control panel rather than a traditional UI.

The visual language leans into the aesthetic of code editors and terminal windows. JetBrains Mono appears alongside geometric sans-serif precision, reinforcing the message that this is a tool built *by* developers *for* developers. Decorative elements are restrained but impactful — subtle cyan-blue gradient glows emanate from cards and sections like bioluminescent organisms in deep water, while hard-offset shadows (`4px 4px`) on select elements add a raw, brutalist edge that prevents the design from feeling sterile.

**Key Characteristics:**
- Pitch-black canvas with near-invisible white-border containment (4–12% opacity)
- Dual-font identity: geometric sans for content, monospace (JetBrains Mono) for technical credibility
- Ultra-tight heading line-heights (0.87–1.0) creating compressed, impactful text blocks
- Bioluminescent accent strategy — cyan and blue glows that feel like they're emitting light from within
- Hard-offset brutalist shadows (`4px 4px`) on select interactive elements
- Monochrome hierarchy with color used only at the highest-signal moments
- Developer-terminal aesthetic that bridges product UI and documentation

## 4. Colors

| Token | Hex / RGBA | Usage |
|---|---|---|
| `--color-void` | `#0F0F0F` | Page canvas. Not pure black — a hair warmer to reduce eye strain. Never `#000` for the page. |
| `--color-surface` | `#000000` | Card interiors, deep-nested containers. Pure black creates subtle depth from the page. |
| `--color-elevated` | `#2C2C2C` | Hover state, raised secondary surfaces, divider lines on dark. |
| `--color-fg` | `#FFFFFF` | Primary text, headings, high-emphasis content. Pure white. |
| `--color-fg-muted` | `rgba(255,255,255,0.6)` | Secondary body text, link labels — visible but deliberately receded. (Ghost White) |
| `--color-fg-faint` | `rgba(255,255,255,0.5)` | Tertiary text, placeholders, metadata. (Whisper White) |
| `--color-fg-ghost` | `rgba(255,255,255,0.2)` | Phantom buttons, deeply receded UI chrome. (Phantom White) |
| `--color-mist-12` | `rgba(255,255,255,0.12)` | Highest-opacity border — prominent card edges, content separators. |
| `--color-mist-10` | `rgba(255,255,255,0.10)` | Standard container border on dark surfaces. **Workhorse.** |
| `--color-mist-08` | `rgba(255,255,255,0.08)` | Subtle section dividers, secondary card edges. |
| `--color-mist-06` | `rgba(255,255,255,0.06)` | Near-invisible containment for background groupings. |
| `--color-mist-04` | `rgba(255,255,255,0.04)` | The faintest border — atmospheric separation only. |
| `--color-cobalt` | `#0007CD` | Composio Cobalt — core brand color. Quiet intensity. Used sparingly for high-priority brand moments. |
| `--color-cyan` | `#00FFFF` | Electric Cyan — THE accent. Render progress, active project, primary CTA, agent thinking pulse. Never decoration. |
| `--color-cyan-glow` | `rgba(0,255,255,0.12)` | Bioluminescent halo behind active cards — never at full saturation on large surfaces. |
| `--color-signal` | `#0089FF` | Signal Blue — focus ring, interactive borders. Bridge between Cobalt and Cyan. |
| `--color-ocean` | `#0096FF` | Ocean Blue — accent border on CTA buttons. Slightly warmer than Signal. |
| `--color-alarm` | `#E83A3A` | Errors only. Never decorative. |

**Anti-palette (never use):** `#3b82f6` blue, `#8b5cf6`/`#a855f7` purples, any purple-blue marketing gradient, pure `#000` for the page background, gray scales (`#999`, `#666` — use `--color-fg-muted` or `--color-mist-*`), warm colors (orange/yellow/red except `--color-alarm`).

### Gradient System
- **Cyan Glow**: Radial gradients using `--color-cyan` at very low opacity (12% max), creating bioluminescent halos behind cards.
- **Cobalt-to-Void Fade**: Linear gradients from Composio Cobalt fading into Void Black, used in hero backgrounds and section transitions.
- **Mist Wash**: Bottom-of-section atmospheric gradient using `--color-mist-04` to `--color-mist-08` for "horizon line" effects.

## 5. Typography

| Role | Font | Fallback | Notes |
|---|---|---|---|
| Sans / Display | **abcDiatype** | Geist, ui-sans-serif, system-ui | Geometric, precise, friendly. All headings, body, UI. |
| Mono | **JetBrains Mono** | ui-monospace, SFMono-Regular, Menlo, Consolas | Render logs, file paths, code, agent stream, stats. Tabular-nums always on. |

### Hierarchy

| Role | Size | Weight | Line Height | Notes |
|---|---|---|---|---|
| Display / Hero | 64px (4rem) | 400 | **0.87** (ultra-tight) | Massive, compressed headings |
| Section Heading | 48px (3rem) | 400 | 1.00 | Major feature section titles |
| Sub-heading L | 40px (2.5rem) | 400 | 1.00 | Secondary section markers |
| Sub-heading | 28px (1.75rem) | 400 | 1.20 | Card titles, feature names |
| Card Title | 24px (1.5rem) | 500 | 1.20 | Medium-emphasis card headings |
| Feature Label | 20px (1.25rem) | 500 | 1.20 | Smaller card titles, labels |
| Body Large | 18px | 400 | 1.20 | Intro paragraphs |
| Body / Button | 16px | 400 | 1.50 | Standard body, nav links, buttons |
| Caption | 14px | 400 | 1.63 | Descriptions, metadata |
| Label | 13px | 500 | 1.50 | UI labels, badges |
| Tag / Overline | 12px | 500 | 1.00, +0.3px tracking | Uppercase overline labels |
| Code Body | 16px (mono) | 400 | 1.50, -0.32px tracking | Inline code, terminal output |
| Code Small | 14px (mono) | 400 | 1.50, -0.28px tracking | Code snippets, technical labels |
| Code Overline | 14px (mono) | 400 | 1.43, +0.7px tracking | Uppercase technical labels |

**Numerical data:** `font-variant-numeric: tabular-nums` — non-negotiable. Render times, durations, file sizes must align column-perfect.

### Principles
- **Compression creates authority.** Heading line-heights are drastically tight (0.87–1.0). Large text feels dense and commanding rather than airy.
- **Dual personality.** Sans carries the product voice — geometric, precise, friendly. JetBrains Mono carries the technical voice — credible, functional.
- **Weight restraint.** Almost everything is weight 400. Weight 500 is reserved for small labels, badges, select card titles. Weight 700 appears only in microscopic system-mono contexts.
- **Negative letter-spacing on code.** JetBrains Mono uses `-0.28px` to `-0.32px` for dense, IDE-like code blocks.
- **Uppercase is earned.** Reserved exclusively for tiny overline labels (12px or smaller). Never on headings.

**Anti-typography (never use):** Inter, Roboto, Arial, system-ui as a stylistic choice, rounded display fonts, decorative scripts, serif display fonts.

## 6. Components

### Buttons

**Primary CTA (White Fill)**
- Background: `--color-fg` (Pure White)
- Text: near-black (`oklch(0.145 0 0)`)
- Padding: 8px 24px
- Radius: 4px
- Hover: subtle opacity reduction or slight gray shift

**Cyan Accent CTA**
- Background: `--color-cyan-glow` (12% cyan)
- Text: near-black
- Border: `1px solid --color-ocean`
- Radius: 4px
- Creates a "glowing from within" effect on dark backgrounds

**Ghost / Outline (Signal Blue)**
- Background: transparent
- Text: `--color-fg`
- Border: `1px solid --color-signal`
- Padding: 10px

**Ghost / Outline (Mist)**
- Background: transparent
- Text: `--color-fg`
- Border: `1px solid --color-mist-10`
- For secondary/tertiary actions

**Phantom Button**
- Background: `--color-fg-ghost` (20% white)
- Text: `--color-fg-faint` (50% white)
- No visible border. For deeply de-emphasized actions.

### Cards & Containers
- Background: `--color-surface` (`#000`) or transparent
- Border: `--color-mist-04` to `--color-mist-12` depending on prominence (default `--color-mist-10`)
- Radius: 2px for inline elements, 4px for content cards
- **Brutalist shadow** (signature): `rgba(0,0,0,0.15) 4px 4px 0px 0px` — selective use on distinctive feature cards
- Floating shadow: `rgba(0,0,0,0.5) 0px 8px 32px` — modals, overlays only
- Hover: subtle border opacity step up (`mist-10` → `mist-12`) or faint cyan glow

### Inputs & Forms
- Background: transparent or `--color-surface`
- Border: `--color-mist-10`
- Focus: border shifts to `--color-signal` or `--color-cyan`
- Text: `--color-fg`, placeholder: `--color-fg-faint`

### Navigation
- Sticky top bar on `--color-void`
- Logo white on left
- Nav links: `--color-fg` at 16px sans
- CTA: White Fill Primary
- Bottom border: `--color-mist-06` to `--color-mist-08`

## 7. Layout Principles

### Spacing System
- Base unit: 8px
- Scale: 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 30, 32, 40 (px)
- Button padding: 10px standard, 8px×24px for CTAs
- Section padding: generous vertical (80–120px between major sections)
- Card internal padding: 24–32px

### Grid & Container
- Max container width: ~1200px, centered
- Single column or 2–3 column grids for cards
- Asymmetric layouts: text blocks paired with screenshots/previews

### Whitespace Philosophy
- **Breathing room between sections.** Large vertical gaps create distinct chapters.
- **Dense within components.** Cards and text blocks are internally compact (tight line-heights, minimal padding) — focused information nodes.
- **Contrast-driven separation.** Use border opacity differences (mist-04 vs mist-10) rather than relying solely on whitespace.

### Border Radius Scale
- 2px: inline code, small tags, pre blocks (sharpest — technical precision)
- 4px: content cards, images, standard containers (workhorse)
- 37px: pill-shaped — select badges and CTAs (softer, approachable)
- 9999px+: circular elements, dots, avatar containers

## 8. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | No shadow, no border | Page background, inline text |
| 1 — Contained | `--color-mist-04` to `--color-mist-08`, no shadow | Background groupings, subtle sections |
| 2 — Card | `--color-mist-10` to `--color-mist-12`, no shadow | Content cards, code blocks |
| 3 — Brutalist | Hard-offset shadow `4px 4px 0 0 rgba(0,0,0,0.15)` | Distinctive feature highlights |
| 4 — Floating | Soft diffuse `0px 8px 32px rgba(0,0,0,0.5)` | Modals, overlays, popovers |

**Shadow Philosophy:** depth comes from **border opacity gradations**, not box-shadows. The hard-offset brutalist shadow is the signature — it breaks the sleek darkness with a raw, almost retro-computing feel. The soft diffuse shadow is reserved for truly floating elements.

### Decorative Depth
- **Cyan Glow Halos:** radial gradients using `--color-cyan-glow` (12%) behind feature cards. "Screen glow" — the UI emits light.
- **Cobalt-to-Void Washes:** linear gradients from `--color-cobalt` to `--color-void` for section backgrounds. Subtle color temperature shifts.

## 9. Motion

### Easing
- `--ease-composio: cubic-bezier(0.16, 1, 0.3, 1)` — heavy, decisive, like a thick door closing under its own weight.

### Animations
- **Cyan Pulse** (the agent's heartbeat): opacity 0.4 → 1.0 over 1.4s. Used on render progress dots, active session indicators, "thinking" states.
- **Stagger Entrance:** 40ms per item, 200ms total. Children fade + lift 8px on first paint.
- **Text Shimmer:** subtle horizontal sweep on text currently arriving. Used on streaming tool names and in-flight assistant text. Never on body copy.

## 10. Do's and Don'ts

### Do
- Use `--color-void` (`#0f0f0f`) as the primary canvas — never pure white, never pure black for the page.
- Keep heading line-heights ultra-tight (0.87–1.0) for compressed authority.
- Use white-opacity borders (`--color-mist-*`) — they're more important than shadows.
- Reserve `--color-cyan` for high-signal moments only — CTAs, glows, agent heartbeat.
- Pair sans + JetBrains Mono to reinforce the developer-tool identity.
- Use the hard-offset shadow (`4px 4px`) intentionally on select elements for brutalist personality.
- Layer opacity-based borders to create subtle depth without shadows.
- Use uppercase + letter-spacing only for tiny overline labels (12px or smaller).

### Don't
- Don't use bright backgrounds or light surfaces as primary containers.
- Don't apply heavy shadows everywhere — depth is border opacity, not box-shadow.
- Don't use `--color-cobalt` (`#0007cd`) as a text color — too dark on dark, too saturated on light.
- Don't increase heading line-heights beyond 1.2 — compression is core to the identity.
- Don't use bold (700) for body or heading text — 400–500 is the ceiling.
- Don't mix warm colors — the palette is strictly cool (blue, cyan, white, black).
- Don't use border-radius larger than 4px on content cards.
- Don't place `--color-cyan` at full opacity on large surfaces — accent only, 12% max for backgrounds.
- Don't skip the monospace font for technical content — JetBrains Mono is a credibility signal.

## 11. Responsive Behavior

| Breakpoint | Width | Key Changes |
|---|---|---|
| Mobile | <768px | Single column, collapsed nav, full-width cards, hero scales 28–40px |
| Tablet | 768–1024px | 2-column grids, condensed nav |
| Desktop | 1024–1440px | Full multi-column, expanded nav, 64px hero |
| Large | >1440px | Max-width centered, generous margins |

- Min touch target: 44×44px
- 3-col → 2-col → single-col stacking
- Hero text: 64 → 40 → 28px
- Code blocks: horizontal scroll on small viewports rather than wrap

## 12. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: "Pure White (`--color-fg`)"
- Page Canvas: "Void Black (`--color-void`, #0f0f0f)"
- Card Surface: "Pure Black (`--color-surface`, #000)"
- Brand Accent: "Composio Cobalt (`--color-cobalt`, #0007cd)"
- Signal Accent: "Electric Cyan (`--color-cyan`, #00ffff)"
- Heading Text: "Pure White (`--color-fg`)"
- Body Text: "Ghost White (`--color-fg-muted`, 60% white)"
- Card Border: "Border Mist 10 (`--color-mist-10`)"
- Focus Border: "Signal Blue (`--color-signal`, #0089ff)"

### Example Component Prompts
- "Build a feature card with `--color-surface` background, a `--color-mist-10` border at 1px, 4px corner radius, and a hard-offset shadow (4px right, 4px down, 15% black). Use `--color-fg` for the title in sans at 24px weight 500, and `--color-fg-muted` for the description at 16px."
- "Design a primary CTA: solid white background, near-black text, 8px×24px padding, 4px radius. Place it next to a secondary button with transparent background, `--color-signal` border."
- "Hero on `--color-void` with a 64px heading, line-height 0.87, sans 400. Center the text. Add a `--color-cyan-glow` radial halo behind the content. White CTA + cyan-accent secondary below."
- "Code snippet using JetBrains Mono at 14px with -0.28px letter-spacing on `--color-surface`. `--color-mist-10` border, 4px radius. White and cyan syntax."
- "Top nav on `--color-void`: white wordmark left, 4–5 sans nav links at 16px, white-fill CTA right. `--color-mist-06` bottom border."

### Iteration Guide
1. Focus on ONE component at a time.
2. Reference token names and hex codes — "use `--color-fg-muted` (60% white)" not "make it lighter".
3. Use natural language alongside measurements — "make the border barely visible" = `--color-mist-04` to `--color-mist-06`.
4. For glow effects: "`--color-cyan-glow` (12%) as a radial gradient behind the element".
5. Always specify font: sans for product/marketing, JetBrains Mono for technical/code.
