# Full application test & review — 2026-08-24

**Scope:** the whole Ortho web application, page by page — every route, every dashboard widget and
detail panel, every finance engine, the data layer, the database/RLS surface, and the bulk-entry
paths (CSV, scan, CLI). Reviewed at `main` = `31548d4` (spec 057 US4–US9 merged).

**Bottom line:** the foundations are in excellent shape — every automated check is green, the pure
money engines (splits, balances, scope projection, mortgage, rollover, goals) are correct and
vector-locked, and the DB/RLS surface is carefully built with no cross-household or unauthenticated
path found. The review found **no critical defect** (no path that corrupts stored ledger money
through normal single-user use). It found **20 major** and **~63 minor** verified defects,
concentrated in four systemic seams: the **date-regime seam** (UTC instants vs local-time math),
**money-input parsing** under non-USD display currencies and decimal-comma locales, **write-path
edges** the atomic RPC does not cover, and **i18n completeness** for features shipped after the
catalogs were last swept. Every finding below was independently re-verified against the code by an
adversarial pass before being included; several were reproduced empirically (running the real
modules under `TZ=America/New_York`, executing the production formulas).

---

## 1. Verification baseline — all green

| Check | Result |
|---|---|
| `tsc --noEmit` (web) | clean |
| `npm test` (web Vitest suite) | **324 files, 3,276 passed**, 3 expected-fail |
| `services/billing` (tsc ×2 + tests) | pass |
| `services/aggregation` (tsc ×2 + tests) | pass |
| `npm run gen:vectors` + drift check | **byte-identical** (all 13 vector sets) |
| `npm run test:tz` (local-only tz suite) | 3 files, 14 tests pass |
| `next build` (static export) | all ~35 routes prerender, exit 0 |
| Chromium render smoke over the export | 16 pages, **0 console/page errors**; all 6 landing locales localized; `/` → `/landing/en`; every signed-out app page → `/sign-in`; 404 calm |

## 2. Method

1. Full automated baseline (table above).
2. Nineteen parallel area reviews, one per page group / subsystem: dashboard shell, widget board,
   panel frame, spec-057 panels (new + base), transactions list, transaction form, housing,
   planning, settings (core + data), onboarding funnel, routines, finance core, scope engine,
   i18n audit, store/write path, DB security, CSV/scan/CLI import. Each read the relevant docs,
   the source, and the tests; each reported only defects it verified against actual code.
3. Adversarial verification: every finding was handed to an independent verifier instructed to
   **refute** it. 117 raw findings → 107 after dedup → **86 confirmed, 3 refuted, 0 unresolved**.
   The refuted ones (and why) are in §7.
4. Reviewer spot-checks of the highest-consequence findings directly at the cited lines, plus a
   hand-review of `moneyScope.ts`, `balances.ts`, and `splits.ts`.

**Not testable in this sandbox** (reported as unrun, not assumed): a live signed-in E2E walk
(no `web/.env.local` credentials here), the manual phone/desktop visual walk (quickstart §2), and
the real-iOS safe-area check (quickstart §3).

---

## 3. Major findings (20)

### A. Money written wrong (write paths)

**A1 — Decimal-comma locales store 100× the typed amount.** `web/components/inputs.tsx:66`
`parseMoney` strips every comma as a thousands separator before `parseFloat`, but `formatMoney` is
deliberately locale-aware: under `es` (and any System decimal-comma locale) the app itself displays
`12,34`. A user who types the amount the way the app displays it gets `1234` — one hundred times
the money — stored, in the amount hero, by-value splits, and every `MoneyInput` consumer (goals,
budgets, housing).
*Fix:* detect comma-as-decimal (`/^\d+,\d{1,2}$/` and the dotted-thousands form) in `parseMoney`
and treat the final comma as the decimal separator.

**A2 — Editing a legacy null-payer expense silently invents a payer.** `web/components/web/TxForm.tsx:296`
Spec 053 FR-012 (restated in `balances.ts`): a null-payer row must contribute nothing to balances,
because inventing a payer fabricates debts. But the edit form has no null-payer state — `paidBy`
seeds to the current person whenever `src.paid_by` is null, and `submit()` writes it
unconditionally. Fixing a typo on any pre-053 row (all CSV/scan/CLI/sync imports before payer
capture) converts `paid_by` from null to the editor, creating a debt out of thin air.
*Fix:* track `paidByTouched` (the file's own `amountUntouched` pattern) and preserve null on save
when editing a null-payer row the user didn't re-attribute. Same for a legacy transfer's `transferFrom`.

**A3 — CSV import violates the noon-UTC date convention.** `web/lib/csv/useCsvImport.ts:47`
Every other write path pins dates to `T12:00:00.000Z` (TxForm, CLI, sync; `routines.ts:179` even
documents it). The web CSV commit alone does `date: draft.dateISO.slice(0, 10)` — a bare
`YYYY-MM-DD` that parses as **midnight UTC**, so for every viewer west of UTC each imported row
renders on the previous local day (and previous month at month boundaries: wrong accordion bucket,
wrong month total, month filter disagreeing with month grouping on the same row).
*Fix:* one line — commit `draft.dateISO` (the profiles already emit the noon-UTC instant). Note the
existing `repair-legacy-dates` script must **not** be pointed at rows already written this way
without care — it infers the NY day and would shift statement dates.

**A4 — Ledger grouping lacks the date-only guard the insights engine got.** `web/lib/format.ts:90`
`groupByDay` keys with `startOfDay(new Date(t.date))`; for a date-only string that is the
UTC-midnight shift above. The same file defines `parseLocalDate` (lines 27–35) whose comment says
"every stored `date` column must go through here" — and spec 027 A2 fixed exactly this class in
`insights.ts` with a dedicated tz suite. `budgets.ts:137`, `financialHealth.ts`, and
`personSummary.ts` bucket the same unguarded way (tracked as minors below).
*Fix:* route date parsing in `groupByDay` (and siblings) through the `date.includes('T') ? new
Date(date) : parseLocalDate(date)` guard `insights.ts:41` already uses.

**A5 — A refused delete looks deleted.** `web/lib/store.tsx:1197`
The `transactions_delete` RLS policy only allows the creator or a household owner. PostgREST
returns **success with zero rows** for an RLS-filtered delete (the repo's own harness contract
test states this). `deleteTransaction` rolls back only on an error object, so a non-owner member
deleting a peer's transaction sees it vanish locally while it silently survives server-side —
reappearing on next load.
*Fix:* `.delete().eq('id', id).select('id')` and treat zero returned rows as failure (restore +
banner).

**A6 — Un-checking "Include anyway" on a CSV duplicate is ignored.** `web/components/csv/CsvRowEditModal.tsx:154`
`handleSave` only ever sets `checked = true`; un-ticking produces a patch with no `checked` key, so
the row stays included and imports. There is no other exclusion path (`CsvImportList` receives
`onToggle` but never renders it). A row the user explicitly excluded still becomes money in the ledger.
*Fix:* `if (draft.duplicateOf) patch.checked = includeAnyway` — write the checkbox state both ways.

**A7 — CLI `tx-add`/`tx-edit` still use the pre-027 two-step write, with a broken compensation.**
`web/scripts/import/db/transactions.ts:98` — `updateOne` commits the new `amount_cents`, deletes
the old shares, and on a failed insert re-inserts the **prior** shares: an `amount ≠ Σshares` row
nothing at the DB level rejects, which then feeds every person-scoped engine. (The ingest path
correctly uses the RPC; PARITY.md's claim that the write path is fully shared has drifted — see §6.)
*Fix:* replace both bodies with the `upsert_transaction` RPC call `persist.ts` already makes.

### B. Money displayed wrong (engines / panels / cards)

**B1 — Spending-pace: selected months shift a day in negative-UTC timezones.** `web/lib/finance/spendingPace.ts:62`
The month picker's interval is UTC instants (`monthBounds`), but the engine floors bounds and
transactions with **local** `startOfDay`. Reproduced under `TZ=America/New_York`: a selected August
becomes `[Jul 31, Aug 31)` — Jul 31 spend counted in, Aug 31 dropped, `daysElapsed` off by one.
*Fix:* stop flooring across frames — use the interval instants directly and index days by
`Math.floor((ms − periodStart)/DAY_MS)` (noon-UTC storage makes this exact).

**B2 — Savings-trends: phantom month in every non-UTC timezone.** `web/lib/finance/savingsTrends.ts:57`
Same seam: UTC interval, local `getFullYear`/`getMonth` scaffolding. Reproduced: New York, selected
2026-08 → `months = ['2026-07','2026-08']`, and the panel's "Selected month" card renders the
phantom empty July under an August header (Tokyo produces `['2026-08','2026-09']`).
*Fix:* make the engine's month math UTC end-to-end (`getUTCFullYear`/`Date.UTC` scaffolding and
bucketing).

**B3 — Budget-aware pace verdict prorates one month's budget across 3M/6M/1Y.** `web/components/widgets/panels/SpendingPacePanel.tsx:139`
`budgetCents` is by construction a **single month's** effective limit, but the verdict branch has
no period-length gate: on "Last 3 months" an exactly-on-budget household is told it is roughly two
months of spend above plan. It also measures **all-category** spend against only-budgeted-category
limits.
*Fix:* gate the budget verdict to single-calendar-month scopes (fall back to the last-period
comparison otherwise).

**B4 — Home-equity panel mixes two equity bases on one screen.** `web/components/widgets/panels/HomeEquityPanel.tsx:56`
Rows/headline use `currentEquityCents` (purchase-price basis, includes the down payment, uncapped)
but are labeled "principal paid down" — the label the card puts on `housingSummary().equity`
(original-loan basis, paid-off-capped). In multi-mortgage view the total uses one basis and the
rows beneath it the other, so the rows don't sum to their own total whenever a down payment exists.
*Fix:* compute rows on the loan basis with the same `PAID_OFF_THRESHOLD` cap `housingSummary` uses.

**B5 — Housing "Principal paid down" card: % and bar on a different basis than the printed pair.**
`web/components/housing/MortgageCards.tsx:135` (duplicated in `HousingDesktop.tsx:149`) — headline
is `paid-down / original-loan` but the percentage/bar are `equityFraction` = equity/purchase-price.
On the repo's own seed household the card reads "$14,691.62 of $496,000.00 · **22.4%**" where the
true ratio is **3.0%**.
*Fix:* at the two render sites compute the fraction from the printed pair (`equityFraction` itself
is vector-pinned — don't touch it).

**B6 — Housing-costs panel misstates its income denominator under ranges.** `web/components/widgets/panels/HousingCostsPanel.tsx:107`
`incomeSharePercent` is always monthly-cost / **one month's** income, but the sentence interpolates
`periodLabel` ("Housing is 24% of Last 6 months income."). The range persists in localStorage, so a
household that keeps the board on a range reads a false money statement on every open.
*Fix:* word the sentence against the month actually measured.

**B7 — Multifamily "Vacant" label ignores the explicit `occupied` flag the money math uses.**
`web/components/housing/MultifamilyCards.tsx:9` (and `HousingDesktop.tsx:186`) — the label infers
occupancy from tenant name while the Net balance beside it uses `occupied ?? isUnitOccupied(name)`
(spec 020). An occupied unit with no recorded tenant shows "Vacant" next to rent income it is
producing. iOS drives the chip from `occupied`, so this is a parity break too.
*Fix:* resolve the label from the same expression as the money.

**B8 — By-value split false-blocks Save under non-USD display.** `web/components/web/TxForm.tsx:449`
Choosing the value split seeds per-owner fields in display currency, then validation re-parses each
field independently (per-share round-half-away) and requires the sum to equal the separately-rounded
total. Under any lossy rate the app's **own even seeds** miss by a cent for ~35–60% of amounts:
"Amounts must add up to X" appears with values the user never touched.
*Fix:* at the form layer, accept when the display-unit values sum to the display total and absorb
the rounding cent deterministically (`lib/splits.ts` is vector-locked — don't touch it).

**B9 — Non-Latin merchant names collapse to one routine.** `web/lib/finance/routines.ts:45`
`normalizeMerchantKey` strips `[^a-z0-9\s]`, so every Japanese/Korean/Chinese/Bengali merchant name
— four of the app's five translated locales — normalizes to the **empty string**: all such
merchants merge into a single routine identity (`rc:`), breaking or misattributing recurring-charge
detection (and the top-merchants panel's merge) for those households.
*Fix:* Unicode-aware regex (`/[^\p{L}\p{N}\s]+/gu`) plus an empty-key guard in both grouping loops.

### C. Reachability / navigation / honesty

**C1 — Deposit Accounts is unreachable on desktop.** `web/components/settings/SettingsSecondaryNav.tsx:9`
`ALL_SECTIONS` has no entry for it; the only link app-wide is the mobile-only settings hub, and
desktop redirects `/settings` → `/settings/household` immediately. The income form's "Deposit to"
picker dead-ends at "No accounts yet" with no add path.
*Fix:* add the nav entry (the "Deposit Accounts" key already exists in all five catalogs).

**C2 — Export-language picker doesn't govern the exported PDF's language.** `web/components/settings/DataExportPanel.tsx:49`
Spec 032 ships PDF export in 6 languages, and the picker exists — but it only drives number/date
locale and font choice. All translated strings in the PDF come from the app-UI `t` passed in;
nothing rebuilds `t` from the chosen language.
*Fix:* `const pdfT = makeT(await loadCatalog(language))` and pass that to `buildDataFile` (both
helpers already exported).

**C3 — Panel drill-in: Back/Escape skips a level.** `web/components/widgets/WidgetPanel.tsx:176` +
`SavingsTrendsPanel.tsx:99` — the frame's second level is a **single slot** (`useState<detail|null>`),
but SavingsTrendsPanel pushes from inside a pushed detail (Every month → a month's transactions).
From the third level, header Back, in-content Back, and Escape all jump to the top, skipping the
list the user came through.
*Fix:* make the detail state a stack (push/pop `Array<{title, content}>`); no panel API change.

**C4 — The scan feature is unreachable (reviewer-added, verified).** `web/components/web/ScanFlow.tsx`
`ScanFlow`/`useScanFlow`/the scan session reducer have **no production mount point** — the only
non-test reference is a comment in `TxForm.tsx:699`; `git log -S ScanFlow -- web/app` is empty, so
it was never wired on web (not a regression). Yet `docs/index.md` lists "receipt/statement scan" as
a shipped capability, the scan pipeline is fully built and tested, and spec 053's payer
carry-forward works end-to-end inside it.
*Fix (decision needed):* mount the affordance (New-transaction form / transactions page) — noting
its ~20 t() keys must then be added to the catalogs — or mark the capability as not-yet-wired in
the docs and stop carrying it as shipped.

---

## 4. Minor findings (~63, deduplicated), grouped by theme

### i18n completeness (~72 live missing keys + hardcoded-English surfaces)

The five catalogs are internally healthy — identical 684-key sets, no dead keys, placeholder parity
all test-enforced. The gap is **directional**: catalog→source is tested, source→catalog is not.

- `web/lib/categories.ts:82` — **35 spec-031 category/group labels** (Fast Food, Streaming,
  Takeout, …) missing from all five catalogs: the core money-categorization vocabulary renders
  mixed-language everywhere categories appear.
- Settings → Data / PDF (spec 032) — **21 keys** missing (`DataExportPanel`, `DataImportPanel`,
  PDF visible layer, the `Data` label itself, `Your Ortho data`).
- Bank linking — **13 keys** missing (`LinkedBanks.tsx`, `SimpleFinConnect.tsx`, incl. the consent
  sentence).
- App chrome — `Unlock Ortho to continue` (biometric lock screen), `Settings sections`
  (nav aria-label), `Import a CSV` (aria-label).
- **Entire CSV import flow bypasses `t()`** (~40 strings across `CsvImportFlow`, `CsvImportList`,
  `CsvImportSummary`, `CsvRowEditModal`, `OwnerPicker`) — hardcoded English in a 6-language app.
- Day headers render raw `Today`/`Yesterday` on both ledger surfaces
  (`transactions/page.tsx:221`, `TransactionsDesktop.tsx:395`) — translations exist; the spec-057
  ActivityPanel wraps the same call correctly.
- `periodLabel` rendered untranslated in panel captions/copy (`HousingCostsPanel:63`,
  `BudgetsPanel:54`, + same-class sites in the other panels) — the hero translates it.
- `kit/CycleStrip.tsx:45` hardcodes `today` (key exists in all five catalogs).
- `TxForm.tsx:1174` — "Copy from most common" category section headers never pass through `t()`.
- `sign-in/page.tsx:79` — raw English Supabase error messages on the localized sign-in screen.
- Test gap: no source→catalog completeness guard (`test/i18n/`) — the direction all of the above
  fell through.

### The date-regime seam (beyond the majors)

- `web/lib/finance/budgets.ts:137` — budget spend buckets by **local** month of raw timestamps
  while the hub's income/unbudgeted figures use UTC month windows; bank-synced boundary rows land
  in different months on one screen. (`financialHealth.ts` / `personSummary.ts` bucket the same
  unguarded way.)
- No `*.tz.test.ts` coverage for the three new spec-057 engines, ledger grouping, or the range
  windows/heatmap — the `TZ=UTC` pin masks B1/B2 (the repo already has the mechanism: spec 026).
- `web/lib/finance/mortgage.ts:151` — `maturityDate` rolls a Feb-29 closing to Mar 1
  (`setMonth` normalization); iOS clamps to Feb 28.

### Money-input FX round-trips (the spec-023 B1 guard, missing in four places)

TxForm and ContributionForm snapshot the prefilled text and reuse stored cents on no-op saves; these don't:

- `web/components/housing/PropertyForm.tsx:32` — a no-op property edit under GBP/EUR display
  silently rewrites stored money by ±1¢.
- `web/components/budgets/BudgetDrawer.tsx:60` — same for budget limit and rollover cap.
- `web/components/goals/GoalForm.tsx:48` — same for `target_cents`.
- `web/components/web/TxForm.tsx:516` — scanned **JPY** receipts prefill at 1/100 of the real
  amount (`candidate.amountCents / 100` hardcodes a 2-decimal divisor; use
  `fractionDigits(candidate.currency)`).

### Store / write-path robustness

- `web/lib/csv/useCsvImport.ts:150` — the import success screen reports "N added" while every
  row's RPC is still in flight (`addTransaction` is fire-and-forget); failures are never reflected.
- `web/lib/store.tsx:1621` — financial-health saves are delete-then-insert with no rollback: a
  failed insert destroys the user's fixed costs/weights server-side while the UI keeps showing them.
- `web/lib/store.tsx:1406` — the budgets upsert sends the client `id`, churning the row PK on
  conflict (the class the same file strips `id` for elsewhere).
- `web/lib/store.tsx:736` — the legacy `localUsers` fold clears localStorage even when the inserts
  failed (permanent loss of device-only people).
- Test gap: `deleteTransaction` rollback/zero-row behavior is untested although the mock supports
  delete-error injection.
- `web/lib/csv/useCsvImport.ts:105` — `profile.parse()` exceptions unhandled: a malformed cell
  leaves the import tray silently unresponsive.
- `web/lib/csv/duplicateMatch.ts:100` — duplicate detection ignores `kind`: a refund is flagged as
  a duplicate of its own purchase and excluded by default.
- `web/lib/csv/csvImportModels.ts:85` — the import summary's single money figure sums income
  rows together with expenses.

### Panels & widgets polish

- `WidgetPanel.tsx:220` — keyboard focus escapes to `body` on every second-level push/pop (the
  focused element unmounts; the trap only recaptures on `active` flips).
- `WidgetPanel.tsx:216` — the shared scroll region keeps its `scrollTop` across push/pop.
- `kit/CycleStrip.tsx:37` — two hardcoded dark-theme rgba colours; the today line and upcoming-dot
  rings are near-invisible in light theme (`AmortizationChart.tsx:28` has the mirror bug for dark
  mode).
- `TopMerchantsPanel.tsx:395` — an upcoming (not-yet-billed) charge is described as landed
  "this period", with an invented "$0.00 last" when no prior period exists.
- `TopMerchantsPanel.tsx:226` — the "one recurring charge" line can describe a different, lapsed
  merchant than the one the verdict counted.
- `SavingsTrendsPanel.tsx:142` — default scope shows "All 1 months →" / "1 months · newest first".
- `SavingsTrendsPanel.tsx:186` — person scope shows a zeroed "Previous month" card where the widget
  deliberately says "No comparison yet" (card/panel disagreement).
- `SpendingPacePanel.tsx:271` — the "today" axis label always renders at the 50% mark, even for
  fully-past months.
- `HomeEquityPanel.tsx:116` — the 12-row amortization schedule marches past payoff with phantom
  full payments.
- `GoalsPanel.tsx:113` — "at the current pace" ignores every zero-contribution month since the last
  deposit (a dormant goal projects an imminent arrival).
- `ActivityPanel.tsx:33` — renders the entire ledger unbounded, against FR-018 and its own header
  comment.
- `BudgetsPanel.tsx:54` — caption claims the relative range while every figure is a single month.
- `WidgetScroll.tsx:42` — edge fades go stale when content height changes in place.
- Test gap: no panel suite pins a panel's headline money figure to its card's figure — exactly the
  gap B4 slipped through.

### Transactions / planning / dashboard / settings / housing (rest)

- `transactionFilters.ts:38` — search matches raw category keys, not displayed labels
  (`fast_food` vs "Fast Food").
- `transactions/page.tsx:82` — the mobile edit round-trip discards all active filters and search.
- `transactions/new/page.tsx:20` — reloading `?copyFrom=` before the store loads silently drops the
  copy intent (the edit page has the loading gate; this one doesn't).
- `splitFields.ts:69` — percent rebalance can emit a negative percentage that saves a negative
  stored share (clamp the absorber at 0).
- `GoalsSummaryCard.tsx:76` — past-month Planning hub: goal cards show today's progress while the
  hero and ordering are month-scoped.
- `range.ts:98` — an all-future ledger renders an empty range picker, violating the function's own
  "thisMonth is always available" contract.
- `useDashboardRange.ts:99` — `now` is frozen at mount; a session left open across midnight shows a
  stale "This month" / "Day X of Y".
- `store.tsx:401` — the persisted currency key is the one preference read without validation; a
  corrupt value crashes money formatting app-wide.
- `MortgageCards.tsx:92` — post-maturity, the "Principal balance" row shows the raw sub-$5 FP
  residual next to a "100%" card (spec 027 requires "Paid off"; the clamp exists and is used by the
  sibling cards).
- `PropertyKindChoices.tsx:48` — promises "You can change type later" but no type-change flow exists.
- `RoutinesList.tsx:39` — the visit-capture 30-minute throttle reads a stale closure and never
  applies on a session's first mount.
- `RoutinesList.tsx:59` — spec 044 FR-016 (personal-routine visibility filter) was never
  implemented; `personId` is computed and consumed nowhere.
- `scanHeuristics.ts:629` — scan `CATEGORY_RULES` have drifted from `engine/categorize.ts` despite
  the "verbatim port — keep in sync" contract.
- Tour, sign-in, and 404 pages overflow the viewport under the default text-size zoom
  (`min-h-screen` not zoom-corrected; the landing page fixed this in the same PR).
- `landing/[locale]/page.tsx:50` — Bengali hreflang/og:locale carries `-u-nu-latn`, outside the
  documented hreflang format.
- Test gaps: no UI test for household member management; no settings-nav parity test.

### DB / edge functions

- `20260816120000_person_budgets.sql:20` — `person_id` columns (budgets, shares via RPC, `paid_by`,
  routine states) are FK-validated to **exist** but not to belong to the row's household. Not a
  cross-household leak (person UUIDs aren't discoverable), but a self-inflicted integrity gap;
  composite FKs on `(household_id, id)` would close it.
- `supabase/functions/simplefin-claim/index.ts:53` — `.maybeSingle()` with no order/limit rejects
  users in 2+ households (`plaid-link-token` handles this correctly).

## 5. Observations (info-level, 18 — abbreviated)

Doc/comment drift: PARITY.md (CLI two-step write absent; web CSV capability missing),
CLAUDE.md spec-044 behavioral-habit description, `neutralDraft()` comment, panel-contract
`DrawerHeader` claim, i18n "nine spec-057 regions" now eight (US8 strings live under the US7
comment), `hasPriorPeriod` doc vs implementation, `useScopedTransactions` memo-sharing comment,
docs/supabase.md Stripe apiVersion pin vs code. Design-note: planning "Left to plan" subtracts a
past-due goal's entire remainder every month; restore never merges rental payments into an existing
property (acknowledged in-code); household color swatches expose raw palette keys to screen
readers; same scope named "Household" on the dashboard but "Everyone" in Planning; concurrent edits
are last-write-wins (unacknowledged in docs); routine confirm/dismiss lacks rollback; several
pre-grant-regime tables lack explicit GRANTs (safe-deny direction); UTC+12..+14 boundary mixing
reaches range windows/heatmap untested; `NEXT_PUBLIC_SITE_URL` still unset (operator task).

## 6. Reviewed and refuted (for the record)

- **PDF tier-2 fuzzy dedupe silently skips near-twins** — accurate description, but it is the
  specified spec-032 v1 behavior (counts-only import UX, skip-by-default mandated by FR-015).
  A future per-row review would be an enhancement, not a bug fix.
- **Scan-flow i18n gap (20 keys)** — the keys are genuinely missing, but the surface is
  unreachable: no production mount exists. Superseded by major **C4** (the real defect is the
  orphaned feature).
- **CLI CSV BOM breaks bank detection** — empirically refuted: every profile trims cells, and
  `String.prototype.trim()` strips U+FEFF; a BOM-prefixed Chase export detects and parses correctly.

## 7. Page-by-page verdicts

| Page / area | Verdict |
|---|---|
| Dashboard shell (scope axes, hero, picker) | **Healthy.** One MoneyScope in state, identity projection pinned, hero math agrees with `personSummary`, i18n complete. Edge cases: all-future ledger, mount-frozen `now`. |
| Widget board (registry, packing, prefs) | **Healthy.** Deterministic packing, correct panel/shortcut wiring, defensive prefs, good a11y. |
| Panel frame (WidgetPanel + kit) | **Solid**, with edge defects: single-slot detail stack (C3), focus/scroll on push/pop, CycleStrip theming/i18n. |
| Spending-pace / savings-trends / top-merchants panels | **Good money math at household+person scope**, i18n complete (93/93 keys) — but the date-frame seam (B1/B2) and the ungated budget verdict (B3) are real wrong-money displays. |
| Budgets / home-equity / housing-costs / goals / activity panels | Engine layer correct and pinned; defects live in panel composition (B4, B6, amortization tail, goal pace, unbounded activity). |
| Transactions list | **Largely healthy** (vector-pinned filters, correct totals) — the date cluster (A3/A4) is the one real defect family. |
| Transaction form | Core invariants strong (shares always sum; defaults on NEW only; copy/edit safe) — edges: A1, A2, B8. |
| Housing | **Engines excellent** (vector-pinned); defects are render-layer: B5, B7, paid-off residual, dark-mode chart. |
| Planning hub / budgets / goals | **Strong.** Single projection point, no household-limit fallback, NULLS NOT DISTINCT respected. Gaps: FX round-trip guards, past-month goal cards. |
| Settings (core) | Money/persistence sound; navigational + i18n gaps (C1, missing labels, currency-key validation). |
| Settings (data: PDF/CSV/banks/subscription) | PDF core genuinely strong; subscription kill-switch exemplary. CSV flow carries A3, A6 and the i18n gap; C2 on export language. |
| Onboarding funnel / sign-in / landing / tour | **Strong.** Router ordering pinned, funnel marker correct, dismiss-only skip, 8-digit OTP matches config. Presentation nits only. |
| Routines | Engine well-built and pinned; B9 (non-Latin merchants) is the significant defect; FR-016 unimplemented. |
| Finance core (cents/money/splits/balances/health/insights) | **Excellent.** Integer-cents discipline throughout, antisymmetric balances, correct thresholds, unusually strong pinning. |
| Scope engine (moneyScope + consumers) | **Excellent.** Every documented invariant verified and pinned; no double-projection anywhere. |
| Store / write path | Strong core (atomic RPC everywhere in-app); defects at the edges the RPC doesn't cover (A5, A7, replace-all saves). |
| DB / RLS / edge functions | **Healthy and carefully reasoned.** RLS on all 26 tables, definer RPCs re-check auth, vault isolated, webhook verified. Minor integrity gaps only. |
| CSV / scan / CLI import | Structurally sound conversion + dedupe; A3/A6 in the web flow, C4 (scan unmounted), JPY handoff, rules drift. |

## 8. Recommended fix order

1. **Date regime** (A3, A4, B1, B2 + budgets/health/personSummary bucketing + tz suites) — one
   coherent PR; this family puts money on the wrong day/month for the entire Americas market.
2. **Money-input parsing** (A1, B8, JPY scan divisor, the four missing FX round-trip guards) —
   stops wrong amounts entering the ledger.
3. **Write-path integrity** (A2, A5, A6, A7, budget-id churn, health saves, localUsers fold,
   CSV await/count) — honest writes and honest failures.
4. **i18n completeness sweep** (§4 first block) + the source→catalog completeness guard test so
   the class can't recur.
5. **Display corrections** (B3–B7, C3, panel polish, paid-off clamp, dark/light chart tokens).
6. **Decisions needed from the product owner:** C4 (mount or de-document scan), FR-016 (implement
   or descope), C1 nav entry, simplefin-claim multi-household posture.

Each item above lists its minimal fix inline; all engines named as vector-locked must be fixed at
the render/caller layer or re-vectored deliberately (the vector diff is the behavior review).

## 9. Review limits

No live signed-in E2E (no Supabase credentials in this sandbox), no real-device iOS safe-area
check, no manual visual walk. The Chromium smoke covered rendering and redirects of the static
export only. Everything else stated here was verified against code, tests, or empirical module
runs, and every finding survived an independent adversarial verification pass.

## 10. Fix status — appended 2026-08-24, same branch

Everything below landed on this branch in seven TDD groups (each fix red-first; every
pre-existing suite and all 13 golden vectors byte-identical throughout). Commits:
G1 date regime `9826092`, G2 money input `3232ae7`, G3 write paths `2aa5833`,
G4 i18n `a7f680c`, G5 display `d92d1dd`, G6 engines/pages `2be4431`, G7 docs + this appendix.

### Majors

| # | Status | Where |
|---|---|---|
| A1 decimal-comma 100× | **Fixed** (G2) | `parseMoney` last-separator-wins; `test/inputs-parse-money.test.ts` |
| A2 edit invents payer | **Fixed** (G3) | `paidByTouched`/`transferFromTouched`; null preserved on untouched saves |
| A3 CSV midnight-UTC dates | **Fixed** (G1) | commit `draft.dateISO` (noon-UTC); `test/csv/useCsvImport.commitDate.test.tsx` |
| A4 ledger grouping guard | **Fixed** (G1) | `parseTxDate` in `format.ts` + budgets/health/personSummary/topMerchants; new `*.tz.test.ts` suites |
| A5 refused delete looks deleted | **Fixed** (G3) | `.select('id')` + zero-row restore + banner |
| A6 "Include anyway" un-tick ignored | **Fixed** (G3) | checkbox written both ways |
| A7 CLI two-step write | **Fixed** (G3) | `createOne`/`updateOne` call the `upsert_transaction` RPC |
| B1 pace month shifts a day | **Fixed** (G1) | raw interval bounds + ms-offset day indexing; tz suite |
| B2 savings phantom month | **Fixed** (G1) | noon-anchored UTC month scaffold; tz suite |
| B3 budget verdict prorated | **Fixed** (G5) | verdict gated to single-calendar-month scopes |
| B4 equity bases mixed | **Fixed** (G5) | rows on loan basis + paid-off clamp |
| B5 equity % wrong basis | **Fixed** (G5) | fraction from the printed pair at both render sites (`equityFraction` untouched) |
| B6 income denominator sentence | **Fixed** (G5) | sentence/caption name the measured month |
| B7 Vacant vs `occupied` flag | **Fixed** (G5) | label resolves from the money's own expression |
| B8 by-value split false-block | **Fixed** (G2) | display-unit sum accepted; drift absorbed into largest share (`splits.ts` untouched) |
| B9 non-Latin merchants collapse | **Fixed** (G6) | `/[^\p{L}\p{M}\p{N}\s]+/gu` + empty-key guards (\p{M} keeps Bengali intact) |
| C1 Deposit Accounts unreachable | **Fixed** (G6) | nav entry + a source-scan nav-parity guard test |
| C2 export-language PDF | **Fixed** (G4) | `makeT(await loadCatalog(language))` passed to `buildDataFile` |
| C3 drill-in skips a level | **Fixed** (G5) | detail state is a stack; Escape/Back pop one level; focus recaptured; scroll reset |
| C4 scan unreachable | **Deferred — decision** | Now documented honestly (docs/index.md, docs/web.md §10). Mounting it is a product call and needs its ~20 keys translated first |

### Minors

- **i18n (entire theme)** — fixed (G4, +G6/G7): 138 keys added across all five catalogs, and one
  false-promise key replaced (35 category
  labels, Data/PDF, bank linking, chrome, sign-in error mapping, CSV flow through `t()`, day
  headers, `periodLabel`, CycleStrip, copy-section headers), plus the missing direction now
  guarded by `test/i18n/catalog-completeness.test.ts` (TS-AST source→catalog scan).
- **Date regime** — fixed (G1/G6): engine bucketing guards + tz suites; `maturityDate` day-clamp.
- **FX round-trips** — fixed (G2): PropertyForm, BudgetDrawer, GoalForm prefill-snapshot guards;
  JPY scan divisor via `fractionDigits`.
- **Store/write-path** — fixed (G3/G7): CSV import awaits writes and reports real added/failed
  counts; health saves roll back (and best-effort restore prior rows); budgets payload omits `id`;
  `localUsers` fold clears only on success; parse exceptions land on the undetected screen;
  duplicate match is kind-aware; import total sums expenses only; currency key validated on read;
  routine confirm/dismiss/rename and location-consent writes now roll back on failure
  (`test/store-writepath-integrity.test.tsx`). Concurrent-edit last-write-wins is now
  ACKNOWLEDGED in docs/web.md rather than changed — a version column is deliberate future work.
- **Panels & widgets** — fixed (G5): focus recapture + scroll reset on push/pop, theme-token
  chart colors, upcoming-charge wording + no invented "$0.00 last", lapsed-merchant line, "All 1
  months" gate, person-scope comparison honesty, positioned/hidden "today" label, schedule stops
  at payoff, dormant-goal pace uses the full span, activity bounded (45), caption states the
  month, content-aware scroll fades. Card figures pinned by `test/housing/housing-cards-display.test.tsx`.
- **Transactions/planning/dashboard/settings/housing** — fixed (G5/G6/G7): label-aware search,
  per-tab filter persistence across the edit round-trip, `copyFrom` loading gate, percent-rebalance
  clamp (no negative shares), month-scoped goal cards, non-empty range picker fallback, day-change
  `now` refresh, paid-off principal row clamp, honest property-type copy (was a false promise),
  visit-throttle stale closure + FR-016 personal-routine filter implemented, scan CATEGORY_RULES
  re-ported with a 28-merchant parity suite, zoom-safe full-height screens, clean hreflang,
  household member management UI pinned + swatch accessible names localized.
- **DB/edge** — simplefin-claim multi-household fixed (G6, oldest-household order). Composite
  `(household_id, person_id)` FKs **deferred**: a schema migration with backfill validation, out
  of scope for this branch (integrity gap is self-inflicted-only; no cross-household read).

### Observations (info)

All doc/comment drift fixed (G7): PARITY.md (RPC row, CLI-only list, payer divergence note),
docs/makefile.md tx-add/tx-edit, CLAUDE.md behavioral habits, `neutralDraft()`, panel-contract
`PanelHeader`, the nine spec-057 catalog regions restored (US8 relabeled, US7 re-reserved),
`hasPriorPeriod` doc, `useScopedTransactions` memo comment, docs/supabase.md Stripe pin
(`2026-07-29.dahlia`), docs/web.md last-write-wins + budgets-upsert key. Swatch a11y and routine
rollback fixed (above). Deferred as design decisions: "Household"/"Everyone" naming unification,
past-due-goal "Left to plan" behavior, restore's property-granularity rental-payment dedupe
(specified v1 behavior), pre-grant-regime GRANT backfill (migration), UTC+12..+14 boundary cases
(new tz suites cover ±11), `NEXT_PUBLIC_SITE_URL` (operator task), desktop's redundant mobile
pipeline (perf-only refactor).

### Verification after the fixes

`npx tsc --noEmit` clean · full suite green (344 files / 3398 tests + 3 expected-fail markers) ·
`npm run test:tz` green (29) ·
13/13 golden vectors byte-identical · `npm run build` green. Still unrun (unchanged from §9): live
signed-in E2E, real-device iOS safe-area, manual visual walk.
