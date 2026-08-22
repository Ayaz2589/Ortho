# Phase 0 Research: Content-shaped loading skeletons

All Technical Context items were resolvable from the existing codebase and constitution; no
external unknowns. Findings below record the decisions that shape Phase 1.

## R1 — How to satisfy "shadcn skeleton" without violating the constitution

- **Decision**: Adapt the shadcn skeleton *pattern* (a reusable `Skeleton` primitive that renders
  a placeholder block) but restyle it to Ortho tokens and make it **motionless**. Do not install
  shadcn or copy its literal classes.
- **Rationale**: shadcn's skeleton is `<div className="animate-pulse rounded-md bg-muted" />`.
  `bg-muted` is not in Ortho's closed token palette (Principle I) and `animate-pulse` is exactly
  the "skeleton shimmer" Principle IV forbids. A static block in `var(--chip-bg)` delivers the
  same UX role (a shaped placeholder) while remaining compliant.
- **Alternatives considered**: (a) Install shadcn + a `--muted` token — rejected: opens the closed
  palette and re-introduces shimmer. (b) A subtle opacity pulse gated on `prefers-reduced-motion`
  — rejected: Principle IV bans the shimmer unconditionally, not just under reduced-motion.

## R2 — Skeleton fill token

- **Decision**: Use `var(--chip-bg)` as the primary fill (with `var(--hairline)` for thin
  dividers where a skeleton mirrors a hairline-ruled row).
- **Rationale**: `--chip-bg` is a subtle neutral overlay defined in both light and dark themes
  (`rgba(26,24,21,0.05)` / `rgba(255,255,255,0.07)`), already used for chips/nav-hover — it reads
  as a quiet placeholder against `--bg`/`--surface` without introducing a new color.
- **Alternatives considered**: `--surface-2` (too solid/panel-like for small line placeholders);
  a bespoke `--skeleton` token (unnecessary new palette entry).

## R3 — Where the loading signal lives and how to make it route-aware

- **Decision**: Keep the single `loading` gate in `app/(app)/layout.tsx` `Shell`; render a new
  `RouteSkeleton` (keyed on `usePathname()`) in place of the "Loading…" string. Do not push
  loading branches into the six page components.
- **Rationale**: The store loads all core data in one `loadAll` (`web/lib/store.tsx`), so `loading`
  is a single global signal; pages assume data is present once mounted. A dispatcher is far less
  invasive than editing every page and keeps the paywall/lock/error precedence in one place.
- **Alternatives considered**: Per-page loading branches — rejected: 6× duplication, risks pages
  rendering against absent data, and fights the existing centralized gate.
- **Static-export note**: `usePathname()` (from `next/navigation`) is allowed; the banned hook is
  `useSearchParams` (Suspense deopt). No dynamic routes involved.

## R4 — Where remembered counts are recorded

- **Decision**: Record counts in the store's `loadAll` success path (transactions, goals,
  properties→"housing", tags), and in `useReportsData` on `ready` (savings rows, category rows).
- **Rationale**: `loadAll` is the one place all core collections land after a successful fetch —
  a single write site keeps pages untouched and counts always reflect the latest real data.
  Reports data is fetched separately, so it owns its own recording.
- **Alternatives considered**: Recording inside each page on render — rejected: scatters writes,
  double-counts across re-renders, and couples pages to the skeleton feature.

## R5 — Persistence shape, validation, and cap

- **Decision**: One `localStorage` key `ortho.skeletonCounts` holding a JSON object
  `{ [collection]: number }`. `readSkeletonCount(key, fallback)` returns a validated, clamped
  value; `writeSkeletonCount(key, n)` merges one field. Cap = **24**; a stored 0 yields a minimal
  **1** row at render time (handled by the skeleton, not the store).
- **Rationale**: Mirrors existing client-preference patterns (`ortho.flags`). A single object
  avoids key sprawl. Validation (finite, integer, ≥ 0) + clamp makes corrupt/hostile values safe
  (FR-013). Cap bounds DOM size for perf (FR-007). Storage-unavailable (private mode) is caught
  and falls back to the default silently (edge case).
- **Alternatives considered**: One key per collection (sprawl); no cap (unbounded DOM on a large
  ledger); server-side persistence (over-engineered for a placeholder-sizing nicety).

## R6 — Which surfaces are dynamic vs. static

- **Decision**: Dynamic (remembered count): **Transactions** ledger rows, **Goals** cards,
  **Housing** property cards, **Reports** savings/category rows. Static (fixed shape, no
  remembered count): **Dashboard** (fixed widget cards), **Budgets** (static category list —
  sized from `CATEGORY_GROUPS`), **Settings** (static section list).
- **Rationale**: A remembered count only helps where the number of items varies with the user's
  data. Budgets and Settings render a known, data-independent number of rows, so their skeletons
  are deterministic without persistence. The spec's mention of "budgets/tags" is honored by
  sizing budgets from its static groups and by recording a `tags` count for any tag-list surface.
- **Alternatives considered**: Remembering counts for every surface — rejected: needless
  persistence for deterministic layouts.

## R7 — Accessibility of a loading placeholder

- **Decision**: Wrap each route/section skeleton in a `role="status"` + `aria-busy="true"`
  container with an accessible label (e.g. "Loading"); mark the individual decorative blocks
  `aria-hidden`. No placeholder is focusable or a real control.
- **Rationale**: Conveys the busy state to assistive tech (replacing the visible "Loading…"
  text's implicit meaning) without exposing dozens of meaningless nodes or fake buttons
  (Principle V, FR-012).
- **Alternatives considered**: A visually-hidden "Loading…" text node only — acceptable but the
  `role="status"` region is the more standard, testable contract; we keep a visually-hidden label
  inside it for screen readers.
