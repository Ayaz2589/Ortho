# Implementation Plan: Cross-Platform Parity Remediation, Part 2

**Branch**: `009-parity-remediation-2` (working on `main`) | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-parity-remediation-2/spec.md`

## Summary

Close the ten verified web↔iOS divergences the post-008 re-audit found (`specs/008-parity-remediation/parity-reaudit.md`).
Grouped by user story: (US1) the silent money-correctness trio — canonical owner ordering for the
leftover cent, identical currency-conversion rounding, and an atomic transaction+shares write;
(US2) web money formatting that honors the selected locale and renders zero-decimal currencies at the
right magnitude; (US3) three pure-logic reconciliations — recurring-subscription average rounding,
mortgage months-elapsed at the day-29–31 boundary, and the outlier insight rule — each locked by a new
shared golden vector; (US4) restore the Budget Progress widget and lease-renewal banner to the
≥1024px web layouts; (US5) the web sign-in "8-digit" copy and a Node engines pin so `npm test` starts
on the default runtime. Approach: iOS is canonical and web conforms, **except** where iOS is
demonstrably wrong (mortgage months-elapsed undercount on web — both move to the correct, Calendar-style
count). Every pure-logic / data-representation change is mirrored in TS + Swift and locked by a
**shared golden vector asserted by both suites** (Constitution Principle VI). No schema changes.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Next.js 16 App Router (web); Swift 5.9 / SwiftUI, iOS 17+ (iOS)

**Primary Dependencies**: web — Next App Router, Tailwind v4, `@supabase/ssr` + supabase-js, Vitest 4;
iOS — supabase-swift, Observation (`@Observable AppState`), XCTest

**Storage**: Supabase Postgres, USD cents. Tables `transactions`, `transaction_shares`
(person_id + amount_cents) already exist. **No migrations / no schema change** — the atomic-write fix
is client-side (rollback on partial failure), not a new column or table.

**Testing**: web — Vitest (`npm test`); iOS — XCTest parity target (wired in 008, enforced). Both assert
the SAME `shared/test-vectors/*.json`. This feature adds a new `currency.json` vector + a
`CurrencyParityTests.swift` (one xcodeproj test-target edit) and extends the existing
`transaction-splits.json`, `mortgage.json`, and `insights.json` (no new wiring for those).

**Target Platform**: iOS app (phone-first) + web (compact/medium/expanded breakpoints 0–639 / 640–1023 / 1024+)

**Project Type**: Mobile app + web app sharing a Supabase backend and a shared golden-vector contract

**Performance Goals**: None new — reconciliation only.

**Constraints**: Constitution Principle VI (test-first; money/date golden-vector-locked; deterministic,
no network in tests); design tokens only; no schema change; preserve the four destinations and the
phone/iOS information density (desktop reuses shared components, no new density). `web/AGENTS.md`: this
Next.js has breaking changes — consult `node_modules/next/dist/docs/` before any route/Next-API edit
(the only route touched is `app/sign-in`, a copy-only change).

**Scale/Scope**: 2 clients, 5 user stories, 14 FRs, ~10 distinct fixes. Touches: web
`lib/finance/money.ts`, `lib/splits.ts`, `lib/format.ts`, `lib/finance/insights.ts`,
`lib/finance/mortgage.ts`, `lib/store.tsx`, `components/web/{DashboardDesktop,HousingDesktop}.tsx`,
`components/web/TxForm.tsx`, `app/sign-in/page.tsx`, `scripts/gen-vectors.ts`, `package.json`, `.nvmrc`,
new `test/currency.parity.test.ts`; iOS `Features/Transactions/{TransactionSplits,AddTransactionSheet}.swift`,
`Models/Transaction.swift`, `Services/InsightEngine.swift`, `Models/MortgageInfo.swift`, new
`Ortho-iOSTests/CurrencyParityTests.swift`, the xcodeproj test target; and `shared/test-vectors/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ PASS | Desktop restores reuse the existing `BudgetProgressCard` / `RenewalBanner` shared components; no new palette, no new tokens. |
| II. Calm Over Dense | ✅ PASS | Desktop gains the same widgets the phone shows (parity), not added density; self-hiding behavior preserved. |
| III. Right Form Factor Per Canvas | ✅ PASS | iOS unchanged in form; web desktop reuses shared bodies in its existing grid/drawer. |
| IV. Plainspoken Voice & Money Formatting | ✅ PASS | Money stays cents→render and tabular; locale formatting makes money read correctly per language; sign-in copy states the true length. |
| V. Accessible & Interaction-Complete | ✅ PASS | No new interactive surfaces beyond restored existing components. |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ PASS (reinforced) | Every reconciled pure function ships a shared golden vector asserted by **both** suites; new vectors: owner-ordering, currency conversion (×7), recurring-avg rounding, mortgage day-29–31 boundary, outlier rule (→ 8/8 coverage). A deliberate divergence must fail both suites (FR-013). Deterministic, injected reference dates, no network. |

**Result**: No violations. The feature *strengthens* Principle VI (adds currency-conversion and
owner-ordering coverage that did not exist). No Complexity Tracking entries required beyond the
one xcodeproj edit (below).

## Project Structure

### Documentation (this feature)

```text
specs/009-parity-remediation-2/
├── plan.md              # This file
├── research.md          # Phase 0 — canonical decision per divergence (R1–R10)
├── data-model.md        # Phase 1 — entities, representations, the new vector shapes
├── quickstart.md        # Phase 1 — how to validate each story
├── contracts/
│   └── parity-contracts-2.md   # Cross-client behavioral + golden-vector contracts (C1–C6)
├── checklists/requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
web/
├── lib/finance/money.ts            # US1/US2: locale param + zero-fraction fix + toDisplayAmount; half-away rounding
├── lib/splits.ts                   # US1: orderedOwnerIds canonical-sort helper
├── lib/format.ts                   # US1: effectiveShares fallback uses orderedOwnerIds
├── lib/finance/insights.ts         # US3: recurring avg Math.round → Math.trunc (match iOS Int64 div)
├── lib/finance/mortgage.ts         # US3: monthsElapsed clamp closing-day to asOf month length
├── lib/store.tsx                   # US1: atomic writeShares (rollback); US2: formatMoney passes locale
├── components/web/DashboardDesktop.tsx  # US4: render BudgetProgressCard
├── components/web/HousingDesktop.tsx    # US4: render lease RenewalBanner
├── components/web/TxForm.tsx       # US1: canonical owner order when computing shares
├── app/sign-in/page.tsx            # US5: "8-digit code" copy
├── scripts/gen-vectors.ts          # all stories: owner-ordering + currency + recurring + mortgage-boundary + outlier vectors
├── package.json + ../.nvmrc        # US5: engines pin / .nvmrc
└── test/currency.parity.test.ts    # US1/US2: assert currency.json (new)

iOS/Ortho-iOS/
├── Features/Transactions/TransactionSplits.swift   # US1: orderedOwnerIds; (currency conv lives in Money.swift)
├── Features/Transactions/AddTransactionSheet.swift  # US1: canonical owner order on submit
├── Models/Transaction.swift                          # US1: route effectiveShares through orderedOwnerIds
├── DesignSystem/Money.swift                          # US1/US2: conversion already canonical — assert via vector
├── Services/InsightEngine.swift                      # US3: confirm recurring trunc + outlier already match
├── Models/MortgageInfo.swift                         # US3: confirm Calendar months-elapsed is canonical
└── Ortho-iOSTests/CurrencyParityTests.swift          # US1/US2: assert currency.json (new)

iOS/Ortho-iOS.xcodeproj      # US1/US2: add CurrencyParityTests.swift to test target + currency.json to Copy Bundle Resources
shared/test-vectors/         # transaction-splits.json (+ownerOrdering), mortgage.json (+boundary),
                             # insights.json (recurring/outlier), currency.json (new) — all regenerated
```

**Structure Decision**: Existing mobile-app + web-app monorepo with a shared golden-vector contract.
No new top-level structure. The only structural addition is one new vector file + one iOS test file
wired into the existing XCTest target.

## Implementation Approach by User Story

Detailed decisions in `research.md`; data shapes + vector schemas in `data-model.md`; contracts in
`contracts/parity-contracts-2.md`.

**US1 — Silent money-correctness (P1)**
- *Owner ordering*: add a pure `orderedOwnerIds(ids) = ids.sorted ascending` to both clients (web
  `splits.ts`, iOS `TransactionSplits.swift`). iOS already sorts by `uuidString`; web currently keeps
  array order. Route the even/percent share computation and the `effectiveShares` even-fallback through
  it on both clients so the leftover cent always lands on the same owner. Lock with an `ownerOrdering`
  vector section (scrambled-input owner lists) in `transaction-splits.json`.
- *Currency conversion*: iOS `Money.toUSDCents` / `toDisplayAmount` (Decimal, round-half-away-from-zero)
  is canonical. Add a web `toDisplayAmount(cents, currency, rate)` mirroring it; web `toUSDCents` already
  matches numerically (the divisor cancels). Lock with a new `currency.json` vector across all 7
  currencies (both conversion directions) asserted by both suites.
- *Atomic write*: web `writeShares` currently fires after the parent insert with no error capture. Make it
  return success; on a shares-insert failure, roll back the parent (delete it + restore optimistic state +
  surface the error) so no share-less "creator-owns-all" parent survives — matching iOS's all-or-nothing
  behavior. Verified by a store unit test that forces the shares insert to fail.

**US2 — Web money locale + zero-decimal magnitude (P2)**
- Thread a `locale` parameter into `money.ts` `formatMoney`/`toDisplayAmount` (default `en-US`); the store
  wrapper passes its existing `locale` state. Fix the zero-fraction bug: `formatMoney` must always divide
  cents by 100 (drop the `fractionDigits===0 ? 1 : 100` divisor); the currency's fraction digits already
  drive the displayed precision, so JPY shows correct yen. Locale parity is a runtime/visual contract (not
  vectored — `Intl` vs `NumberFormatter` strings can't match byte-for-byte); the cents math is vectored.

**US3 — Insight + mortgage reconciliations (P2, vector-first)**
- *Recurring average*: web `insights.ts:217` `Math.round` → `Math.trunc` to match iOS `Int64` integer
  division (truncate toward zero). Regenerate `insights.json`.
- *Mortgage months-elapsed*: web undercounts for closings on days 29–31 (its `asOf.getDate() < closing.getDate()`
  check). Clamp the closing day to the asOf month's length before the decrement so web matches iOS's
  `Calendar.dateComponents([.month])`. Add day-29–31 boundary cases to `mortgage.json`. Verify iOS's actual
  Calendar output empirically before committing the expected values.
- *Outlier rule*: add a focused insight scenario (lowercase-UUID tx ids so `outlier-<id>` matches iOS's
  `uuidString.lowercased()`) that fires Rule 6; regenerate `insights.json`; both suites assert it → 8/8 rules covered.

**US4 — Desktop web capability (P3)**
- `DashboardDesktop.tsx`: render the shared `BudgetProgressCard` in the grid (same self-hide-when-no-budgets
  behavior as phone). `HousingDesktop.tsx`: render the shared lease `RenewalBanner` in the rental/lease branch.

**US5 — Sign-in copy + Node pin (P3)**
- `app/sign-in/page.tsx`: subtitle states the 8-digit code length (copy only). Add `.nvmrc` and
  `package.json` `engines.node` `">=20.19.0 || >=22.12.0"` so the default Node loads vitest's vite@8 ESM
  entry without `ERR_REQUIRE_ESM`.

## Complexity Tracking

> No Constitution violations.

The one non-trivial mechanical step is adding `CurrencyParityTests.swift` + `currency.json` to the
`Ortho-iOSTests` target in `Ortho-iOS.xcodeproj` (the test target uses explicit file references, not a
synchronized group). Mitigation: edit the pbxproj deterministically with the `xcodeproj` Ruby gem
(installed in 008), round-trip-verify before/after, and confirm a green `xcodebuild test` that includes
the new `testCurrencyConversionParity`. All other new/changed vectors reuse already-wired test files.
