<!--
Sync Impact Report
- Version change: 1.1.0 → 2.0.0 (MAJOR — redefinition of a core principle and the
  project's foundational framing; backward-incompatible with prior "iOS is canonical,
  two implementations" governance)
- Modified principles:
  - Opening framing paragraph — "iOS app is canonical" → "web/TypeScript codebase is
    the single canonical implementation; iOS is that same implementation, Capacitor-
    wrapped, not a second one"
  - III. Right Form Factor Per Canvas → III. Right Form Factor Per Canvas (redefined:
    no longer implies a separate native iOS codebase; describes canvas-appropriate
    presentation delivered from one codebase, including the Capacitor-wrapped iOS shell)
  - VI. Test-Driven & Regression-Safe (renamed emphasis only: "golden vectors" reframed
    from a cross-language lock to a single-implementation regression/pinning suite)
- Added sections: none
- Removed sections: none
- Additional Constraints: added a line placing `iOS/Ortho-iOS/` (the frozen native
  Swift app) outside this constitution's governance
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — no "canonical"/two-implementation
    references found; no change needed
  - ✅ .specify/templates/spec-template.md — no "canonical"/two-implementation
    references found; no change needed
  - ✅ .specify/templates/tasks-template.md — no "canonical"/two-implementation
    references found; no change needed
  - ⚠ README.md, PARITY.md, docs/index.md, docs/ios.md, docs/web.md, docs/shared.md,
    docs/makefile.md, FUTURE-TASKS.md still describe the pre-021 two-implementation
    model by name — intentionally left for feature 021's own implementation tasks
    (specs/021-capacitor-ios-consolidation/), which scope that docs sweep in full;
    not rewritten here to avoid duplicating that work ahead of the plan/tasks phases.
- Follow-up TODOs: none — no placeholder tokens deferred.
-->

# Ortho Constitution

Ortho is a calm, shared budgeting app with one canonical implementation — the
web/TypeScript codebase (`web/`) — delivered natively per canvas: a Capacitor-
wrapped native shell on iOS, and responsive layouts spanning phone to desktop on
web. There is no second, independently-built implementation to keep in sync;
every canvas is the same product, adapted, never a redesign. (The historical
native SwiftUI app, `iOS/Ortho-iOS/`, is frozen and excluded from this
constitution's governance — see Additional Constraints.) This constitution
governs all Ortho front-end work.

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
One codebase presents itself with native-appropriate affordances per canvas,
never a uniform lowest-common-denominator UI: bottom tab bar on compact/mobile,
left sidebar on desktop; bottom sheets on the Capacitor-wrapped iOS shell,
centered modals / right drawers on desktop web. On iOS specifically, "native
appropriate" is a hard requirement, not a stretch goal: safe-area insets (notch,
Dynamic Island, home indicator) are always respected, the on-screen keyboard
never covers the focused field, scrolling never shows browser-style rubber-band
bounce or text-selection callouts, and the status bar/launch screen match the
current light/dark theme. Content width is always capped and centered — money
lists are unreadable when a row spans an ultrawide monitor.

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
deterministic tests (golden-vector-style fixtures where they fit). With one
canonical implementation, these fixtures serve as a regression/pinning suite —
catching accidental behavior changes in the pure logic they cover — rather than
a cross-language parity lock between two independently-built clients. Tests
assert observable behavior through public contracts and accessible DOM — not
private internals — so they survive refactors; they are deterministic and
isolated (inject reference dates, never assert against the real clock; mock the
data layer, never hit the network). The suite runs with one command (`npm test`)
and gates merges; pure `lib/` business logic holds a high coverage bar.
Components are tested for behavior and semantics, not pixels.

## Additional Constraints

- **Stack**: Next.js (App Router) + React + TypeScript + Tailwind v4. Supabase
  for data; all money stored as USD cents and converted at render. iOS ships as
  this same codebase wrapped natively (Capacitor); there is no separate iOS
  source tree to keep in sync.
- **Responsive contract**: three breakpoints — compact `0–639`, medium
  `640–1023`, expanded `1024+`. Behavior must be correct from a phone up to an
  ultrawide monitor, with content capped (reading ≤ 560px, dashboard grid
  ≤ 1080px, list+detail panes bounded).
- **Parity**: the four destinations (Dashboard, Transactions, Housing, Settings)
  are preserved across every canvas; desktop is additive, not a rewrite.
- **`iOS/Ortho-iOS/` is out of scope for this constitution.** The native SwiftUI
  app is frozen (historical reference only, no new feature work) and is governed
  by neither this design system nor this testing discipline going forward.

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

**Version**: 2.0.0 | **Ratified**: 2026-06-11 | **Last Amended**: 2026-07-09

*2.0.0 (2026-07-09): redefined the project's foundational framing and Principle
III — the web/TypeScript codebase is now the single canonical implementation,
shipped to iOS via a Capacitor-wrapped native shell rather than a second,
independently-built SwiftUI app; Principle VI's "golden vectors" reframed from a
cross-language parity lock to a single-implementation regression suite; the
frozen native app explicitly excluded from this constitution's governance.
MAJOR — backward-incompatible redefinition of core governance (feature 021).*

*1.1.0 (2026-06-12): added Principle VI (Test-Driven & Regression-Safe) and a
test-driven step to the Development Workflow. MINOR — additive principle.*
