# Implementation Plan: Content-shaped loading skeletons

**Branch**: `032-loading-skeletons` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-loading-skeletons/spec.md`

## Summary

Replace the bare "Loading…" strings (the whole-shell bootstrap gate in `app/(app)/layout.tsx`
and the inline text in the Reports views) with calm, **motionless** placeholder skeletons that
match the shape of the content about to render. For dynamic list/table surfaces
(Transactions, Goals, Housing, Reports rows), size the skeleton from the item count recorded at
the end of the previous successful load, persisted in `localStorage`. Statically-shaped surfaces
(Dashboard widgets, Budgets category list, Settings sections) get fixed, layout-matching
skeletons. The single store-level `loading` flag remains the loading signal for core routes; a
new pathname-keyed `RouteSkeleton` dispatcher chooses the right shape. Skeletons are static
blocks in existing tokens (no shimmer/pulse) to honor the constitution's "no skeleton shimmer".

## Technical Context

**Language/Version**: TypeScript, React 19.2.4, Next.js 16.2.9 (App Router, `output: 'export'`)

**Primary Dependencies**: Tailwind v4 (tokens via `app/globals.css`), `lucide-react`; no new deps
(shadcn skeleton is adapted by hand, not installed — it would pull `bg-muted`/`animate-pulse`
which violate the token palette and the no-shimmer rule).

**Storage**: `localStorage` — a single namespaced JSON map of remembered per-collection counts
(same client-preference pattern as `ortho.flags`, `dashboardRange`).

**Testing**: Vitest (`npm test`, UTC), jsdom per-file for component suites; pure `lib/` logic node.

**Target Platform**: Responsive web (Vercel static export) + Capacitor iOS shell — one codebase.

**Project Type**: Web application (single canonical `web/` project).

**Performance Goals**: No measurable initial-load regression; skeleton row counts capped so a
huge remembered count never renders an absurdly long DOM. Skeleton component must not enter the
eager desktop-composition chunks it is replacing (it is tiny and form-factor-agnostic).

**Constraints**: Constitution — tokens only, calm (no gradients/patterns), **no skeleton
shimmer**, `prefers-reduced-motion` respected, no bold; accessibility (busy status to AT, no
false controls). Static export: no `useSearchParams`; `usePathname()` is fine.

**Scale/Scope**: 6 core routes + 2 Reports views; ~1 primitive, ~1 storage helper, ~7 skeleton
components, 2 wiring points (layout Shell, store recording), 2 Reports edits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. One Design System, Tokens Only | PASS — skeleton fill uses `var(--chip-bg)` / `var(--hairline)`; no new palette entries, no hardcoded colors. |
| II. Calm Over Dense (NON-NEGOTIABLE) | PASS — static blocks, no gradient sweep, no shadow; inset on background. |
| III. Right Form Factor Per Canvas | PASS — skeletons use the same responsive containers (`ReadingColumn`, grid) as the real pages; content stays capped/centered. |
| IV. Plainspoken Voice & Money Formatting | PASS — the rule "no skeleton shimmer" is honored explicitly: skeletons are motionless. This is the governing constraint and the design obeys it (FR-008). |
| V. Accessible & Interaction-Complete | PASS — skeleton container carries `aria-hidden` on decorative blocks and a `role="status"`/`aria-busy` region conveys "loading"; no focusable/clickable placeholders; `prefers-reduced-motion` moot (no motion). |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | PASS — pure helper (`skeletonCounts`) and the dispatcher are unit-tested first; Reports loading-state behavior tested; no money/date math touched. |

**Result**: No violations. Complexity Tracking not required. The one apparent tension (shadcn's
default shimmer) is resolved by adapting the component to a motionless token-based block; this is
a stricter, fully-compliant interpretation, not a deviation.

## Project Structure

### Documentation (this feature)

```text
specs/032-loading-skeletons/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── skeleton-components.md   # UI contract for the primitive + dispatcher + counts helper
├── checklists/
│   └── requirements.md  # spec quality checklist (already created)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
web/
├── components/
│   ├── ui/
│   │   └── Skeleton.tsx                # NEW — calm, static skeleton primitive (+ Skeleton, SkeletonText helpers)
│   └── skeletons/                      # NEW — route-shaped skeletons
│       ├── RouteSkeleton.tsx           # pathname → correct page skeleton (dispatcher)
│       ├── DashboardSkeleton.tsx
│       ├── TransactionsSkeleton.tsx    # sized by remembered "transactions" count
│       ├── HousingSkeleton.tsx         # sized by remembered "housing" count
│       ├── BudgetsSkeleton.tsx         # fixed shape (static category list)
│       ├── GoalsSkeleton.tsx           # sized by remembered "goals" count
│       └── SettingsSkeleton.tsx        # fixed shape (static sections)
├── lib/
│   └── skeletonCounts.ts               # NEW — read/write remembered per-collection counts (validated, capped)
├── app/(app)/layout.tsx                # EDIT — Shell: render <RouteSkeleton/> instead of the "Loading…" string
├── lib/store.tsx                       # EDIT — after loadAll success, record counts for dynamic collections
├── components/dashboard/SavingsRateView.tsx      # EDIT — chart/rows skeleton in the 'loading' branch
├── components/dashboard/CategoryDeepDiveView.tsx # EDIT — rows skeleton in the 'loading' branch
└── test/
    ├── skeletons/skeletonCounts.test.ts          # NEW — helper unit tests
    ├── skeletons/Skeleton.test.tsx               # NEW — primitive: static, aria, tokens
    ├── skeletons/RouteSkeleton.test.tsx          # NEW — dispatcher route mapping + count sizing
    └── skeletons/reports-loading-skeleton.test.tsx # NEW — Reports views: skeleton in loading, error/empty unchanged
```

**Structure Decision**: Single web project. The loading gate stays centralized in the Shell
(`app/(app)/layout.tsx`) — pages are NOT modified to own their loading state (they already assume
data is present after bootstrap). Instead, a small `RouteSkeleton` dispatcher reads `usePathname()`
and renders the matching page-shaped skeleton. Count recording is centralized in the store's
`loadAll` (the single place all core data lands), keeping pages untouched. Reports views own their
own async state, so they are edited directly.

## Key Design Decisions

1. **Motionless skeletons (constitution FR-008).** The `Skeleton` primitive is a `<div>` (or
   `<span>`) with `background: var(--chip-bg)`, a border-radius, and explicit width/height — no
   `animate-pulse`, no gradient. This is the single most important compliance point.

2. **Centralized gate, route-aware shape.** Keeping the gate in the Shell avoids touching six
   pages and avoids each page re-implementing a loading branch. `RouteSkeleton` maps
   `usePathname()` → the right skeleton; an unknown path falls back to a generic calm skeleton.

3. **Counts recorded in `loadAll`, read in skeletons.** After a successful `loadAll`, the store
   writes `transactions`, `goals`, `housing` (properties), and `tags` counts via
   `writeSkeletonCount`. Skeletons read them via `readSkeletonCount(key, default)`. Reports rows
   are recorded inside `useReportsData` on `ready` and read by the Reports skeletons.

4. **Sizing rules.** `readSkeletonCount` validates (finite, ≥ 0), clamps to `[0, CAP]`
   (CAP = 24 rows/cards — enough to fill a tall viewport, bounded for perf), and returns a
   surface-specific default when nothing valid is stored. A recorded 0 still renders a minimal
   placeholder (≥ 1 row) so the screen is never blank mid-load (FR/edge-case).

5. **Static surfaces keep fixed shapes.** Budgets renders a static category list and Settings
   renders static sections — their skeletons are deterministic (sized from the known category
   groups / section count), so no remembered count is needed for them. Documented, not an omission.

6. **Bundle discipline.** `Skeleton` + `skeletonCounts` are tiny and token-only; importing them
   eagerly in the Shell is negligible. The skeletons do NOT import the heavy desktop compositions
   or recharts — they draw their own placeholder shapes, so no eager-chunk regression.

## Complexity Tracking

No constitution violations — section intentionally empty.
