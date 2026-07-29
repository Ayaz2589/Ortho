# UI Contract: Skeleton primitive, counts helper, and route dispatcher

The "interfaces" this feature exposes are internal React components + a pure helper. Contracts
below are what tests assert against (behavior/semantics, not pixels — Principle VI).

## 1. `lib/skeletonCounts.ts` (pure helper)

```ts
export type SkeletonCountKey =
  | 'transactions' | 'goals' | 'housing' | 'tags'
  | 'reportsSavings' | 'reportsCategories'

export const SKELETON_COUNT_CAP: number            // = 24

/** Validated, clamped read. Never throws. Returns `fallback` on any invalid/absent value. */
export function readSkeletonCount(key: SkeletonCountKey, fallback: number): number

/** Merge one count. No-op if storage unavailable. Clamps to [0, CAP]. Never throws. */
export function writeSkeletonCount(key: SkeletonCountKey, n: number): void
```

**Contract tests**
- Absent key → returns `fallback`.
- Round-trip: `write(k, 12)` then `read(k, 3)` → `12`.
- Clamp on write: `write(k, 9999)` then `read(k, 3)` → `SKELETON_COUNT_CAP`.
- Reject invalid stored values (string, negative, `NaN`, float, null) → returns `fallback`.
- Corrupt JSON blob under the key → returns `fallback` (no throw).
- `write` preserves other keys already present in the object.
- Storage throwing (getItem/setItem) is swallowed; read returns `fallback`, write is a no-op.

## 2. `components/ui/Skeleton.tsx` (primitive)

```tsx
export function Skeleton(props: {
  className?: string
  width?: number | string
  height?: number | string
  radius?: number | 'full'
}): JSX.Element
// optional convenience wrappers:
export function SkeletonText(props: { lines?: number; className?: string }): JSX.Element
```

**Contract**
- Renders a single block with `background: var(--chip-bg)` (token only — no hardcoded color, no
  `bg-muted`).
- Has **no** animation class (`animate-pulse` absent) and no gradient — motionless (Principle IV).
- Is decorative: carries `aria-hidden="true"`; is not focusable and is not a `<button>`/link.
- Honors `width`/`height`/`radius` props via inline style using the given values.

## 3. `components/skeletons/*` (route + section skeletons)

Each page skeleton renders inside the same layout container as its real page
(`ReadingColumn`, dashboard grid, etc.) and is wrapped by an accessible busy region.

**Shared contract for every page skeleton**
- Top-level element (or a wrapper) has `role="status"` and `aria-busy="true"` and an accessible
  name of "Loading" (a visually-hidden label is acceptable).
- Contains only `Skeleton` blocks and layout — **no** interactive/focusable elements, **no** real
  data, **no** "Loading…" text node visible on screen.

**Per-surface shape + sizing**

| Skeleton | Shape mirrors | Row/card count |
|---|---|---|
| `DashboardSkeleton` | summary card + widget cards | fixed (matches the widget stack) |
| `TransactionsSkeleton` | ledger: day headers + transaction rows | `max(1, readSkeletonCount('transactions', ~8))` |
| `HousingSkeleton` | property cards | `max(1, readSkeletonCount('housing', ~2))` |
| `BudgetsSkeleton` | static category groups + rows | fixed (from category-group count) |
| `GoalsSkeleton` | goal cards | `max(1, readSkeletonCount('goals', ~3))` |
| `SettingsSkeleton` | section cards + link rows | fixed (matches section list) |

## 4. `components/skeletons/RouteSkeleton.tsx` (dispatcher)

```tsx
export function RouteSkeleton(): JSX.Element
```

**Contract**
- Reads `usePathname()` and returns the matching page skeleton:
  `/dashboard`→Dashboard, `/transactions`→Transactions, `/housing`→Housing, `/budgets`→Budgets,
  `/goals`→Goals, `/settings*`→Settings.
- An unrecognized path returns a generic calm skeleton (still a `role="status"` busy region) —
  **never** the "Loading…" string.

**Contract tests** (mock `usePathname`)
- Each known path renders its corresponding skeleton (assert a stable `data-testid` or the
  presence of that skeleton's characteristic structure/label).
- Unknown path renders the generic skeleton, not text "Loading…".

## 5. Wiring contracts

**`app/(app)/layout.tsx` (Shell)**
- The `loading` branch renders `<RouteSkeleton />` instead of the `Loading…` string.
- Paywall (`gateState === 'lapsed'`), biometric lock (`!active`), and the error banner + Retry
  continue to take precedence exactly as today (a skeleton never masks lapsed/locked/failed).

**`lib/store.tsx` (`loadAll` success path)**
- After a successful `loadAll`, calls `writeSkeletonCount` for `transactions`, `goals`, `housing`
  (properties length), and `tags`. Recording failures never affect bootstrap.

**`components/dashboard/SavingsRateView.tsx` / `CategoryDeepDiveView.tsx`**
- The `status === 'loading'` branch renders a chart/rows skeleton sized by
  `readSkeletonCount('reportsSavings'|'reportsCategories', default)` instead of the "Loading…"
  text.
- `status === 'error'` and the empty/no-activity branches are unchanged.
- On `status === 'ready'`, the row count is recorded (in the view or the hook) for next time.
