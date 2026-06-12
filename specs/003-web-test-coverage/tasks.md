---
description: "Task list for In-Depth Automated Testing for the Web App"
---

# Tasks: In-Depth Automated Testing for the Web App

**Input**: Design documents from `/specs/003-web-test-coverage/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/test-targets.md
**Tests**: This feature *is* the tests — every story phase produces test files.
**Constraint (all tasks)**: validate only with `npx tsc --noEmit` and `npm test` (run from
`web/`). NEVER run `next build`/`next dev` or delete `web/.next`. No real network/Supabase.

All paths are under `web/` unless noted.

## Phase 1: Setup (BLOCKING — must finish before any story)

- [x] T001 Add dev dependencies in `web/package.json`: `jsdom`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`, `@vitest/coverage-v8`
  (versions compatible with vitest 4 / React 19); install. Do NOT touch runtime deps.
- [x] T002 Add a `test:coverage` script (`vitest run --coverage`) to `web/package.json`;
  leave `test` as `vitest run`.
- [x] T003 Update `web/vitest.config.ts`: broaden `include` to
  `['test/**/*.test.ts', 'test/**/*.test.tsx']`, keep default `environment: 'node'`, add
  `setupFiles: ['./test/setup.ts']`, and configure `coverage` (provider `v8`, `include`
  scoped to `lib/**`, exclude `lib/types.ts`, `lib/supabase/**`, `lib/useMediaQuery.ts`,
  and `**/*.d.ts`; per-directory thresholds ~90% lines/branches for
  `lib/finance/**`, `lib/format.ts`, `lib/categories.ts`, `lib/api/**`). Ensure the `@/`
  path alias resolves in tests (vite tsconfig paths / alias to project root).
- [x] T004 Create `web/test/setup.ts`: `import '@testing-library/jest-dom/vitest'` and an
  `afterEach(() => cleanup())` from `@testing-library/react`.
- [x] T005 Verify the existing suites still run: `npm test` (mortgage + insights parity
  must stay green) and `npx tsc --noEmit` clean. This proves Phase 1 didn't break anything.

**Checkpoint**: `npm test` runs both environments; existing parity suites green.

## Phase 2: Foundational test helpers (BLOCKING for US2/US3 — independent of US1)

- [x] T006 [P] Create `web/test/helpers/fixtures.ts`: builders `makeUser(overrides)`,
  `makeHousehold(overrides)`, `makeTx(overrides)` (sensible defaults: expense, shared,
  one owner, amount_cents, ISO date) returning the real `lib/types` shapes.
- [x] T007 [P] Create `web/test/helpers/supabase-mock.ts`: `makeSupabaseMock(dataset)`
  returning a chainable client per research.md R3 — `auth.getUser()` resolves a fixed
  user; `from(table)` returns a thenable builder (`select/eq/in/order/limit` → this,
  awaiting → `{ data: dataset[table] ?? [], error: null }`); `insert/update/delete/upsert`
  record into `mock.calls` and resolve `{ error: null }`. Export the recorded calls.

**Checkpoint**: helpers compile under `tsc`; no test depends on real I/O.

---

## Phase 3: User Story 1 — Trustworthy money & date logic (P1) 🎯 MVP

**Goal**: Lock every untested pure `lib/` module with deterministic table-driven tests.
**Independent test**: `npm test` covers the logic modules with no UI/network; breaking any
helper turns a named test red. Files are independent — all `[P]`.

- [x] T008 [P] [US1] `web/test/money.test.ts` — `formatMoney` (USD/EUR/JPY, negative →
  `-`, positive + `leadingPlus` → `+`, zero), `toUSDCents` (round-trip, integer rounding,
  `rate===0 → 0`, zero-fraction `jpy` divisor) from `lib/finance/money.ts`.
- [x] T009 [P] [US1] `web/test/currency.test.ts` — `CURRENCIES` order, `CURRENCY_NAMES` &
  `FALLBACK_RATE_FROM_USD` complete over all keys, `currencyCode/currencySymbol/
  fractionDigits` from `lib/finance/currency.ts`.
- [x] T010 [P] [US1] `web/test/format.test.ts` — `startOfDay`/`startOfMonth`,
  `dayLabel` (Today/Yesterday/weekday/“MMM d” with injected `now`), `shortDate`/
  `mediumDate`/`monthYear`/`monthYearLong`, `groupByDay` (newest-first, item order),
  `groupDaysByMonth` (newest month first, day order preserved), `expenseTotal`
  (income excluded), `effectiveSplits` (even sums to 100, explicit passthrough, zero
  owners → `{}`), `relativeTime` — all from `lib/format.ts`, dates injected.
- [x] T011 [P] [US1] `web/test/categories.test.ts` — `categoryMeta` for each category,
  `SPEND_CATEGORIES` membership/shape, `paletteFor` from `lib/categories.ts`.
- [x] T012 [P] [US1] `web/test/aggregates.test.ts` — aggregation/sum/group helpers in
  `lib/api/aggregates.ts` (read the file first; assert math on fixture transactions,
  including empty input).
- [x] T013 [P] [US1] `web/test/utils.test.ts` — `cn()` merges, dedupes conflicting
  Tailwind classes, ignores falsy, from `lib/utils.ts`.
- [x] T014 [US1] Run `npm run test:coverage`; confirm the P1 modules meet the ~90%
  threshold. Add missing cases for any uncovered branch until threshold passes.

**Checkpoint**: US1 alone is a viable MVP — money/date logic is guarded.

---

## Phase 4: User Story 2 — Safe shared-state & split math (P2)

**Goal**: Test the store's add/update/delete, scope, split math, owner display with
Supabase mocked. **Depends on**: Phase 2 helpers. Independent of US1/US3 at the test level.

- [x] T015 [US2] `web/test/store.test.tsx` (`// @vitest-environment jsdom`) — `vi.mock`
  `@/lib/supabase/client` to return `makeSupabaseMock(...)`; render `AppStateProvider`
  with a dataset (users, household_members, transactions); via a tiny test consumer of
  `useApp()` assert: `addTransaction` then `updateTransaction` then `deleteTransaction`
  each mutate `transactions` exactly; `ownersDisplay` labels shared (multi-owner) vs
  personal; `formatMoney` honors currency; and `mock.calls` shows writes happened with
  **no** unexpected real call. Use fixtures from T006.
- [x] T016 [US2] Strengthen split coverage: assert even-split remainder reconciles to the
  total and personal scope attributes only the current user (drive via `effectiveSplits`
  directly for math + provider for owner display). Extend T010 or add cases here as needed.

**Checkpoint**: state transitions + split math verified without network.

---

## Phase 5: User Story 3 — Interaction-complete UI behavior (P3)

**Goal**: Behavioral tests for the four key components via accessible queries + user
events. **Depends on**: Phase 1 (jsdom) and Phase 2 (fixtures). Files independent — `[P]`.

- [x] T017 [P] [US3] `web/test/DatePicker.test.tsx` (`@vitest-environment jsdom`) — render
  `DatePicker` from `components/inputs.tsx` with a fixed `value`; open via the trigger
  (assert `aria-haspopup`/`aria-expanded`); assert the month grid matches `value`'s month;
  click a day → `onChange` emits the correct local ISO (no TZ shift); test month nav and
  the "Today" shortcut (pin now with `vi.setSystemTime`); Escape and outside-click dismiss.
- [x] T018 [P] [US3] `web/test/transactions-accordion.test.tsx` (`@vitest-environment
  jsdom`) — render the transactions list (mock `useApp`/store + `usePathname` as needed,
  `vi.setSystemTime` to pin the month) with transactions across several months; assert only
  the current month is expanded by default; when current month is empty, the most recent
  non-empty month opens; a non-empty search expands all months. Prefer driving via the
  exported list/desktop component with mocked data.
- [x] T019 [P] [US3] `web/test/nav.test.tsx` (`@vitest-environment jsdom`) — render
  `Sidebar` and `TabBar` with `usePathname` mocked; assert each destination is a real link
  to its route and exactly the active route carries `aria-current="page"` / active state;
  assert icons render (lucide). Mock `next/navigation` and `useApp` minimally.
- [x] T020 [P] [US3] `web/test/tx-form-validation.test.tsx` (`@vitest-environment jsdom`) —
  exercise `useTxForm`/`TxFormFields` from `components/web/TxForm.tsx` (provider + mocked
  store): `canSave` is false until amount > 0 and merchant set (and ≥1 owner for shared
  scope), true when valid; `submit()` returns false when invalid and does not persist.

**Checkpoint**: each component has ≥1 behavioral test through accessible queries (SC-006).

---

## Phase 6: Polish & Cross-Cutting

- [x] T021 Amend `.specify/memory/constitution.md`: add a Development-Workflow principle
  "Test-Driven by default — new behavior is specified by a failing test first; money math
  and date logic are never shipped without coverage." Bump version to **1.1.0** (MINOR,
  additive) and update Last Amended date. (Satisfies FR-009.)
- [x] T022 Full verification: `npm test` (all suites green, incl. existing parity) and
  `npm run test:coverage` (lib thresholds met) and `npx tsc --noEmit` clean. Record the
  pass in the PR/commit message. Re-run `npm test` twice to confirm order/time determinism
  (SC-004).
- [x] T023 [P] Sensitivity spot-check (SC-003): temporarily break one covered behavior
  (e.g. flip a sign in `formatMoney` or the accordion default-open rule), confirm a named
  test fails, then revert. Document the check; do not commit the break.
- [x] T024 [P] Update `web/AGENTS.md` or add a short `web/test/README.md` describing how to
  run the suite, the node-vs-jsdom split, and the mock/fixtures helpers (discoverability,
  FR-010).

---

## Dependencies & Execution Order

- **Phase 1 (T001–T005)** blocks everything (config + env + parity sanity).
- **Phase 2 (T006–T007)** blocks US2 and US3 (helpers); independent of US1.
- **US1 (T008–T014)** needs only Phase 1 → can start immediately after setup; this is the MVP.
- **US2 (T015–T016)** needs Phase 1 + Phase 2.
- **US3 (T017–T020)** needs Phase 1 + Phase 2.
- US1, US2, US3 are independent of each other and may proceed in parallel once their
  prerequisites are met.
- **Phase 6** runs last (constitution + whole-suite verification).

## Parallel Opportunities

- After T005: T006 and T007 in parallel `[P]`.
- US1: T008–T013 fully parallel `[P]` (six independent files), then T014.
- US3: T017–T020 fully parallel `[P]` (four independent files).
- Across stories: once Phase 2 done, US1/US2/US3 test files can be authored concurrently.

## Implementation Strategy

- **MVP = Phase 1 + US1**: highest value-per-effort; locks money/date logic alone.
- **Increment 2**: + US2 (store/splits) once helpers exist.
- **Increment 3**: + US3 (component behavior).
- **Close-out**: Phase 6 (TDD principle + verification).

## Format validation

All tasks use `- [ ] Tnnn [P?] [US?] description + path`; setup/foundational/polish carry
no story label; story tasks carry `[US1]/[US2]/[US3]`; parallel files marked `[P]`.
