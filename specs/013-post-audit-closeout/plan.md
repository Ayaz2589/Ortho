# Implementation Plan: Post-Audit Closeout

**Branch**: `013-post-audit-closeout` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-post-audit-closeout/spec.md`

## Summary

Close every item left pending after the 2026-07-02 parity audit: finish iOS translations for the
87 unlocalized catalog keys (bn/es/ja/zh-Hans/ko) and lock cross-catalog identity with a new
Vitest suite; QA the machine-authored web-only translations; extend the `dashboard-month-scope`
golden vector to pin `availableRanges`; align web's recurring-insight preview and outlier-date
locale to iOS (vectoring `preview_merchants`); align the CLI to the shared filtering brain, add
write compensation, shared split tolerance, and a derived category list; ship a dry-run-first
repair script for legacy 00:00–04:00Z transaction timestamps; and add a preflight-gated
TestFlight deploy workflow plus owner setup doc. All behavior lands test-first; all iOS
verification runs through GitHub Actions (build + XCTest parity suites + `-uiDemo` simulator
screenshots, now per-language), batched into minimal pushes on a draft PR.

## Technical Context

**Language/Version**: TypeScript 5 / Node 22 (web, CLI, scripts); Swift 5.9 / SwiftUI (iOS);
YAML (GitHub Actions); JSON (.xcstrings string catalog, golden vectors)

**Primary Dependencies**: Next.js 16 + React 19, supabase-js, Vitest 3 (web); Xcode 26 +
XCTest (iOS, CI-only); `tsx` for scripts; no new dependencies introduced

**Storage**: Hosted Supabase Postgres `brujhxmtzfgowimprueo` (live shared data —
`transactions.date timestamptz` is the repair target); `shared/test-vectors/*.json` golden
vectors; `iOS/Ortho-iOS/Localizable.xcstrings` + `web/lib/i18n/*.ts` string catalogs

**Testing**: Vitest (`cd web && npm test`, 619 green at start) on-sandbox; XCTest parity suites
via `.github/workflows/ios-ci.yml` on macOS runner (Linux sandbox cannot build iOS); TZ=UTC
pinned harness (`gen-vectors.ts:34`, `vitest.config.ts:8`, UTC calendars in iOS tests)

**Target Platform**: iOS 26 (app), modern browsers (web), Node 22 terminal (CLI/scripts),
GitHub-hosted macOS runner (CI/deploy)

**Project Type**: Monorepo: mobile app + web app + CLI over one backend, parity-locked by
golden vectors

**Performance Goals**: N/A beyond existing budgets; deploy preflight must fail in < 60 s
(SC-007); CI cycle stays in the 5–15 min envelope, so Swift changes are batched per R9

**Constraints**: Linux sandbox — no Xcode; iOS verification only via CI (draft PR needed:
ios-ci.yml runs PRs on any branch, pushes only on main). Live shared backend — repair script is
dry-run by default, `APPLY=1` gated on operator approval. Public repo — no secret values in any
committed file; deploy job gated off fork events. Service-role key not present on this machine —
repair runs via operator OTP session by default.

**Scale/Scope**: 87 catalog keys × 5 languages + ~100 web-only keys × 5 languages reviewed;
~10 vector cases added; 4 CLI modules touched; 1 maintenance script; 2 workflow files; affected
DB rows expected O(10–100)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. One Design System, Tokens Only | ✅ PASS | No new UI surfaces; translation values and insight strings only. No colors/typography touched. |
| II. Calm Over Dense | ✅ PASS | No layout changes. CLI truncation notice is plain text, non-alarmist. |
| III. Right Form Factor Per Canvas | ✅ PASS | No navigation/layout work. |
| IV. Plainspoken Voice & Money Formatting | ✅ PASS | Translations must preserve plainspoken tone and money formatting rules (Latin digits under বাংলা on both surfaces — explicitly in scope, FR-003). |
| V. Accessible & Interaction-Complete | ✅ PASS | No interactive elements added; translated strings must not break existing labels (visual QA pass covers it). |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ PASS | The feature's core is *adding* locks: new catalog-parity suite, extended golden vector, CLI tests preceding each alignment, pure-function tests for the repair script. Every behavior change lands red-test-first (see tasks Phase ordering). Date logic (repair inference) ships with DST/boundary coverage per the constitution's "money math and date logic never ship without coverage". |
| Workflow: spec-driven + one-command suite | ✅ PASS | This flow; `npm test` remains the single web gate; iOS gate is the CI workflow. |

**Post-design re-check (after Phase 1)**: still PASS — no deviations introduced by the design;
Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-post-audit-closeout/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — 9 resolved decisions (R1–R9)
├── data-model.md        # Phase 1 — entities: catalog entries, legacy rows, vector cases, secrets
├── quickstart.md        # Phase 1 — per-story validation runbook
├── contracts/
│   ├── catalog-parity.md        # Cross-catalog identity contract + test surface
│   ├── available-ranges-vector.md # New vector section schema
│   ├── insights-preview.md      # preview_merchants vector field + ordering rules
│   ├── cli-alignment.md         # tx list / persist / split behavioral contract
│   ├── repair-legacy-dates.md   # Maintenance script CLI contract
│   └── ios-deploy-workflow.md   # Deploy workflow + secrets contract
├── checklists/requirements.md   # Spec quality gate (passed)
└── tasks.md             # Phase 2 (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── i18n/{bn,es,ja,ko,zh}.ts      # US6 terminology fixes (values only)
│   ├── finance/insights.ts           # US3: preview ordering/casing, locale-threaded outlier date
│   ├── transactionFilters.ts         # US5: consumed by CLI (unchanged semantics)
│   ├── splits.ts                     # US5: consumed by CLI (unchanged)
│   └── types.ts                      # US5: exported CATEGORY_LIST const, type derived from it
├── components/dashboard/range.ts     # US4: availableRanges (source of vector truth, unchanged logic)
├── scripts/
│   ├── gen-vectors.ts                # US3/US4: preview_merchants field + availableRanges cases
│   ├── import/
│   │   ├── db/transactions.ts        # US5: household-wide fetch + shared-filter delegation
│   │   ├── db/persist.ts             # US5: compensating write
│   │   ├── db/lookups.ts             # US5: household resolution reuse
│   │   ├── engine/filters.ts         # US5: derive CATEGORY_LIST, criteria mapping
│   │   ├── engine/split.ts           # US5: delegate to shared validateSplit
│   │   └── tx.ts / cli.ts            # US5: flag surface (multi-select, query, owner, limit notice)
│   └── maintenance/repair-legacy-dates.ts  # US2: NEW — audit/repair script
├── test/
│   ├── i18n/catalog-parity.test.ts   # US1/US6: NEW — cross-catalog lock (reads .xcstrings)
│   ├── insights.parity.test.ts       # US3: preview_merchants assertions
│   ├── dashboard-range.parity.test.ts# US4: availableRanges vector assertions (or extend existing)
│   ├── import/*.test.ts              # US5: red-first tests per alignment
│   └── maintenance/repair-legacy-dates.test.ts # US2: NEW — pure-function + mocked-IO tests
iOS/Ortho-iOS/
├── Localizable.xcstrings             # US1: 87 keys × 5 languages + shouldTranslate:false symbols
├── Ortho_iOSApp.swift (+ AppLanguage.swift) # US1: -uiDemoLanguage DEBUG launch argument
├── App/DashboardRange.swift          # US4: extracted availableRanges(transactions:now:)
├── App/AppState.swift                # US4: property delegates to DashboardRange
└── Services/InsightEngine.swift      # US3: deterministic tie-break mirroring web
iOS/Ortho-iOSTests/
├── DashboardScopeParityTests.swift   # US4: availableRanges vector assertions
└── InsightParityTests.swift          # US3: preview_merchants assertions
shared/test-vectors/
├── dashboard-month-scope.json        # US4: regenerated with availableRanges section
└── insights.json                     # US3: regenerated with preview_merchants
.github/workflows/
├── ios-ci.yml                        # US1: per-language screenshot matrix
└── ios-deploy.yml                    # US7: NEW — preflight + TestFlight upload
docs/deploy.md                        # US7: NEW — owner credential setup (no secret values)
Makefile                              # US2: repair-dates target
PARITY.md                             # FR-014/FR-020: --admin by-design note, gap reconciliation
```

**Structure Decision**: No new top-level directories; one new `web/scripts/maintenance/` folder
for operator tooling (parallel to `scripts/import/`), keeping the import CLI's client/env
conventions reusable. Vector additions extend existing files (zero pbxproj churn — R5).

## Verification topology (binding for tasks.md ordering)

1. **On-sandbox first** (Vitest, red → green): catalog-parity suite, insights changes +
   regenerated vectors, availableRanges generator + web assertions, all CLI alignments, repair
   script pure functions. `cd web && npm test` after each story.
2. **One batched iOS push** on the draft PR: xcstrings + `-uiDemoLanguage` + DashboardRange
   extraction + InsightEngine tie-break + both parity-test additions + ios-ci.yml matrix. Then
   `GH_TOKEN=placeholder gh run watch --exit-status`; screenshots via
   `gh api repos/Ayaz2589/Ortho/actions/artifacts/<id>/zip`. Fix-up pushes only on failure.
3. **Deploy workflow push** (independent of Swift batch): actionlint + live preflight-failure run.
4. **Live repair last**: `make repair-dates` (dry run) → user reviews report → `APPLY=1` only on
   their explicit go-ahead (spec FR-005; never auto-run).

## Complexity Tracking

> No constitution violations — table intentionally empty.
