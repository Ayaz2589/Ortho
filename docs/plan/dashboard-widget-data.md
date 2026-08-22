# Dashboard Widget Data — Implementation Plan (base PR)

**Written:** 2026-08-03
**Status:** Planning — ready to break into sandbox sections
**Base branch:** `feat/dashboard-widget-data` (this doc lives here; every section branches off it and folds back in)
**Builds on:** spec 034 — widget-system foundation (merged, PR #77). The board, registry, per-browser
toggles, and calm placeholder bodies already ship on `main`.

---

## 1. Goal

The widget foundation shipped with **placeholder bodies** (calm token bars, no data). This feature
wires **real household data** into each of the six widgets and gives the overview a **time scope**
(month / relative range) that every widget reads from a single shared source, so the whole board
reflects the same period.

Concretely:

1. **Shared scope** — lift the *already-existing but orphaned* `useDashboardScope()` hook into a
   `DashboardScopeProvider` at the overview, expose it via `useDashboardScopeContext()`, and revive
   the **`MonthPicker`** control (also already-built, currently orphaned) at the top of the board.
2. **Propless bodies** — each widget `Body` stays propless and reads what it needs from `useApp()`
   (data) + `useDashboardScopeContext()` (the active interval / reference date). No new props on the
   `WidgetDefinition.Body` contract.
3. **Six data-wired widgets** — port the math/visuals from the deleted overview cards (they live on
   `main`'s history as reference implementations) into each widget body, adding a chart only where it
   genuinely serves the widget's purpose.

This work is **broken into independent sections**, each shippable in its own sandbox as its own Spec
Kit feature with full TDD, folding cleanly back into this base PR.

---

## 2. Current state — what already exists (do NOT rebuild)

| What | Where | Notes |
|---|---|---|
| Widget board + frame | `web/components/widgets/{WidgetBoard,Widget}.tsx` | Renders enabled widgets, column-masonry, propless `Body`. Untouched by this feature except the board wrapper (Section 0). |
| Registry (source of truth) | `web/lib/widgets/registry.tsx` | 6 widgets declared; `Body: ComponentType` (propless). Section 0 repoints `Body` imports once; sections never touch it after. |
| Per-browser toggles | `web/lib/widgets/preferences.ts`, `useWidgetPrefs.ts`, `settings/widgets/page.tsx` | Complete. Not touched. |
| Placeholder bodies | `web/components/widgets/placeholders.tsx` | **Section 0 splits these into per-widget files** so each section owns exactly one file. |
| **Scope hook (orphaned)** | `web/lib/useDashboardRange.ts` → `useDashboardScope(): DashboardScope` | Fully built: `interval`, `referenceDate`, `periodLabel`, `availableMonths`, `selectedMonth`, `setMonth/clearMonth`, `range/rangeOptions/setRange`, `isSpecificMonth`, `now`. Holds internal `useState` → **must be called once and shared**. Currently unused. |
| **`MonthPicker` (orphaned)** | `web/components/dashboard/MonthPicker.tsx` | Props: `{ availableMonths, selectedMonth, onSelectMonth, onClear }`. Renders prev/next + dropdown + "Latest". Currently unused. |
| Date/interval helpers | `web/components/dashboard/range.ts`, `web/lib/useDashboardRange.ts`, `web/lib/format.ts` | `rangeInterval`, `availableMonths`, `monthReferenceDate`, `monthInsightReference`, `monthLabel`, `monthBoundsInterval`, `monthYearLong`. Pure, golden-vectored. |
| Budget math | `web/lib/finance/budgets.ts` → `budgetStatusForMonth(budget, txs, referenceMonth)` | Returns `{ effectiveLimitCents, spentCents, remainingCents, carriedInCents }`; handles rollover/carry. |
| Goal math | `web/lib/finance/goals.ts` → `goalProgress`, `goalPacing`, `contributionsByGoal` | Pure. Progress fraction, reached flag, pacing/off-track. |
| Goal UI to reuse | `web/components/goals/GoalCard.tsx` | Progress bar + pace-line vocabulary (hairline track, sage fill, accent-when-behind). Borrow structure. |
| Chart leaves | `web/components/dashboard/charts/{CategoryPie,SavingsRateChart}.tsx` | recharts allowed **only** inside `**/charts/`. `DailyTrendChart` (area) was deleted — recreate as a leaf if needed. |

### `useApp()` data surface (what bodies read)

From `web/lib/store.tsx`, `useApp()` exposes (types abbreviated):

- Collections: `transactions: Transaction[]`, `budgets: Budget[]`, `goals: Goal[]`,
  `goalContributions: GoalContribution[]`, `cards`, `depositAccounts`, `people`, `householdMembers`.
- Money/format: `formatMoney(cents, opts?)`, `currency`, `rate(c)`, `locale`.
- i18n: `t: Translate` (positional `{0}` placeholders).
- Identity/display: `currentHousehold`, `resolveUser(id)`, `ownersDisplay(tx)`.
- Selectors (memoized): `categoryExpenseTotal(category, start, end)`, `spentBy(personId, start, end)`,
  `monthlySpentBy(personId)`.
- State: `loading`, `error`.

---

## 3. Architecture decisions

### D1 — Scope lives in a `DashboardScopeContext`, not the store

`useDashboardScope()` keeps `range`/`selectedMonth` in local `useState`. If each widget called it,
every widget would get its **own** independent month → the board would desync. So it must be called
**once** and shared.

We put it in a **dedicated `DashboardScopeProvider` + `useDashboardScopeContext()`**, *not* the global
store. Rationale: the store holds only Supabase-persisted household data and explicit user preferences
(currency, language); a transient, per-view month selection is off-pattern there (confirmed: the store
currently holds no pure-UI state). A focused context keeps the store lean and the concern local to the
dashboard. Bodies stay **propless** — they call the context hook, exactly as they already call
`useApp()`. (This is the "small DashboardScopeContext" branch of the original two options.)

### D2 — Each widget body is its own file

Today all six placeholder bodies live in one `placeholders.tsx`. To let six sandboxes work in parallel
without colliding, **Section 0 splits them** into `web/components/widgets/bodies/<Name>Body.tsx` (one
file per widget, still placeholder content initially) and repoints `registry.tsx`'s `Body` imports
**once**. After that, each widget section edits **only its own body file** (+ its own chart leaf, its
own test file, and shared i18n catalogs). `registry.tsx` is never touched again.

### D3 — Charts only where they serve the widget; recharts stays lazy

Per the bundle-discipline guard (`web/test/bundle/no-eager-recharts.test.ts`), recharts may be
statically imported **only** inside `components/**/charts/` leaves, reached via `next/dynamic`
(`{ ssr: false }`). Calm CSS bars are preferred for progress-style widgets. Chart decisions per widget
are in §5; **only `spending-pace` requires recharts** (a trend area chart is core to its purpose); an
optional net-summary sparkline is a stretch. Everything else is CSS (token-only, no red, no shadow).

### D4 — Propless `Body` contract is preserved

`WidgetDefinition.Body` stays `ComponentType` with no props. Data flows in through hooks, keeping the
registry declarative and the extensibility invariant (one registry entry ⇒ board + settings) intact.

---

## 4. Conventions every section follows

**Branch / fold-in model.** Base branch is `feat/dashboard-widget-data` (this PR). **Section 0 merges
first** into the base. Sections 1–6 then branch off the updated base and PR back into it (not `main`).
When all sections are folded in, the base PR merges to `main`. Branch names: `feat/widget-<name>`
(e.g. `feat/widget-budgets`).

**Spec Kit per section.** Each section is its own numbered feature under `specs/NNN-<slug>/`. Run
`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Produce the standard
set: `spec.md`, `plan.md`, `tasks.md`, `data-model.md` (thin — no schema changes here), `contracts/*`,
`quickstart.md`, `checklists/requirements.md`, `research.md`. Assign the next free number in sequence
(Section 0 = 035, then 036…; confirm the latest in `specs/` before claiming one).

**Full TDD.** Write the widget's test suite first, under `web/test/widgets/<name>.test.tsx`. Mirror the
existing widget-test pattern: module-mock the store and drive data through it —

```ts
vi.mock('@/lib/store', () => ({ useApp: () => ({ t: (k: string) => k, formatMoney: (c: number) => `$${c}`, transactions: [...], /* … */ }) }))
vi.mock('@/lib/widgets/DashboardScopeContext', () => ({ useDashboardScopeContext: () => ({ interval: {...}, referenceDate: new Date(...), /* … */ }) }))
beforeEach(() => localStorage.clear())
```

Assert the rendered numbers/labels against known inputs, the empty state, and that the body **fills its
cell** (`h-full`, no blank band). Keep prior widget suites green.

**i18n — all 5 catalogs.** Every new `t()` string must be added to `web/lib/i18n/{bn,es,ja,ko,zh}.ts`
(no `en.ts`; English is the key). `web/test/i18n/render-locale.test.tsx` fails on a missing key. Use
positional `{0}` placeholders.

**Design.** Tokens only; inset cards carry no shadow; hairlines; sage/sand accents; **loss/negative is
never red** (use `--text-2`/muted or accent, per the money-first system). Bodies fill their height tier.

### Shared surfaces & collision rules

| Surface | Who edits | Conflict risk | Rule |
|---|---|---|---|
| `web/components/widgets/bodies/<Name>Body.tsx` | one section each | none (exclusive) | Section owns its file. |
| `web/components/widgets/charts/*` (new leaves) | the charting section(s) | none | Distinct filenames per widget. |
| `web/test/widgets/<name>.test.tsx` | one section each | none | Distinct files. |
| `web/lib/i18n/{bn,es,ja,ko,zh}.ts` | every section | low (append-only, distinct keys) | Add keys grouped together; resolve trivially on fold-in. |
| `.specify/feature.json` | every section (points at its spec) | **guaranteed** (1-line pointer) | Trivial resolve; base-PR owner sets it to the section being integrated, then back. Do **not** treat as a real conflict. |
| `web/lib/widgets/registry.tsx` | **Section 0 only** | none after S0 | Sections 1–6 must NOT edit it. |
| `web/app/(app)/dashboard/page.tsx`, `DashboardScopeContext.tsx`, `placeholders.tsx` | **Section 0 only** | none | Foundation-owned. |

---

## 5. Sections

### Dependency graph

```
Section 0 (Foundation: scope context + MonthPicker + body split)   ← merge FIRST
        │
        ├── Section 1  net-summary
        ├── Section 2  spending-pace  (recharts leaf)
        ├── Section 3  budgets
        ├── Section 4  goals            ← run in parallel after S0
        ├── Section 5  top-merchants
        └── Section 6  activity
        │
Section 7 (Integration polish: skeleton, docs, sweep)              ← merge LAST
```

---

### Section 0 — Foundation: shared scope + revived MonthPicker + body split

**Owns:** `web/lib/widgets/DashboardScopeContext.tsx` (new), `web/app/(app)/dashboard/page.tsx`,
`web/lib/widgets/registry.tsx`, `web/components/widgets/placeholders.tsx` → split into
`web/components/widgets/bodies/*Body.tsx`, and Section-0 tests.

**Blocks:** all other sections. **Spec:** `specs/035-dashboard-scope-foundation/`.
**Status: ✅ MERGED into the base (PR #79).** The gate is cleared — the scope context, revived
`MonthPicker` + `RangePicker`, and the `bodies/*Body.tsx` split are all on `feat/dashboard-widget-data`.
Widget sections (1–6) may now branch off the updated base and proceed.

**Work:**
1. **`DashboardScopeContext.tsx`** — a provider that calls `useDashboardScope()` **once** and supplies
   the value via context; `useDashboardScopeContext()` reads it (throws if used outside the provider).
2. **Wire into the overview** (`dashboard/page.tsx`, `mode === 'overview'` branch only — Reports mode
   untouched): wrap the board in `<DashboardScopeProvider>`, and render **`MonthPicker`** (revived)
   near the `ModeSwitch`, driven by `scope.availableMonths/selectedMonth/setMonth/clearMonth`.
   Decision point O-1: also surface the relative-range segmented control (`scope.rangeOptions/setRange`)
   — recommended **yes** (the hook already supports it and multi-month widgets benefit); keep it a small
   token control beside the picker. Show `scope.periodLabel` as the board's period caption.
3. **Split placeholder bodies** into `bodies/NetSummaryBody.tsx` … `bodies/ActivityBody.tsx` (content
   unchanged — still the calm placeholder), and repoint `registry.tsx` `Body` imports to them. Delete
   `placeholders.tsx` once empty (or keep the shared `Placeholder` scaffold there for bodies to import).
4. Keep every existing widget test green; the board still renders identically until data lands.

**Tests (TDD):** provider supplies one shared scope to N consumers (two test consumers read the same
`selectedMonth`); changing the month via `MonthPicker` updates all consumers; `useDashboardScopeContext`
throws outside a provider; overview renders the picker, Reports mode does not; registry still yields 6
widgets with the split body files.

**Acceptance:** overview shows a working month/range control; toggling it changes `periodLabel`; bodies
render from their own files; `tsc` + full suite green.

---

### Common contract for Sections 1–6

Each widget section replaces the placeholder in its `bodies/<Name>Body.tsx` with real content:

- Read data from `useApp()` and the active window from `useDashboardScopeContext()`
  (`interval: { start, end }`, `referenceDate`, `isSpecificMonth`, `periodLabel`).
- Derive with the named pure helpers (below) — **do not** re-implement money math.
- Keep the body filling its size tier; empty/■zero states are calm text, never an empty chart.
- Add all new `t()` keys to the 5 catalogs. Add a `web/test/widgets/<name>.test.tsx` suite first.
- Charts (only where noted) go in a new `web/components/widgets/charts/<Name>Chart.tsx` leaf, imported
  via `next/dynamic({ ssr:false })`.

| Widget | Data (`useApp`) | Window | Key helpers | Visual | Chart? | New i18n (examples) |
|---|---|---|---|---|---|---|
| **1 net-summary** | `transactions`, `formatMoney` | `interval` | sum income vs expense over `interval` | Big net figure + income/expense split + thin CSS proportion bar; when `isSpecificMonth` on the current month, optional "day X of Y" pace note | **No** — numbers-only, CSS-only (O-3 resolved; no recharts) | `Income`, `Expenses`, `Net`, `Day {0} of {1}` |
| **2 spending-pace** | `transactions` | trailing 30 vs prior 30 days from `interval` end (or `now`) | daily expense buckets; avg/day; delta % | Area trend + readouts (avg/day, Δ vs prior 30) | **Yes** — recharts area leaf (recreate `DailyTrendChart` under `widgets/charts/`) | `Last 30 days`, `Daily trend`, `Avg / day`, `vs. prior 30`, `No expenses in the last 30 days.` |
| **3 budgets** | `budgets`, `transactions` | `referenceDate` | `budgetStatusForMonth(b, txs, referenceDate)`; `categoryMeta(cat)` | Rows: icon + category + spend-vs-limit CSS bar + `{0} left`/`{0} over`/carry note | **No** (CSS bars) | `{0} left`, `{0} over`, `{0} rolled over`, `{0} carried shortfall`, `No budgets yet.` |
| **4 goals** | `goals`, `goalContributions` | n/a (goal lifetime) | `contributionsByGoal`, `goalProgress`, `goalPacing` | Rows borrowed from `GoalCard`: name + saved-of-target + CSS progress bar + calm pace line | **No** (CSS bars) | `{0} to go`, `Reached`, `On pace · due {0}`, `Behind pace — set aside {0}/mo to reach it by {1}.`, `No goals yet.` |
| **5 top-merchants** | `transactions` | `interval` | group by merchant, top 5 by expense total, count visits | Text rows: merchant · total · `{0} visits` | **No** (optional tiny CSS inline bar) | `{0} visits`, `1 visit`, `No expenses in this period yet.` |
| **6 activity** | `transactions`, `ownersDisplay`, `formatMoney` | recent N (see O-2) | sort by date desc; `categoryMeta`, `shortDate` | Compact recent-transactions list: category icon + name + owner + amount + date | **No** | `Recent activity`, `No transactions yet.` |

**Per-section deliverable checklist (all of 1–6):**
- [ ] `specs/NNN-widget-<name>/` full Spec Kit set
- [ ] `bodies/<Name>Body.tsx` wired to real data (propless; reads `useApp` + scope context)
- [ ] (Section 2 only) `widgets/charts/SpendingPaceChart.tsx` recharts leaf + `next/dynamic` wrapper; keep `no-eager-recharts` green
- [ ] `web/test/widgets/<name>.test.tsx` (TDD-first): real numbers from mocked store, empty/zero state, fills-cell
- [ ] i18n keys in all 5 catalogs; `render-locale` green
- [ ] `tsc` clean; full suite green; design tokens honored (no red for negatives)

---

### Section 7 — Integration polish (merge last)

**After** all widgets land: update `web/components/skeletons/DashboardSkeleton.tsx` to better match the
data-filled widget heights; refresh `docs/web.md` §13 and the dashboard sections to describe the wired
widgets + scope; delete any leftover placeholder scaffolding; final i18n/`render-locale` sweep and a
board-level integration test rendering all six widgets against a realistic mocked store. Then merge the
base PR to `main`.

---

## 6. Open questions

- **O-1 (Section 0):** Include the relative-range segmented control (this month / last 3·6·12) beside
  `MonthPicker`, or ship month-only for v1? *Recommended: include it — the hook already supports it and
  `spending-pace`/`net-summary` read better over ranges.*
- **O-2 (Section 6):** `activity` has no old reference. Scope = the **most recent N transactions**
  (household-wide, ignoring the scope window) or transactions **within the selected `interval`**?
  *Recommended: most-recent-N (a live feed reads better than a windowed one); N≈6 to fit the `wide` tier.*
- ~~**O-3 (Section 1)**~~ — **Resolved: net-summary is numbers-only for v1.** No sparkline / no recharts
  in the net-summary body. A multi-month net sparkline is a possible Section-7 stretch, not part of
  Section 1. (This keeps net-summary CSS-only and off the recharts path — only `spending-pace` charts.)
- **O-4:** `net-summary` is `lg` and `spending-pace`/`budgets` are `md` in the registry. Confirm those
  sizes still suit the real content, or adjust in each section (size is a one-line registry field — but
  changing it is the **one** allowed registry edit, and must be coordinated to avoid S0 conflicts).

---

## 7. Sequencing summary

1. **Section 0** (035) — scope context + MonthPicker + body split → merge into base.
2. **Sections 1–6** (036–041) — one widget each, parallel sandboxes off the updated base → PR back into base.
3. **Section 7** (042) — skeleton + docs + integration sweep → merge base PR to `main`.

Each section is a self-contained handoff: give a sandbox its section heading (§5) plus §2 (what exists),
§3 (decisions), and §4 (conventions), and it has everything to run Spec Kit + TDD and fold back cleanly.
