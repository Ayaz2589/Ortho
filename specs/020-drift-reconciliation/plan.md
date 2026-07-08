# Implementation Plan: Drift Reconciliation

**Branch**: `020-drift-reconciliation` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-drift-reconciliation/spec.md`; authoritative line items in [`drift-inventory.md`](./drift-inventory.md).

## Summary

Reconcile all 41 verified drift items across the Ortho monorepo into a single source of truth: fix the two real defects (CLI `paid_by` omission; local OTP length mismatch), remove dead knobs, align every vector-blind iOS↔web parity divergence and **pin each with a golden vector so it cannot re-diverge**, add an explicit occupancy state (the one schema migration), harden the i18n catalog-parity lock, and refresh all stale comments/docs/counts plus the parity contract. The work is sequenced so web-verifiable code and docs land first, iOS-touching changes are batched into as few CI round-trips as possible, and the count/pointer refresh happens last so it reflects the final tree.

## Technical Context

**Language/Version**: TypeScript 5 (web/CLI, Next.js 16 / React 19, Node 22), Swift 5 / SwiftUI (iOS 26.2), SQL (Supabase/Postgres 17), JSON (golden vectors), Markdown/TOML (docs/config).

**Primary Dependencies**: Vitest 4 (web tests), XCTest (iOS, CI-only), `@supabase/supabase-js` + `supabase-swift`, `tsx` (CLI + `gen-vectors`), Tailwind v4.

**Storage**: One shared Supabase Postgres; money as integer USD cents. Schema in `supabase/migrations/`. This feature adds ONE migration (`units.occupied`).

**Testing**: web `cd web && npm test` (Vitest) + `npx tsc --noEmit` locally; iOS XCTest via `.github/workflows/ios-ci.yml` on push (no local Xcode on this Linux sandbox); golden vectors regenerated with `cd web && npm run gen:vectors` and asserted by both suites.

**Target Platform**: iOS 26.2 app, responsive web (compact/medium/expanded), terminal CLI — over one backend.

**Project Type**: Multi-surface monorepo (mobile-app + web-app + CLI + shared vectors + SQL schema + docs).

**Performance Goals**: N/A (correctness/consistency feature; no perf change). Pure functions stay O(n) as today.

**Constraints**: iOS validated only on CI; **zero unintended golden-vector drift** (`git diff shared/test-vectors/` shows only intended changes); new vector files need an iOS `project.pbxproj` Copy-Bundle-Resources + test-target entry (owner takes the file-system version in Xcode); new iOS strings must keep the catalog-parity lock green; occupancy migration must not change any existing displayed net; Constitution VI (test-first for money/date) is non-negotiable.

**Scale/Scope**: 41 drift items across 7 priority stories; ~2 code defects, ~10 parity alignments (+3 new vectors), 1 migration + toggle, 1 i18n reorg + lock, ~20 comment/doc/count edits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. One design system, tokens only | ✅ PASS | The only new UI (occupancy toggle) uses existing tokens/controls; no new palette entries, no hardcoded colors. |
| II. Calm over dense | ✅ PASS | Toggle is a single minimal control in the existing unit editor; no added density, no shadows on inset content. |
| III. Right form factor per canvas | ✅ PASS | Toggle is a native control in the iOS add/edit sheet and the web modal; no cross-canvas port of an inappropriate affordance. |
| IV. Plainspoken voice & money formatting | ✅ PASS | Copy "Occupied/Vacant" and "occupied unit rent"; the parity fixes make money formatting (U+2212, `+`, decimals, tabular) *more* consistent, not less. |
| V. Accessible & interaction-complete | ✅ PASS | Occupancy toggle is a real semantic control, keyboard-reachable, ≥44px touch target, sand focus ring. |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ PASS — central | Every money/date parity fix is test-first + golden-vector-locked; occupancy net stays vector-locked; the i18n lock is *hardened*; CLI `paid_by` gets a round-trip test. |
| Additional: stack / responsive / parity | ✅ PASS | No stack change; the four destinations preserved; desktop remains additive; iOS stays canonical. |

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/020-drift-reconciliation/
├── plan.md                 # This file
├── spec.md                 # Feature spec (7 prioritized stories, 28 FRs, 8 SCs)
├── drift-inventory.md      # Authoritative 41-item line list (surface/file:line/fix/severity)
├── research.md             # Phase 0: decisions (canonical direction, migration, vector strategy)
├── data-model.md           # Phase 1: units.occupied + new vector shapes + catalog invariant
├── quickstart.md           # Phase 1: how to validate each story
├── contracts/              # Phase 1: golden-vectors, occupancy-migration, cli-and-config, i18n-lock
└── tasks.md                # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root) — files this feature touches, by priority

```text
# P1 — real defects
web/scripts/import/db/persist.ts        # txRecord: add paid_by  (+ createOne/updateOne paths)
web/scripts/import/tx.ts                 # ensure paid_by flows to txRecord
supabase/config.toml                     # otp_length 6 → 8  (+ verify otp_expiry/session)
PARITY.md                                # CLI paid_by row corrected
web/test/import/persist.test.ts (or new) # paid_by round-trip test

# P2 — dead knobs / config truth-up
Makefile                                 # drop --scope forward
web/scripts/import/db/client.ts          # remove asUserId field + branch
supabase/config.toml + supabase/seed.sql # honest [db.seed] (add seed.sql or disable)
web/scripts/import/README.md, docs/makefile.md  # drop SCOPE docs

# P3 — parity + NEW golden vectors  (web edits local; Swift edits CI-only)
web/lib/finance/currency.ts, money.ts, insights.ts     # names/symbols/decimals/sign/plus/guard
web/lib/splits.ts                                        # sharePercent rounding
web/lib/transactionFilters.ts                            # monthBounds/query-trim/source-sort
web/components/housing/lease.ts                          # (already clamps — iOS is the fix)
iOS .../Models/Currency.swift, DesignSystem/Money.swift, Services/InsightEngine.swift,
     Features/Transactions/TransactionSplits.swift, TransactionFilters.swift, Models/LeaseInfo.swift
web/scripts/gen-vectors.ts                               # emit currency-names/-symbols/lease + filter cases
shared/test-vectors/{currency-names,currency-symbols,lease}.json   # NEW
shared/test-vectors/transaction-filters.json             # intentional new cases
web/test/*.parity.test.ts (new: currency-names, currency-symbols, lease) + iOS *ParityTests.swift
iOS Ortho-iOS.xcodeproj/project.pbxproj                  # wire 3 new vectors + 3 test files

# P4 — occupancy (the only migration)
supabase/migrations/<new>_unit_occupied.sql              # add units.occupied + backfill
web/lib/types.ts, web/lib/finance/housing.ts (rentUnitsFrom), components/housing/AddPropertyModal.tsx
iOS .../Models/Unit.swift, Features/Housing/AddPropertySheet.swift
iOS Localizable.xcstrings + web/lib/i18n/*.ts             # "occupied unit rent" + Occupied/Vacant

# P5 — i18n reorg + lock
web/lib/i18n/{bn,es,ja,zh,ko}.ts         # move ~34 shared keys above marker; fix es
web/test/i18n/catalog-parity.test.ts     # assert below-marker block disjoint from xcstrings

# P6 — obsolete comments
iOS .../Services/TransactionsAPI.swift, iOS/Tasks.md, iOS/ARCHITECTURE.md

# P7 — docs / counts / PARITY (last, so counts are final)
docs/index.md, docs/makefile.md, docs/ios.md, docs/web.md, docs/shared.md,
shared/test-vectors/README.md, web/scripts/import/README.md, PARITY.md,
specs/019-housing-parity-fixes/tasks.md
```

**Structure Decision**: No new top-level structure — this feature edits existing surfaces in place. The only additive files are the migration, three new golden vectors (+ their two-per-language parity tests), and an optional `supabase/seed.sql`. Work is grouped by the seven priority stories; within a story, web/CLI/doc edits are locally verifiable and Swift edits are batched for CI.

## Implementation Strategy & Sequencing

To minimize iOS CI round-trips (each is ~15 min) while keeping every checkpoint green:

1. **P1 + P2 (web/CLI/config, local)** — highest value, fully local-verifiable. `paid_by`, OTP config, dead-knob removal. No iOS.
2. **P3 web side + vector generation (local)** — align the TS engines test-first, add the three new vectors + filter cases, `npm run gen:vectors`, confirm intended-only diff, web parity suites green.
3. **P4 migration + web occupancy (local)** — migration, `rentUnitsFrom` reads the column, web toggle + copy; housing-net-rental.json stays byte-identical (mapping-only change).
4. **P5 i18n reorg + lock (local)** — catalogs + hardened test; fold in the "occupied unit rent" web copy from P4.
5. **Single iOS batch (CI)** — all Swift mirrors (P3 parity, P4 Unit.occupied + toggle + xcstrings, P6 comments) + the pbxproj wiring for the 3 new vectors, pushed once; watch `ios-ci.yml`; inspect simulator screenshots. A second push only if CI surfaces a vector-bundle miss.
6. **P6 remaining prose + P7 docs/counts/PARITY (local, last)** — reconfirm every count against the final tree; reconcile PARITY.md; check off 019 T026/T027.

## Complexity Tracking

*No constitutional violations — section intentionally empty.*
