# Research: Web Test Foundation

Phase 0 — resolve the open technical questions before design.

## R1. One runner, two environments (node logic + jsdom components)

**Decision**: Single `vitest.config.ts`. Default `environment: 'node'`. Component/store
tests opt into jsdom with a per-file pragma `// @vitest-environment jsdom`. Broaden
`include` to `['test/**/*.test.ts', 'test/**/*.test.tsx']`. A `setupFiles: ['./test/setup.ts']`
registers jest-dom matchers and RTL auto-cleanup.

**Rationale**:
- Keeps the ~9 pure-logic suites running in fast node (no jsdom tax) while only the ~5
  component/store suites pay for a DOM.
- The per-file pragma is the lowest-ceremony way to mix environments in Vitest 4 and
  needs no workspace/projects split for a package this size. `setup.ts` is harmless in
  node files because they never import RTL; Vitest only applies setup per the run.
- Avoids Vitest "projects" complexity (two configs, two coverage merges) that buys
  nothing at this scale.

**Alternatives considered**:
- *Vitest projects/workspace* (separate node + jsdom projects): cleaner isolation but
  more config and a coverage-merge step — overkill here.
- *jsdom for everything*: simplest config, but slows the logic suites and can mask
  node-vs-browser differences in date/Intl behavior.

## R2. Date/time determinism

**Decision**: Two tiers.
1. **Pure helpers that already accept a `now`/`asOf`/reference date** (`dayLabel`,
   `relativeTime`, mortgage/insights, accordion default-open via `startOfMonth(new Date())`):
   pass an explicit reference date in tests — never compare against the real clock.
2. **Code that calls `new Date()` internally with no injection point** (the `DatePicker`'s
   "today" highlight + Today button; the transactions accordion's `currentMonthKey`):
   use Vitest **fake timers** `vi.setSystemTime(new Date(2026, 5, 12))` in those specs to
   pin "now", then assert against that fixed date. Reset with `vi.useRealTimers()` in
   `afterEach`.

**Rationale**: Most logic is already injection-friendly (the codebase consistently takes
`now = new Date()` params) — prefer injection. Fake timers are reserved for the few
component paths that construct dates internally, giving determinism without a refactor.
`vi.setSystemTime` affects `new Date()`/`Date.now()` deterministically and is the
idiomatic Vitest tool.

**Avoid**: asserting "today"/"yesterday" against the actual current date; asserting exact
amortization-to-date without a pinned `asOf` (the existing parity vectors already pin it).

**Note on DatePicker**: prefer asserting *relative to the rendered today cell* (find the
day button matching the pinned date) over hard-coded coordinates, so the test stays robust
to layout. Selecting an arbitrary day and asserting the emitted ISO string is the core
timezone-safety assertion and needs no timer at all (value is driven by the `value` prop).

## R3. Supabase mock (no network)

**Decision**: `vi.mock('@/lib/supabase/client')` so `createClient()` returns a hand-built
**chainable mock**. The store calls `supabase.auth.getUser()`, `supabase.from(table).select()
.eq().order()` (thenable, resolving `{ data, error }`), and `.insert()/.update()/.delete()
/.upsert()`. The mock:
- `auth.getUser()` → resolves a fixed test user (or `{ data: { user: null } }` to short-
  circuit load when testing pure dispatch).
- `from(table)` → returns a builder whose `.select/.eq/.order/.in` return the same builder
  and which is awaitable, resolving `{ data: dataset[table] ?? [], error: null }`.
- `.insert/.update/.delete/.upsert` → record the call (for "no real I/O" + call assertions)
  and resolve `{ error: null }`.

A `makeSupabaseMock(dataset)` helper in `test/helpers/supabase-mock.ts` builds this from a
plain dataset object so each test declares only the rows it needs.

**Rationale**: The store is a React provider that eagerly loads via these calls; a
configurable chainable mock lets tests render `AppStateProvider` with controlled
`users`/`household_members`/`transactions` so `ownersDisplay` and split math have real
inputs, while guaranteeing no fetch. Recording writes lets us assert dispatches persisted
(and that **only** mocked calls happened — SC-005).

**Testability**: `effectiveSplits` is already a pure export (`lib/format.ts`) — test split
math directly there (fast, no provider). Use the provider only for what genuinely needs
state: `addTransaction/updateTransaction/deleteTransaction` local-collection effects and
`ownersDisplay`/`formatMoney`. No production refactor required; if `getUser()`/`loadAll`
shape proves awkward, the only change considered is making the mock return shaped data —
not changing app code.

## R4. Coverage

**Decision**: `@vitest/coverage-v8`. Configure `coverage.include` to `lib/**` business
logic and set per-glob thresholds: high for pure modules
(`lib/finance/**`, `lib/format.ts`, `lib/categories.ts`, `lib/api/**` → ~90% lines/branches),
no hard threshold on components (behavioral coverage, not line coverage, is the goal).
Exclude `lib/supabase/**` (thin env wrappers), `lib/types.ts` (types only),
`lib/useMediaQuery.ts` (browser API shim) from the threshold set. Run via `npm test`
(coverage on) or a `test:coverage` script.

**Rationale**: Matches SC-002 (high bar for pure logic) and the spec assumption that
components aren't held to a line threshold. Scoping `include` to `lib/**` keeps the
number meaningful (not diluted by untested view components out of scope).

## R5. What is NOT done (scope guard)

E2E/browser automation, visual/screenshot regression, testing third-party libs, and the
iOS app are out of scope (spec NON-GOALS). Components are tested for behavior/semantics,
not appearance — no snapshot-the-DOM tests that would break on every style tweak.
