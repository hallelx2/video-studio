# DESIGN — Video Studio

This file is the **single source of visual truth** for the entire project. It governs:

- The desktop application UI (consumed by the `frontend-design` skill)
- The default aesthetic for generated videos (consumed by the `hyperframes` skill)

If a per-project brand exists (logo, brand colors, fonts in the source `organisation-projects/<name>/` folder), the agent forks this file into a project-scoped `DESIGN.md` and overrides the relevant sections. Otherwise, this is canon.

---

## Concept — "Atelier Noir"

A senior craftsman's workbench at 2am, the moment before something brilliant ships. Not a SaaS dashboard. Not a generic AI tool. The cockpit of a private film-grading suite — quiet authority, refined texture, and exactly one accent that carries every important moment.

References (in spirit, not in pixels): Linear's depth, Vercel's restraint, the typography of an Apple WWDC keynote chyron, the hush of a film-grading bay.

## Style Prompt

> Editorial dark canvas with paper-warm typography. A single saturated cinnabar accent reserved for the agent's heartbeat — render progress, active selection, the primary CTA. Brass/ochre as the secondary tone for metadata. Asymmetric layout: a dominant left rail of project intelligence, a workbench main stage. Hairline ochre borders, never gray. Subtle film-grain overlay. Heavy springy motion — like a thick door closing under its own weight. No drop shadows, no purple gradients, no generic card grids, no system fonts.

## Colors

| Role | Hex | Usage |
|---|---|---|
| `--ink` | `#0A0A0B` | Canvas. Deep, warm-leaning black. Never `#000`. |
| `--ink-raised` | `#131316` | Cards, surface elevation step 1. |
| `--ink-edge` | `#1C1C20` | Surface elevation step 2, hover states. |
| `--paper` | `#EDE7DC` | Primary text. Off-white with warmth — paper, not screen. |
| `--paper-mute` | `#A39E92` | Secondary text, helper copy. |
| `--brass` | `#C9A96E` | Hairlines, metadata, timestamps, secondary states. |
| `--cinnabar` | `#FF5E3A` | THE accent. Used sparingly: render progress, active project, primary CTA, agent thinking pulse. Never decoration. |
| `--cinnabar-glow` | `#FF5E3A33` | The cinnabar at 20% — used only for soft halos behind active elements. |
| `--alarm` | `#E83A3A` | Errors only. Never decorative. |

**Anti-palette (never use):** `#3b82f6`, `#8b5cf6`, `#a855f7`, any purple-blue gradient, pure `#000`, pure `#fff`, gray scales (`#999`, `#666`, etc — use `--paper-mute` or `--brass`).

## Typography

| Role | Font | Fallback | Notes |
|---|---|---|---|
| Display | **Fraunces** (variable, with optical size) | Georgia | Headlines, project titles, scene title cards. Use opsz 144 above 60px, opsz 72 below. |
| Body | **Geist Sans** | system-ui | UI copy, scripts. Tight tracking (-0.01em), generous line-height (1.55). |
| Mono | **JetBrains Mono** | ui-monospace | Render logs, file paths, code, agent stream. Tabular-nums always on. |

**Numerical data:** `font-variant-numeric: tabular-nums` — non-negotiable. Render times, durations, file sizes must align column-perfect.

**Anti-typography (never use):** Inter, Roboto, Arial, system-ui as a stylistic choice, rounded display fonts, decorative scripts.

## Layout Language

The desktop app is **asymmetric on purpose**. No centered hero. No 12-column SaaS grid.

```
┌─────────────────────────────────────────────────────────────┐
│ ▌ Video Studio                                       ◌ ◌ ◌ │  ← chrome-thin titlebar (28px)
├──────────────────┬──────────────────────────────────────────┤
│                  │                                          │
│  PROJECTS        │  WORKBENCH                               │
│  ─────────       │  (script editor / preview)               │
│  ▸ vectorless    │                                          │
│    actian-vector │                                          │
│    hyperframes   │                                          │
│                  │                                          │
│  metadata        │                                          │
│  ────────        ├──────────────────────────────────────────┤
│  03 launches     │  AGENT STREAM                            │
│  12 drafts       │  (live tool calls, mono, scrolling)      │
│  ◌ idle          │                                          │
│                  │                                          │
└──────────────────┴──────────────────────────────────────────┘
   ~28% (~360px)                ~72%
```

- **Left rail (≈360px):** project list + metadata. The list is alphabetical, no avatars, no icons except an active dot. Metadata sits below: counters, status, settings entry — all in `--paper-mute` and `--brass`.
- **Workbench (top ≈58%):** script editor + scene-by-scene preview. Switches between [SCRIPT] [SCENES] [PREVIEW] via tab strip — no rounded pills, just underline-on-active.
- **Agent stream (bottom ≈42%):** monospace, live tool calls, scrolling. Tools log as: `<tool> <args>` in `--paper-mute`, results indent under in `--paper`. Errors flash `--alarm`. The agent's "thinking" indicator is a single pulsing `--cinnabar` dot.
- **Gutters:** 32px outer, 24px between major regions.
- **Padding:** generous. The app should feel under-populated, not packed.

## Borders, Surfaces, Texture

- **Borders:** `1px solid var(--brass)` at **15% alpha** — `rgba(201, 169, 110, 0.15)`. Never gray. Never thicker than 1px on the desktop UI.
- **Elevation:** by background tone, not shadow. Card = `--ink-raised`, hover = `--ink-edge`. **Never use `box-shadow` for depth.** Drop shadows are forbidden in this design.
- **Film grain:** SVG noise overlay at `opacity: 0.04`, fixed position, full viewport, `mix-blend-mode: overlay`. Always on. The app should never feel "clean" — it has texture.
- **Corners:** `border-radius: 2px` on inputs and cards, `0` on rails and chrome. No pill buttons. No fully rounded avatars (this app has none anyway).

## Motion Personality

**Weighted. Deliberate. Springy-but-restrained.** Think: a heavy door closing under its own mass, not a balloon.

- Page/route transitions: 320–420ms with `ease: [0.16, 1, 0.3, 1]` (a custom ease — slow start, decisive arrival).
- Hover states: 180ms `ease-out`, never longer.
- The agent's thinking pulse: cinnabar dot, 1.4s cycle, opacity 0.4 → 1.0 → 0.4, `ease: [0.4, 0, 0.6, 1]`.
- Render progress: cinnabar bar fills L→R with a barely-visible inner shimmer. No striped ::after gradients.
- Stagger on first paint of a list: 40ms per item, 200ms total max.
- **Forbidden:** bouncy springs (`stiffness: 300, damping: 10`-style overshoot), spinning loaders, skeleton-shimmer on empty states (use silent dashes instead), parallax on hover.

## Iconography

- **Lucide React only**, stroke 1.25px (default 2px is too heavy for this aesthetic), color `currentColor`.
- Never colored icons. Never duotone. Never illustrations.
- Active state on a nav icon: cinnabar fill on a single dot to its left, never on the icon itself.

## Cursor & Focus

- Default cursor everywhere except inputs and editor surfaces.
- Focus rings are `1px solid var(--cinnabar)` with `outline-offset: 2px`. No glow halos. Never the browser default.

## What NOT to Do

1. No purple/violet gradients of any kind.
2. No `Inter`, `Roboto`, or `system-ui` as a primary font choice.
3. No drop shadows — elevation comes from background tone only.
4. No centered hero layouts. The design is asymmetric.
5. No skeleton shimmer, no spinning loaders, no progress dots cycling.
6. No emoji in the UI. None. The mono stream may show `→` `✓` `✗` `◌` only.
7. No rounded full pills on buttons. 2px corners maximum.
8. No teal, no mint, no neon green. The accent is cinnabar — period.

---

## Default Video Aesthetic (for HyperFrames compositions)

When the agent generates a video and the source project has no detectable brand, fall back to this. The agent forks this section into the per-project `DESIGN.md` and may override colors/typography only — motion language and "What NOT to Do" persist.

**Canvas:** `--ink` (#0A0A0B) with the same film-grain overlay at higher opacity (0.06 — videos can take more texture than UI).

**Accent strategy for video:** the cinnabar carries hero moments — title reveals, the final CTA, a single statistic. Brass carries support text, footers, scene labels. Paper carries body and headlines.

**Typography for video:**
- Display headlines: **Fraunces** at 130–180px, opsz 144, weight 600.
- Subtitles/body: **Geist Sans** at 32–48px.
- Data, code, technical: **JetBrains Mono** at 24–32px.

**Motion for video** (from house-style + this overlay):
- Entrances only — exits are owned by transitions (per HyperFrames rules).
- Vary at least 3 eases per scene.
- First entrance offset 0.2–0.3s, never t=0.
- Numerical reveals use a counter tween, not a fade.

**Scene transition default:** a soft cinnabar wipe (left→right or top→bottom), 480ms, with a 1px brass leading edge. Used between every scene without exception.

**Aspect ratios supported:** 1920×1080 (YouTube/X), 1080×1920 (LinkedIn/IG vertical), 1080×1080 (square). The agent picks based on the format the user requested.

---

## Source of Truth Order

When generating either UI or video:

1. Per-project `DESIGN.md` (if exists in `<project-folder>/DESIGN.md`)
2. This file
3. The `frontend-design` or `hyperframes` skill defaults

Higher precedence wins. The agent must never invent colors or fonts outside this hierarchy.
