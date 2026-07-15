# Ortho web+iOS audit findings (2026-07-14) — source dossier for spec 023

Four parallel subagent audits (performance, correctness, iOS/Capacitor, refactor).
All items traced to file:line. Feeds spec 023 (web+iOS performance & correctness hardening).
Hard constraints for ALL work: static export (`output:'export'`, no server/SSR/route handlers),
integer USD cents, design tokens only, finance regression-vector parity suites stay green,
perf/refactor items change *when/how* not *what* is computed (bug fixes intentionally correct behavior).

## A. Correctness bugs

### B1 [HIGH] FX round-trip corrupts custom-split shares in non-USD display currency
- Files: `web/components/web/TxForm.tsx:200-205,220-228,376,410`
- The parent total is protected from FX round-trip drift via `originalAmountText` guard
  (`finalCents = editing && amount === originalAmountText ? editing.amount_cents : cents`, line 376),
  but split shares are NOT: custom (value) split re-seeds per-owner through display currency
  (`splitText[id] = centsToDisplay(seed.values[id], r, fd)`) then re-parses (`parseMoney(...)`).
  `validateSplit`/`computeShares` run against `cents` (drifted total) while stored shares are for
  `finalCents` (un-drifted). `parseMoney(centsToDisplay(c))` drifts ~22% of values at GBP 0.78, ~8% EUR 0.92.
- Two reachable outcomes for a GBP user opening a 2-owner value-split and hitting Save unchanged:
  (a) BLOCKED save — false "Amounts must add up to £X", canSave=false; (b) BROKEN sum (silent) —
  shares sum to 12¢ while parent stays 11¢ → transaction_shares no longer sum to amount_cents
  (the #1 money invariant), wrong per-owner attribution + wrong settle-up balances.
- Fix: on a no-op edit reuse `editing.shares` verbatim (mirror the amount guard for the split); seed/validate/compute
  the split against `finalCents`, not the re-parsed `cents`.

### B2 [MED] Budget insights use mid-month reference for a SELECTED specific month
- Files: `web/lib/finance/insights.ts:73-76,155` via `web/components/dashboard/range.ts:125-130`;
  call sites `DashboardDesktop.tsx:142`, `InsightsCardStack.tsx:59`.
- Selected month feeds `monthReferenceDate(yyyymm)` = 15th at noon UTC as `now`, so `dayOfMonth≈15`,
  `daysLeft = daysInMonth-15 ≈ 13-16` regardless of the month being long over, and `monthProgress≈0.5`.
  Over/Approaching cards render "…with 14 days left" for finished months; the "Under budget" rule
  (`fraction<=0.5 && monthProgress>=0.7`, line 155) can NEVER fire in specific-month mode. Amounts are correct;
  day counts + rule selection are wrong.
- Fix: pass the real day count for the selected month (end-of-month when past), or compute daysLeft/monthProgress
  from the interval, not `now`.

### B3 [MED] iOS scan: camera never dismisses after capture; multi-page pageCaptured events dropped
- Files: `web/ios/App/App/Plugins/Scan/ScanCaptureController.swift:171-186`, `ScanPlugin.swift:96-111`,
  `web/lib/scan/useScanFlow.ts:42-53`.
- `deliverFirstCapture`/`handlePhoto` resolve `capture()` + relabel button "Done" but never dismiss the
  controller; `useScanFlow` immediately parses page 1 and renders the review UI BEHIND the still-presented
  full-screen camera. `useScanFlow` never calls `ScanPlugin.onPageCaptured`, so every subsequent photo
  (`notifyListeners("pageCaptured")`) is silently discarded.
- Fix: dismiss the controller in `deliverFirstCapture` for single-shot, OR wire `onPageCaptured` + a "done"
  action and accumulate pages before parsing.

### B4 [MED] iOS biometric lock unmounts AppStateProvider → full re-bootstrap on every foreground
- Files: `web/app/(app)/layout.tsx:132-134`.
- `if (gate.state !== 'unlocked') return <BiometricLockScreen>` unmounts the whole provider subtree on
  background; `store.tsx` `booted` ref is per-instance so unlock remounts + re-runs `runBootstrap()`
  (spinner + 11 parallel selects), discarding scroll position, open modals, in-progress form input.
- Fix: render the lock as an overlay OVER a kept-mounted provider (gate inside the shell) so state survives
  a background/foreground cycle.

### B5 [MED] Foreground liveness uses getSession() (cache-first), not getUser() (server)
- Files: `web/lib/store.tsx:386` (`if (isActive) void supabase.auth.getSession()`).
- getSession() returns the stored token, only refreshes near expiry, never hits the server — a server-revoked
  session isn't detected within the ~1h access-token TTL, undercutting the documented "closes the liveness gap".
- Fix: use `getUser()` for a real server round-trip on foreground.

### B6 [LOW-MED] Stale user-facing string "6-digit code" (sign-in is 8-digit)
- Files: `web/lib/i18n/*.ts` (in the dead/near-dead keys), key `"We'll email you a 6-digit code. No password, no fuss."`
- Fix: correct to 8-digit (and see A-refactor dead-key purge).

### B7 [LOW-MED] Unchecked compensating (rollback) writes in atomic tx+shares path
- Files: `web/lib/store.tsx:667,691-695` (`writeShares` 623-637).
- Single failures handled; compensation is fire-and-forget. addTransaction: on writeShares failure the parent
  `delete()` result is ignored — if that also fails, parent survives with no shares. updateTransaction restore
  re-updates parent + calls `writeShares(prevTx)` unchecked; writeShares does DELETE-then-INSERT so
  delete-ok/insert-fail leaves it share-less. Next `loadAll` `rehydrateTransactions` synthesizes
  `owner_ids:[creator], shares:{creator: amount_cents}` for an expense → split expense silently becomes
  creator-owned. Needs two consecutive failures; acknowledged in PARITY.md (a Postgres RPC is the true fix).
- Fix: check compensating delete/update/writeShares results; on failure keep the error banner + don't present
  the row as consistent.

### B8 [LOW] `-webkit-user-select:none` not native-gated → web users can't select/copy amounts
- Files: `web/app/globals.css:184-188` (targets bare `html`).
- Fix: scope shell selection-disable to native (platform class on `<html>`).

### B9 [LOW] tail
- Settle-up in non-USD can be a cent off (same FX root as B1) — `components/transactions/BalanceSummary.tsx:60-62`
  → TxForm transfer amount; carry exact USD cents into the transfer instead of re-deriving from display string.
- Status-bar text style only synced when Settings mounts, never at launch/other tabs —
  `components/settings/appearance.ts:83-86`, only caller `app/(app)/settings/page.tsx:87-91`; fix: call
  `applyAppearance(readAppearance())` once in the app-shell mount, or add StatusBar.setStyle to the boot path.
- Biometric re-auth re-entrancy / possible double Face ID on transient interruptions —
  `web/lib/biometricGate.ts:53-66`; guard against re-entrancy while attemptUnlock is in flight.

## B. Performance

### P1 [High/M] Lazy-load i18n catalogs
- Files: `web/lib/i18n/index.ts:9-13` (static import bn/es/ja/zh/ko), imported by `web/lib/store.tsx:29`.
- ~30 KB gzip / ~100 KB raw (bn 33K, ja 23K, ko 22K, es 22K, zh 20K) ship on EVERY route; default English
  user (identity t()) needs zero, any other user needs exactly one (~8 KB).
- Fix: dynamic-`import()` only the active catalog in `makeT` (store already adopts `language`/`locale` after
  mount at `store.tsx:217-223`); return English identity until the catalog resolves, then re-render.
- CAVEAT: `test/i18n/render-locale.test.tsx` renders synchronously in es/ja asserting no English leak — must
  await the async load or add a test-only sync preload.

### P2 [High/S] Memoize Intl.NumberFormat / DateTimeFormat
- Files: `web/lib/finance/money.ts:60` (formatMoney), `web/lib/format.ts:47,51,55,61,66`
  (dayLabel/shortDate/monthYearLong). Reconstructed per call — ~300 NumberFormat + ~200 DateTimeFormat per
  ledger render (per row in `TransactionRow.tsx:103`, `TransactionsDesktop.tsx:147`).
- Fix: module-level Map keyed by (locale, currency, fractionDigits) / (locale, options). Output byte-identical →
  vectors stay green.

### P3 [Med-High/S] Memoize dashboard aggregations
- Files: `InsightsCardStack.tsx:59` (generateInsights, 363 lines, ~19 passes), `MonthSummaryCard.tsx:38-42`,
  `BudgetProgressCard.tsx:34-40` (calls store `categoryExpenseTotal` per category, each re-filters the whole
  array — `store.tsx:604-607`). SpendByCategory/PerOwner/TopMerchants/DailyTrend already useMemo — these 3 are the gap.
- Fix: `useMemo` keyed on [transactions, budgets, properties, interval, t, locale]; precompute one in-range slice.

### P4 [High-on-large/L] Split + memoize store context; React.memo rows; (later) virtualize
- Files: `web/lib/store.tsx:1016-1073` (value is a fresh object literal each render; callbacks get new identities;
  zero React.memo in components/). One optimistic mutation or FX/loading toggle re-renders all ~50 useApp()
  consumers incl. the entire ledger. `refreshRates()` fires ~3-4 setState at startup (`store.tsx:530-553`).
- Fix: split a stable services/actions context (mutations + resolveUser/t, useCallback-stabilized) from the
  changing data arrays; React.memo TransactionRow/TxRow. formatMoney MUST still change identity on
  currency/rate/locale change. Then virtualize the ledger (`TransactionRow.tsx:48`/`TransactionsDesktop.tsx:113`,
  `.cv-row` globals.css:419-421 only saves paint not React reconciliation).
- NOTE: both perf & refactor agents agree the SPLIT is the lever, not memoizing value alone; biggest/riskiest perf item.

### P5 [Med/M] loadAll select('*') → column projection (then windowing)
- Files: `web/lib/store.tsx:436-461` (transactions/transaction_shares/users select('*'), no limit/range).
- Fix: column-project selects to used fields (immediate transfer/parse cut); longer-term window to a recent slice
  for first paint + background-load the tail. Windowing is coupled to server aggregates (insights/vs-last-month/
  top-merchants need full history) → do windowing only WITH aggregates.

### Aggregates verdict [REJECTED as standalone perf]
- `web/lib/api/aggregates.ts` (97 lines, unwired). Wiring the 4 RPCs adds network round-trips to replace
  in-memory loops the client already holds after loadAll → net loss + breaks offline + new loading/waterfalls.
  Only worthwhile PAIRED with P5 windowing. Decision for 023: keep unwired; either delete both files
  (aggregates.ts + test/aggregates.test.ts) or leave documented — do NOT wire for perf.

## C. Refactor / dead code / type-safety

- ~200 dead i18n keys across the 5 catalogs (368 keys each): demo-mode / personal-shared (spec 007) / local-user
  leftovers — e.g. "Demo mode","Load demo","Sync all from server","Shared","Personal","New local user",
  "Enter demo mode?", and the 6-digit string (B6). Delete + add a guard test asserting every catalog key is
  reachable from a t() call or an allowlisted dynamic source (mirrors deleted catalog-parity.test.ts). Pairs with P1.
- Untyped Supabase → domain casts: `store.tsx:469-508` (`data as User[]/Person[]/Transaction[]`, `(m:any)`/`(l:any)`
  489/492), client `as unknown as ReturnType<typeof createBrowserClient>` (`supabase/client.ts:35,59`). No generated
  Database types. Column/enum rename compiles clean, fails at runtime. Fix: `supabase gen types` + typed client,
  or one typed row→domain mapper.
- Transaction is a flat interface not a discriminated union (`lib/types.ts:63-85`): kind/paid_by/owner_ids/shares
  mean different things per kind; 8 files hand-branch `kind==='transfer'` + index owner_ids[0] with ? guards
  (store, TxForm, TransactionRow, TransactionDetailBody, TransactionsDesktop, TxModalWeb, balances, TransactionDetailModal).
  Fix: `isTransfer(tx): tx is TransferTx` + `transferParties(tx)→{from,to}` accessor (full DU heavier given flat DB row).
- Duplication: month-accordion (currentMonthKey/defaultOpenKey/openMonths/isMonthOpen/toggleMonth) near-verbatim in
  `app/(app)/transactions/page.tsx:57-74` and `components/web/TransactionsDesktop.tsx:259-277` (already drifting) →
  extract `useMonthAccordion(months, filterCount)`. TxModalWeb (`:37-73`) vs TxForm (`:824-863`) duplicate form-body
  assembly (picking state, allowCopy, TxCopyList/CopyFromRecentButton + TxFormFields + SaveAndAddAnotherButton) →
  extract `<TxFormBody>` (useTxForm already shared).
- Dead code: `relativeTime` (`lib/format.ts:69`) referenced only by test; settings reimplements as
  `relativeTimeLabel` (`app/(app)/settings/page.tsx:54`) with locale awareness the orphan lacks → delete orphan.
  Two hand-synced fake Supabase clients: `lib/testdata/memory-client.ts:10` (88 lines, "productionized copy") vs
  `test/helpers/supabase-mock.ts` (174) → factor shared chainable core (test-infra only).

## Provably-fine (bounded search, do NOT touch)
splits.ts leftover/reclaim + computeShares value/even/percent; balances.ts settle direction; money/currency rounding
(round-half-away, rate<=0 guard, JPY magnitude); transactionFilters.monthBounds half-open UTC; mortgage.monthsElapsed
day-clamp; housing.ts occupied-only net rental (Dashboard==detail); all housing date-only reads use parseLocalDate;
capacitor.config.ts no server.url/4.2 risk, iosScheme https + contentInset never consistent; static export clean.
Transaction date bucketing relies on noon-UTC convention (safe ±12h; UTC+13/+14 residual is a deliberate design constraint).
