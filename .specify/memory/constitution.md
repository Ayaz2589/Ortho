# Ortho Constitution

Ortho is a calm, shared budgeting app. The iOS app is the canonical expression
of the product; every other surface (web, desktop) is the *same product on a
different canvas*, never a redesign. This constitution governs all Ortho
front-end work.

## Core Principles

### I. One Design System, Tokens Only
All color, type, spacing, radius, and motion come from the shared design tokens
(`colors_and_type.css` / `app/globals.css` + `tailwind.config.ts`). No hardcoded
colors, no ad-hoc font sizes, no new palette entries for "polish." The palette is
closed: warm off-white surfaces, graphite type, hairline rules, exactly two
accents — sage `--positive` (incoming money) and sand `--accent` (focus/links).
Loss/cost is never red. Meaning is carried by position and weight, not color.

### II. Calm Over Dense (NON-NEGOTIABLE)
Money is the headline; everything else recedes. No gradients, patterns,
illustrations, emoji in chrome, or saturated status colors. Hairlines over
borders (`0.5px var(--hairline)`); inset cards sit on the background with **no
shadow** — shadow is reserved for genuinely floating chrome (modals, drawers,
menus). On larger canvases, added space is *room to breathe, not room to cram*.
Never shrink type or stretch rows to fit more data.

### III. Right Form Factor Per Canvas
Each canvas uses native-appropriate affordances while preserving the product:
bottom tab bar on compact/mobile, left sidebar on desktop; bottom sheets on iOS,
centered modals / right drawers on web. Content width is always capped and
centered — money lists are unreadable when a row spans an ultrawide monitor.

### IV. Plainspoken Voice & Money Formatting
Second-person, plainspoken copy ("Activity", not "Transactions feed"). Money
reads as money (`$87.42`), income gets `+`, shown negatives use the Unicode minus
(`−`), figures are always tabular, and amounts are never abbreviated (`$3.4K`).
Empty/loading/error states are short and never alarmist — no red panels, no
skeleton shimmer.

### V. Accessible & Interaction-Complete
Every interactive element is a real semantic control (`<button>`, `<nav>`,
labelled inputs), keyboard-reachable in DOM order, with a visible sand
focus-visible ring. Full hover/active/focus states on web. Hit targets ≥ 40px
(≥ 44px on touch). Contrast meets AA; secondary text shades are never used for
primary reading text. `prefers-reduced-motion` is respected.

### VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)
New behavior is developed test-first: a failing test describes the intended
behavior before the code that satisfies it. **Money math and date logic are never
shipped without coverage** — currency/cents conversion, splits, mortgage and
insight math, and date grouping are pure functions and must stay locked by
deterministic tests (golden vectors where they fit). Tests assert observable
behavior through public contracts and accessible DOM — not private internals — so
they survive refactors; they are deterministic and isolated (inject reference
dates, never assert against the real clock; mock the data layer, never hit the
network). The suite runs with one command (`npm test`) and gates merges; pure
`lib/` business logic holds a high coverage bar. Components are tested for behavior
and semantics, not pixels.

## Additional Constraints

- **Stack**: Next.js (App Router) + React + TypeScript + Tailwind v4. Supabase
  for data; all money stored as USD cents and converted at render.
- **Responsive contract**: three breakpoints — compact `0–639`, medium
  `640–1023`, expanded `1024+`. Behavior must be correct from a phone up to an
  ultrawide monitor, with content capped (reading ≤ 560px, dashboard grid
  ≤ 1080px, list+detail panes bounded).
- **Parity**: the four destinations (Dashboard, Transactions, Housing, Settings)
  and the existing mobile view are preserved; desktop is additive, not a rewrite.

## Development Workflow

- Spec-driven: features flow through `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`, recorded under `specs/`.
- Test-driven (Principle VI): write the failing test first; `npm test` (in `web/`)
  must be green and `lib/` coverage at threshold before merge.
- Design changes are validated against the `ortho-web` skill and this
  constitution before merge.
- Verification favors typecheck + `npm test` + visual review; never run a
  production build or delete `.next/` while a shared dev server is running.

## Governance

This constitution supersedes ad-hoc styling decisions. Any deviation (a new
color, a heavier border, a denser layout) must be justified in the feature's
Complexity Tracking and approved. The `ortho-web` skill is the operative,
detailed guidance for web/desktop work and must be consulted.

**Version**: 1.1.0 | **Ratified**: 2026-06-11 | **Last Amended**: 2026-06-12

*1.1.0 (2026-06-12): added Principle VI (Test-Driven & Regression-Safe) and a
test-driven step to the Development Workflow. MINOR — additive principle.*
