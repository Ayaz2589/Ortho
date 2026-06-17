# Phase 0 Research — Canonical Decisions

Each divergence is reconciled to ONE canonical definition. Default rule: **iOS is canonical, web
conforms** (Constitution + README: "the iOS app is the canonical expression of the product"). The sole
exception is R7, where iOS is correct and web is wrong, so web moves to iOS's behavior anyway.

## R1 — Owner ordering for the leftover cent (FR-001)

**Finding**: `computeShares(amount, owners, split)` is order-sensitive by contract — the leftover cent
from flooring goes to `owners[i % n]` in list order (web `splits.ts:52`, iOS `TransactionSplits.swift:50`).
The two clients feed it owners in different orders:
- iOS `Transaction.orderedOwners` = `ownerIDs.sorted { $0.uuidString < $1.uuidString }` (used by
  `effectiveShares` and `makeSample`).
- Web computes shares from the form's `owners` array (selection order) and `effectiveShares`
  (`format.ts:9`) passes `tx.owner_ids` (DB-row order) **unsorted**.

So the same even split entered on each client can place the leftover cent on a different person, and the
existing split vectors never catch it (they pass pre-ordered arrays).

**Decision**: Canonical owner order = **owner-id strings sorted ascending**. Add a pure
`orderedOwnerIds(ids)` to both clients and route every even/percent share computation and the
`effectiveShares` even-fallback through it. iOS already sorts by `uuidString`; relative order of two
hex UUID strings is identical whether compared as upper- or lower-case (digits < letters in both ASCII
ranges, and each client's ids are internally one case), so web's lexicographic sort of lowercase Postgres
UUIDs yields the same order as iOS's `uuidString` sort. **No behavior change to `computeShares` itself**
(its order-sensitivity and the `order-matters` vector stay); only callers canonicalize.

**Lock**: new `ownerOrdering` section in `transaction-splits.json` — cases pass owners in scrambled order;
expected = `computeShares(amount, orderedOwnerIds(owners), split)`. Both suites assert
`computeShares(amount, orderedOwnerIds(scrambled), split) == expected`.

## R2 — Currency conversion rounding (FR-002)

**Finding**: iOS `Money.toUSDCents` and `toDisplayAmount` use `Decimal` + `NSDecimalRound(.plain)`
(round half away from zero). Web `money.ts` has `toUSDCents` (float + `Math.round`) but **no**
`toDisplayAmount`, and conversion has zero vector coverage. For non-negative money, `Math.round` (half up)
== half-away-from-zero, so they agree; the risk is float-vs-Decimal at a rounding boundary.

**Decision**: iOS is canonical. Add web `toDisplayAmount(cents, currency, rate) = round((cents/100)*rate,
fractionDigits)` mirroring iOS. Keep web `toUSDCents` (numerically already `round((displayAmount/rate)*100)`
— the `divisor` cancels) but route both through a small `roundHalfAwayFromZero` helper so the rule is
explicit and matches iOS for any sign. Choose vector inputs that are boundary-safe (avoid `.xx5` float
artifacts) plus a couple of clean half-cent ties both handle identically; the iOS suite is the safety net
if `Decimal` ever disagrees.

**Lock**: new `currency.json` — for all 7 currencies (usd/cad/gbp/eur/jpy/cny/bdt) at their fallback rates:
`toDisplayAmount(cents)` and `toUSDCents(displayAmount)` cases. Generated from TS, asserted by both suites.

## R3 — Atomic transaction + shares write (FR-003)

**Finding**: web `store.tsx` inserts the parent (`addTransaction:499`), then calls `writeShares` (`:505`)
which deletes + inserts `transaction_shares` with **no error capture**. A shares-insert failure (e.g. RLS)
leaves a share-less parent that `rehydrateTransactions:142` reads as "creator owns all." iOS persists the
transaction and its shares as one failing unit (`TransactionsAPI`), so a failure leaves nothing partial.

**Decision**: No schema change and no DB deploy is available in this environment, so implement
**client-side self-repair** (the spec allows "all-or-nothing *or* self-repairing"): `writeShares` returns
`{ ok }`; on failure `addTransaction` deletes the just-inserted parent and rolls back optimistic state +
sets the error; `updateTransaction` restores the previous transaction. Net user-facing contract: no
orphaned share-less parent on either client (FR-003 / SC-003). A server-side
`create_transaction_with_shares` RPC is noted as future hardening (out of this feature's no-migration scope).

**Lock**: `store.test.tsx` (web behavior test) forces the shares insert to fail and asserts the parent does
not survive locally and an error is surfaced. (Runtime contract; not a golden vector.)

## R4 — Web money honors locale (FR-004 / FR-017 completion)

**Finding**: `money.ts:31` hardcodes `new Intl.NumberFormat('en-US', …)`. Date/number helpers in
`format.ts` already take a `locale`; only money ignores it. iOS `Money.formatter` uses
`Localizer.currentLocale`. The store already holds a `locale` state (`store.tsx:171`) derived from the
language picker.

**Decision**: add a `locale` parameter to `money.ts` `formatMoney` (and `toDisplayAmount`), default `en-US`
for back-compat; `store.formatMoney` passes `locale`. The `InsightEngine` body text formats USD internally
(`insights.ts usd()` is en-US; iOS engine formats USD via its own locale) — insight **body** strings are not
part of the vectored contract and are a minor surface, so engine internals stay as-is (noted, not in scope).

**Lock**: runtime/visual (Intl vs NumberFormatter strings cannot match byte-for-byte) — validated via
quickstart; the *cents* math is locked by R2.

## R5 — Zero-decimal currency magnitude (FR-005)

**Finding**: `money.ts:28` `divisor = fractionDigits===0 ? 1 : 100`, then `amount = (cents/divisor)*rate`.
For JPY (0 digits) divisor=1 → `cents*rate`, ~100× too large and breaking the USD-cents invariant. iOS
`Money.displayAmount` always divides by 100.

**Decision**: `formatMoney` always uses `cents/100*rate`; the currency's `fractionDigits` drives displayed
precision (JPY → 0 decimals, correct yen). Same divisor fix flows through the new `toDisplayAmount`.

**Lock**: `currency.json` includes JPY cases (R2).

## R6 — Recurring-subscription average rounding (FR-006)

**Finding**: web `insights.ts:217` `avg = Math.round(sum/len)`; iOS `InsightEngine.swift:312`
`avg = sum / Int64(count)` (integer division, truncates toward zero). Different `magnitude_cents`.

**Decision**: iOS canonical. Web → `Math.trunc(sum/len)` (== floor for the non-negative sums here, ==
iOS truncation toward zero). Regenerate `insights.json`; the recurring scenario's magnitude updates and
iOS already matches.

**Lock**: existing `insights.json` recurring scenario (already wired in both suites).

## R7 — Mortgage months-elapsed at day-29–31 boundary (FR-007)

**Finding**: web `mortgage.ts:62` decrements when `asOf.getDate() < closing.getDate()`. For closing
Jan 31, asOf Feb 28: web = 0 (28 < 31), iOS `Calendar.dateComponents([.month], from:to:)` = 1 (Jan 31 + 1
month clamps to Feb 28 ≤ Feb 28). iOS is **correct** (a month-end closing's monthiversary is the clamped
end-of-month); web undercounts, drifting balance/equity.

**Decision**: web conforms to the (correct) iOS Calendar semantics: clamp the closing day to the asOf
month's length before the comparison —
`effClosingDay = min(closing.day, daysInMonth(asOf.year, asOf.month)); if (asOf.day < effClosingDay) months -= 1`.
This reproduces `Calendar.dateComponents([.month])` exactly (verified by reasoning across boundary cases;
**empirically re-verify iOS output before locking expected values**).

**Lock**: new day-29–31 boundary cases in `mortgage.json` (closing Jan 31 viewed at Feb 27 / Feb 28 / Mar 1
/ Mar 31). Existing mortgage test asserts them on both suites.

## R8 — Outlier insight rule coverage (FR-008 / FR-014 residual)

**Finding**: Rule 6 (outlier) is implemented identically on both clients but no vector fires it (7/8 rules
covered). Web id `outlier-${tx.id}`; iOS id `outlier-<uuidString.lowercased()>`.

**Decision**: add a focused insight scenario whose transactions establish a category median over ≥5
trailing-6-month expenses + a current-month expense ≥2× that median, with **lowercase-UUID** tx ids so the
ids match across clients. Include enough income to keep the scenario's other fired rules deterministic.
Regenerate `insights.json`; the generated expected list will include the `outlier-…` insight → both suites
assert it → 8/8 coverage.

**Lock**: new scenario in `insights.json` (existing test, both suites).

## R9 — Desktop web capability (FR-009 / FR-010)

**Finding**: `DashboardDesktop.tsx` never renders `BudgetProgressCard`; `HousingDesktop.tsx` rental/lease
branch omits the `RenewalBanner` — both present on iOS and phone-web.

**Decision**: import and render the existing shared components in the desktop layouts in the same relative
position as the phone view; keep their self-hide behavior. Reuse, not reimplement (Principle I/II).

**Lock**: `desktop-parity.test.tsx` assertions (existing web component test) extended to require both.

## R10 — Sign-in copy + Node pin (FR-011 / FR-012)

**Finding**: web sign-in subtitle omits the code length (iOS states "8-digit"); `npm test` dies under the
shell default Node v20.14.0 with `ERR_REQUIRE_ESM` because `vite@8` (via `vitest@4`) requires
`node ^20.19.0 || >=22.12.0`.

**Decision**: web sign-in subtitle states the 8-digit length (copy only — sign-in is the one Next route
touched; per `web/AGENTS.md` this is a non-structural text change). Add `.nvmrc` (`22`) and
`package.json` `engines.node` `">=20.19.0 || >=22.12.0"` so the default/pinned runtime starts the suite.

**Lock**: FR-011 via quickstart visual check; FR-012 by running `npm test` under the pinned Node.
