# Research & Design Decisions — Spec 023

Phase 0. Each finding from the audit dossier resolved to a concrete design decision. The dossier
(`audit-findings.md`) carries the exact `file:line`; this file records *what* approach and *why*.
No open `NEEDS CLARIFICATION` remain — the spec's Assumptions fixed every judgment call.

---

## D1 — Lazy-load i18n catalogs (P1, FR-012/013)

**Decision**: Make `lib/i18n/index.ts` expose an async catalog loader; `makeT` returns the English
identity function until the active language's catalog is dynamically `import()`-ed, then the store
re-renders with the resolved catalog. Only the selected language's chunk is fetched; the default
(English/System-English) user fetches none. Wire the load into the store's existing "adopt
preference after mount" path (`store.tsx:217-223`) so SSR/first paint stay English and there is no
hydration mismatch.

**Rationale**: All five catalogs (~30 KB gzip / ~100 KB raw) currently ship in the shared chunk via
static imports pulled in through `store.tsx`. Lazying them is the single biggest remaining
initial-load win (hits *every* route, unlike the per-route spec-022 chart win) and fits the store's
already-async preference-adoption model. Static-export-safe: dynamic `import()` of a local module
needs no server.

**Alternatives considered**: (a) keep eager — rejected, it's the largest remaining weight; (b)
route-level split — rejected, catalogs are needed on every authed route, language is the right axis;
(c) preload all on idle — rejected, still downloads four unused catalogs.

**Risk/guard**: `test/i18n/render-locale.test.tsx` renders es/ja **synchronously** and asserts no
English leak — it must `await` the async catalog load (or use a test-only synchronous preload helper).
This is the one test that must change behavior-preservingly; document why in the test.

---

## D2 — Memoize `Intl` formatters (P2, FR-014)

**Decision**: Add a module-level cache (a `Map`) in `lib/finance/money.ts` and `lib/format.ts`
keyed by the formatter's construction args — `(locale, currency, minimumFractionDigits,
maximumFractionDigits)` for `NumberFormat`, `(locale, optionsKey)` for `DateTimeFormat`. Look up or
lazily construct; reuse thereafter.

**Rationale**: `formatMoney`/`dayLabel`/`shortDate`/`monthYearLong` construct a fresh `Intl.*Format`
on every call — ~300 `NumberFormat` + ~200 `DateTimeFormat` per ledger render. Construction is one of
the heaviest routine JS ops. A cache makes output **byte-identical** (same formatter, same args) so
the regression vectors stay green — this is a pure speed change.

**Alternatives considered**: (a) hoist a single formatter — rejected, locale/currency/fraction-digits
vary; (b) pass formatters down via context — rejected, more plumbing than a keyed cache, and
identity churn would fight P4. Cache key must include every arg that affects output.

---

## D3 — Memoize dashboard aggregations (P3, FR-015)

**Decision**: Wrap the three unmemoized aggregations in `useMemo` keyed on their real inputs:
`InsightsCardStack` (`generateInsights(...)`, keyed `[transactions, budgets, properties, interval,
t, locale]`), `MonthSummaryCard` (inline loop → `useMemo`), `BudgetProgressCard` (stop calling the
store's whole-array-rescanning `categoryExpenseTotal` per category — compute one in-range,
grouped-by-category slice with `useMemo` and index it).

**Rationale**: These recompute on every store change while mounted (the 363-line insights engine
included). The other four dashboard cards already `useMemo` correctly — this closes the gap. Same
inputs → same output, so nothing visible changes.

**Alternatives considered**: (a) push aggregation into the store — rejected, widens the context and
fights P4; (b) server aggregates — rejected (see D15). Keep it component-local + memoized.

---

## D4 — Split + memoize the store context; `React.memo` rows (P4, FR-016) — the structural item

**Decision**: Split the single `AppStateProvider` value into two contexts behind the **same
`useApp()` surface**: a **stable actions/services context** (mutations, `resolveUser`, `t`,
`formatMoney`, `ownersDisplay` — all `useCallback`/`useMemo`-stabilized) and a **data context** (the
changing arrays + loading/error/FX state). Consumers that only call actions stop re-rendering on data
changes. Then `React.memo` `TransactionRow` (`components/transactions/TransactionRow.tsx`) and the
desktop `TxRow` so an unrelated mutation skips unchanged rows. `formatMoney` **must still** change
identity when currency/rate/locale change (correct memo dependency).

**Rationale**: Today `value` is a fresh object literal each render and zero components are memoized,
so one optimistic add / FX refresh / loading toggle re-renders all ~50 `useApp()` consumers including
the whole ledger. `refreshRates()` alone fires ~3-4 setStates at startup. This is the structural
cause behind P2/P3 repetition. Keeping `useApp()` as the public surface means **no consumer import
changes** — the split is internal.

**Rationale for priority (P3/US6, done after the P1 quick wins)**: highest payoff on large ledgers
but the riskiest change (touches how every consumer subscribes). Land it after P2/P3 have already
removed most of the per-render cost, behind unchanged component-behavior tests. Virtualizing the
ledger is a **follow-on within US6**, gated on the `React.memo` split existing; if it risks any
visual/scroll regression it is deferred to a fast-follow (not required for US6 acceptance).

**Alternatives considered**: (a) memoize `value` only — rejected (both agents: doesn't cut renders
without the split, since every consumer still subscribes to one context); (b) external store lib
(Zustand/Jotai) — rejected, out of scope, violates "no new state lib" convention; (c) selector
hooks over one context — rejected, `use-context-selector` is a new dep; the two-context split is the
minimal in-tree change.

---

## D5 — Column-project `loadAll` (P5, FR-017)

**Decision**: Replace `select('*')` on `transactions`, `transaction_shares`, and `users` with
explicit column lists covering exactly the fields the app reads. Do **not** window/paginate in this
feature.

**Rationale**: `select('*')` over-fetches columns and blocks first paint on the full history. Column
projection is a safe, immediate transfer/parse cut with identical in-app values. Windowing needs
server aggregates for insights/"vs last month"/top-merchants (which need full history) — deferred
(D15). Pairs with FR-018: the projected selects become the typed row shapes.

**Alternatives considered**: (a) window now — rejected, breaks full-history aggregations without
server rollups; (b) leave `*` — rejected, easy win. Projection only.

---

## D6 — B1: FX round-trip must not corrupt split shares (FR-001) — the HIGH bug

**Decision**: Mirror the existing parent-total guard onto the split. On a **no-op edit** (`editing &&
amount === originalAmountText`), reuse `editing.shares` verbatim and skip re-seed/re-parse. When the
split *is* edited, seed/validate/compute it against **`finalCents`** (the un-drifted total), not the
re-parsed display `cents`. The integer-cents value is authoritative; the display string is
presentation only.

**Rationale**: `TxForm.tsx:376` protects the parent (`finalCents = editing && amount===originalAmountText
? editing.amount_cents : cents`) but the split is re-seeded through display currency
(`centsToDisplay`) and re-parsed (`parseMoney`), and validated/computed against `cents`. Since
`parseMoney(centsToDisplay(c))` drifts ~22% of values at GBP, a no-op save either false-blocks
(validation vs `rt(total)`) or silently writes shares that don't sum to the parent — violating the #1
money invariant. Seeding/validating against `finalCents` + verbatim reuse on no-op removes both.

**Test-first**: a failing test opening a GBP value-split transaction, saving unchanged, asserting
`sum(shares) === amount_cents` and `canSave === true`; plus the 11¢→2/9 and 2¢→1/1 dossier cases.

**Alternatives considered**: (a) round display back to cents on blur — rejected, still lossy and
changes typed UX; (b) store shares in display units — rejected, violates USD-cents invariant. Keep
cents authoritative.

---

## D7 — B2: month-scoped budget insights (FR-003)

**Decision**: Feed the insight engine a reference that reflects the **selected month's real elapsed
time**: for a completed past month, treat it as fully elapsed (end-of-month); for the current month,
keep "today". Compute `daysLeft`/`monthProgress` from the interval rather than a fixed mid-month
`now`. Change is in `components/dashboard/range.ts` (what reference is passed) and/or
`lib/finance/insights.ts` (deriving progress from the interval).

**Rationale**: `range.ts` currently passes `monthReferenceDate(yyyymm)` = the 15th-at-noon-UTC as
`now`, pinning `dayOfMonth≈15`, so finished months show "~14 days left" and the "under budget" rule
(`fraction<=0.5 && monthProgress>=0.7`) can never fire in month-select mode. Deriving from the
interval fixes both. Amounts are already correct — only day-count/rule-selection change.

**Guard**: this touches `insights.ts`, a regression-vectored engine. Add/extend vectors for the
month-select reference so the corrected behavior is pinned; regenerate `shared/test-vectors` and
review the diff (it *should* change only the day-count/rule fields for month-select inputs, nothing
for current-month/default inputs).

**Alternatives considered**: (a) hide day-count in month-select mode — rejected, loses information
and still suppresses the positive card; (b) always use "today" — rejected, wrong for past months.
Interval-derived is correct.

---

## D8 — B3: iOS scan camera dismissal + multi-page capture (FR-004)

**Decision (Swift + JS)**: For the single-shot flow, dismiss `ScanCaptureController` in
`deliverFirstCapture` before/as `capture()` resolves so the review UI is not occluded. For
multi-page, wire `useScanFlow` to `ScanPlugin.onPageCaptured`, accumulate pages, and parse on an
explicit "Done". Clean up the temporary capture JPEGs after the session (or stop writing them, since
`useScanFlow` consumes only the OCR `page`).

**Rationale**: `deliverFirstCapture`/`handlePhoto` resolve `capture()` and relabel the button but
never dismiss the controller, so the React review renders *behind* the full-screen camera; and
`useScanFlow` never subscribes to `pageCaptured`, so subsequent photos are dropped. Also fixes the
temp-file accumulation (dossier B-tail).

**Verification**: iOS-only — built by the Capacitor iOS CI; a manual device/simulator check confirms
camera→review and multi-page. Not runnable in the Linux sandbox.

**Alternatives considered**: (a) render review as a native sheet — rejected, larger native rework;
(b) leave multi-page unfixed — rejected, it silently loses user data. Dismiss + wire the listener.

---

## D9 — B4: biometric lock as an overlay over a kept-mounted provider (FR-005)

**Decision**: Move the biometric gate so the `BiometricLockScreen` renders as an **overlay above** a
kept-mounted `AppStateProvider`, instead of `layout.tsx:132-134` early-returning the lock and
unmounting the provider subtree. The provider (and its `booted` ref, loaded data, scroll, modals,
form state) survives a background→foreground cycle; the lock simply covers it until unlocked.

**Rationale**: The early return unmounts the whole subtree, so unlock remounts and re-runs
`runBootstrap()` (spinner + 11 selects), discarding scroll/modals/in-progress input — a jarring
reload on every unlock. An overlay keeps state intact.

**Verification**: iOS-runtime via CI/manual. Web behavior unaffected (gate is native-only).

**Alternatives considered**: (a) persist+restore scroll/form across remount — rejected, fragile and
partial; (b) skip re-bootstrap if `booted` in a module-level (not per-instance) ref — rejected, the
overlay is cleaner and also preserves React tree state (open modals). Overlay wins.

---

## D10 — B5/B6/B8/B9/B10 tail

- **B5 foreground liveness (FR-006)**: replace `supabase.auth.getSession()` (cache-first) with
  `supabase.auth.getUser()` (server round-trip) in the `appStateChange` handler (`store.tsx:386`), so
  a server-revoked session is caught. Optionally debounce to avoid a call on every rapid resume (D-perf
  P8), but correctness (getUser) is the requirement.
- **B6 copy (FR-007)**: correct the "6-digit code" string to "8-digit" across catalogs; folded into the
  D16 dead-key purge (the current string is in the near-dead set).
- **B8 web selection (FR-009)**: gate the `-webkit-user-select:none` block in `globals.css:184-188`
  behind a native platform class on `<html>` (e.g. add a `capacitor`/`native` class in the boot path
  when `Capacitor.isNativePlatform()`), so browser users keep selection/copy while iOS keeps long-press
  suppression.
- **B9 biometric re-entrancy (FR-011)**: guard `biometricGate.ts` against re-entrant `attemptUnlock`
  (ignore `appStateChange` while an unlock is in flight) and/or debounce the foreground re-auth so
  Control-Center/notification-shade/auth-sheet transitions don't double-prompt.
- **B10 status bar (FR-010)**: call `applyAppearance(readAppearance())` once at app-shell mount (or add
  `StatusBar.setStyle` to the boot path in `app/layout.tsx`) so the status-bar style matches the theme
  from launch and on every tab, not only after Settings mounts.

**Rationale/verification**: each is a small, localized fix; B5/B9/B10 are iOS-runtime (CI/manual),
B6/B8 are web-observable (jsdom/component test). All test-first where a DOM/behavior assertion is
possible; iOS-native ones are asserted by contract + CI build + manual device check.

---

## D11 — B7: checked compensating writes (FR-008)

**Decision**: In `store.tsx` `addTransaction`/`updateTransaction`, check the result of every
compensating write (the parent `delete()` after a failed `writeShares`; the parent re-update +
`writeShares(prevTx)` on the update-rollback path). If a compensation **also** fails, keep the error
banner up and do **not** drop/normalize the affected row in local state, so a share-less/partial row
is never presented as consistent (it stays flagged until the next successful reconcile).

**Rationale**: Compensations are currently fire-and-forget; a second failure leaves a share-less
parent that `rehydrateTransactions` later reads as "creator owns all". Checking the result and
surfacing failure closes the client-side gap. **A truly atomic parent+shares write via a Postgres RPC
is out of scope** (schema change; noted in PARITY.md) — this is the pragmatic client-side hardening.

**Alternatives considered**: (a) Postgres RPC now — rejected per spec Assumptions (bigger, schema
change); (b) retry loop — rejected, can mask persistent failure. Check + surface + don't-normalize.

---

## D12 — FR-018: type the Supabase → domain boundary

**Decision**: Prefer generated `Database` types (`supabase gen types typescript` → committed
`lib/supabase/database.types.ts`, client typed as `createBrowserClient<Database>`), replacing the
`data as User[]|Person[]|Transaction[]` and `(m: any)`/`(l: any)` casts in `loadAll` with checked
row→domain conversions. **Fallback** (if codegen isn't runnable in-sandbox / no service access): a
hand-written typed `Row` interface set + a typed mapper module at the load boundary that the compiler
checks against the domain types. Either satisfies "a column/enum rename fails at compile time."

**Rationale**: Today the client is `as unknown as ReturnType<typeof createBrowserClient>` and reads
are unchecked casts, so a migration rename compiles clean and fails at runtime. Typing the boundary
is a high-leverage bug-risk reduction across every read. Generated types are the gold standard;
a typed mapper is an acceptable equivalent that needs no live schema access.

**Alternatives considered**: (a) leave casts — rejected, the whole point; (b) runtime validation
(zod) at the boundary — rejected as heavier than needed and adds a dep; compile-time typing is the
requirement.

---

## D13 — FR-019: `Transaction` transfer accessor

**Decision**: Add `isTransfer(tx): tx is TransferTx` and a `transferParties(tx) → { from, to }`
accessor (in `lib/types.ts` or a small `lib/transaction.ts`), and route the ~8 hand-branched sites
(`store`, `TxForm`, `TransactionRow`, `TransactionDetailBody`, `TransactionsDesktop`, `TxModalWeb`,
`balances`, `TransactionDetailModal`) through it. Keep the flat DB row shape (a full `TransferTx |
SpendTx` discriminated union is heavier given the single flat table) — the guard + accessor capture
the invariant without a schema/型 overhaul.

**Rationale**: `kind`/`paid_by`/`owner_ids`/`shares` mean different things per kind; the repeated
`kind==='transfer'` + `owner_ids[0]` idiom lets invalid states through and duplicates knowledge.
A single guard/accessor centralizes it and is a pure refactor (no behavior change; existing tests pin
it).

**Alternatives considered**: (a) full DU — rejected as too invasive for the flat row; (b) leave as-is
— rejected, it's a recurring bug vector. Guard + accessor is the right-sized change.

---

## D14 — FR-020: de-duplicate month-accordion + tx-form-body

**Decision**: Extract `useMonthAccordion(months, filterCount)` (from the near-verbatim mobile
`transactions/page.tsx:57-74` and desktop `TransactionsDesktop.tsx:259-277`) into `lib/`, and a
shared `<TxFormBody>` component (from the duplicated `TxModalWeb.tsx:37-73` vs `TxForm.tsx:824-863`
assembly) that both the modal and drawer wrap. `useTxForm` is already shared — only the body assembly
and the accordion state are duplicated.

**Rationale**: Two live drift vectors (the desktop accordion comments have already diverged). Pure
refactors, behavior identical, guarded by existing component tests.

**Alternatives considered**: none material — this is standard extraction.

---

## D15 — Resolve `aggregates.ts` (FR-022) — keep documented-unwired

**Decision**: **Keep `lib/api/aggregates.ts` unwired** and add a one-line status note (it is a net
perf *loss* to wire standalone: replaces in-memory loops with network round-trips, breaks offline).
Do **not** delete it — it's the documented cut-over path that becomes worthwhile only paired with
`loadAll` windowing (a future feature). Its own test stays. Explicitly **not wired** in this feature.

**Rationale**: The perf audit assessed and rejected wiring it standalone; the refactor audit flagged
it as unreferenced. "Keep + document" preserves the intended future path at ~0 bundle cost (already
tree-shaken) without doing net-negative work now.

**Alternatives considered**: (a) delete both files — viable but discards the cut-over plan; chosen
"keep documented-unwired" per the spec Assumption to avoid re-deriving it later. (b) wire it —
explicitly rejected (net loss).

---

## D16 — FR-021: purge dead i18n keys + reintroduction guard

**Decision**: Diff every catalog's keys against the set reachable from `t()` calls (plus an
allowlist of dynamic sources: `CURRENCY_NAMES`, category labels, insight strings). Delete the ~40
confirmed-orphan keys per catalog (~200 total: demo-mode / personal-shared / local-user leftovers,
incl. the B6 "6-digit" string — corrected, not just deleted, if the sign-in caption key is still
live). Add a guard test asserting every catalog key is reachable or allowlisted (mirrors the deleted
`catalog-parity.test.ts`), preventing reintroduction. Pairs with D1 (smaller catalogs to lazy-load).

**Rationale**: ~200 dead keys waste translator effort and bundle weight and hide stale strings (B6).
A reachability guard makes the purge durable.

**Verification**: the guard test itself is the acceptance instrument; run it before/after. Take care
to allowlist genuinely-dynamic keys so the guard doesn't false-fail.

**Alternatives considered**: (a) delete without a guard — rejected, keys creep back; (b) leave —
rejected, it's confirmed dead. Purge + guard.
