# Tasks: Housing Dashboard Widgets

**Input**: Design documents from `specs/036-housing-widgets/`

**Prerequisites**: plan.md, spec.md, data-model.md, quickstart.md

**Tests**: REQUIRED — Principle VI. Every behavior task writes a failing test first.

**Working dir**: all paths under `web/`.

## Format: `[ID] [P?] [Story] Description`
- **[P]** = parallelizable (different files).
- **[Story]** = US1 (housing costs), US2 (home equity).

---

## Phase 1: Housing costs widget (US1) 🎯 MVP

- [x] T001 [US1] Write FAILING `web/test/widgets/housing-costs.test.tsx`: mock `@/lib/store` with
  `properties`, `formatMoney`, `t`. Assert (a) headline monthly cost + "per month"; (b) property
  count pluralization ("1 property" / "{0} properties"); (c) net-rental row present only for a
  multifamily household and formatted with a leading sign; (d) calm empty state "No properties yet."
  when `properties` is empty; (e) body fills its cell (`h-full`).
- [x] T002 [US1] Implement `web/components/widgets/bodies/HousingCostsBody.tsx` (propless; reads
  `useApp()`; derives via `housingSummary(properties)`; token-only; loss never red) until T001 passes.

---

## Phase 2: Home equity widget (US2)

- [x] T003 [US2] Write FAILING `web/test/widgets/home-equity.test.tsx`: mock `@/lib/store`. Assert
  (a) headline principal paid down + "principal paid down"; (b) progress caption "{0}% paid off" with
  the correct rounded percent and the original-loan total; (c) a paid-off mortgage reads 100%;
  (d) calm empty state "No mortgages yet." when no property has a mortgage; (e) body fills `h-full`.
- [x] T004 [US2] Implement `web/components/widgets/bodies/HomeEquityBody.tsx` (propless; reads
  `useApp()`; `equity` from `housingSummary`, denominator summed locally from `properties`; progress
  bar uses `--positive`, clamped 0–1) until T003 passes.

---

## Phase 3: Registry + i18n + verify

- [x] T005 Edit `web/lib/widgets/registry.tsx`: import both bodies and add two `WIDGETS` entries
  (`housing-costs`, `home-equity`), both `defaultEnabled: false`. Registry + extensibility tests stay
  green.
- [x] T006 [P] Add the 13 new strings to `web/lib/i18n/{es,bn,ja,ko,zh}.ts` (see data-model.md).
- [x] T007 Run `npm test` and `npx tsc --noEmit` in `web/`; fix to green. Verify SC-001..SC-005.

---

## Dependencies

- T001 → T002; T003 → T004 (test before impl each).
- T005 depends on T002 + T004 (bodies must exist to import).
- T006 is independent ([P]); T007 last.
