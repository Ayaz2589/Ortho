# Tasks: Financial Health (spec 041)

**Feature dir**: `specs/041-financial-health/` · **Branch**: `feat/041-financial-health`
**Plan**: [plan.md](./plan.md) · **Contract**: [contracts/health-scoring.md](./contracts/health-scoring.md)
**Design**: [`docs/plan/financial-health.md`](../../docs/plan/financial-health.md)

Strict TDD (Constitution VI): every code task is preceded by its failing test. `[P]` = parallelizable
(different files, no incomplete deps). All paths are under `web/` unless noted. After each phase:
`npx tsc --noEmit` (UNPIPED) clean + `npm test` green.

---

## Phase 1: Setup

- [x] T001 Confirm branch `feat/041-financial-health` off synced `main`; confirm spec artifacts present (plan/research/data-model/contracts/quickstart).
- [x] T002 [P] Add feature stub files so imports resolve during TDD: empty `web/lib/finance/financial-health-thresholds.ts` and `web/lib/finance/financialHealth.ts` exporting the types from `contracts/health-scoring.md` (no logic yet).

## Phase 2: Foundational (blocking prerequisites — DB + types + store)

- [x] T003 Write the migration `supabase/migrations/<TS>_financial_health_profile.sql` (TS > `20260730120000`): 4 user-scoped tables (`user_financial_profile`, `user_fixed_costs`, `user_dimension_weights`, `financial_health_snapshots`) with CHECK-constraint enums, indexes, and the 4-policy RLS block per [data-model.md](./data-model.md). *(FR-013)*
- [x] T004 [P] Add domain types to `web/lib/types.ts`: `HousingType`, `EmergencyFundLevel`, `FixedCostKind`, `HealthDimension`, `HealthBand`, `FinancialProfile`, `FixedCost`, `DimensionWeight`, `HealthSnapshot`.
- [x] T005 [P] Add `*Row` types to `web/lib/supabase/rows.ts`: `UserFinancialProfileRow`, `UserFixedCostRow`, `UserDimensionWeightRow`, `FinancialHealthSnapshotRow` (column-for-column).
- [x] T006 Write failing store test `web/test/financial-health-store.test.tsx` (jsdom): (a) `loadAll` fail-open when the 4 tables return PGRST205/42P01 (profile → null, others → []); (b) `saveFinancialHealth` writes profile+costs+weights+snapshot in sequence; (c) `writeHealthSnapshot` appends. Uses `makeSupabaseMock`. *(FR-008, FR-009, FR-015)*
- [x] T007 Implement store additions in `web/lib/store.tsx`: 4 state hooks; 4 `ownerId`-scoped reads appended to `loadAll`'s `Promise.all`, all joined to the fail-open group (profile `.maybeSingle()` → null); actions `saveFinancialProfile`, `saveFixedCosts` (delete-then-insert), `saveDimensionWeights` (batch upsert), `writeHealthSnapshot`, `saveFinancialHealth` orchestrator; expose all in `AppStateValue`. Make T006 pass. *(FR-013, FR-015)*

**Checkpoint**: store loads the 4 collections (or empty), tsc clean, T006 green.

## Phase 3: User Story 1 — Day-one score (Priority P1) 🎯 MVP

**Goal**: A profile-less user completes the questionnaire and sees a calm score + band + next step
from questionnaire data alone. **Independent test**: quickstart §1 + §2 + §3.

### Engine (test-first — critical path)

- [x] T008 [US1] Write failing engine tests `web/test/financial-health.test.ts` (node) from [contracts/health-scoring.md](./contracts/health-scoring.md): `deriveProfile` (variable→low estimate, committed/net/target math); each dimension's thresholds + supportive floors; profile-null neutral mode; band boundaries (39/40/59/60/79/80); personalized-weight composite (incl. all-3 default = mean); `topAction` selection (lowest weighted contribution). Independently-derived expected values. *(FR-002…FR-006, US1)*
- [x] T009 [US1] Write failing property tests in the same file: score & each dimension ∈ [0,100] for adversarial inputs (income 0/negative, empty txns, missing weights); band monotonic; variable-income low-estimate monotonicity; weight monotonicity; no NaN/Infinity. *(invariants §Invariants)*
- [x] T010 [US1] Fill `financial-health-thresholds.ts` with the named constants from the contract (bands, `CASHFLOW_*`, `EMERGENCY_BASE`, `SAFETY_GOAL_BONUS`, `COMMIT_*`, `SAVINGS_INTENT_KNOTS`, `PLAN_*`, `DEFAULT_WEIGHT`, `NEUTRAL`).
- [x] T011 [US1] Implement `financialHealth.ts`: `deriveProfile()`, `monthSpendCents()`, the 5 dimension scorers (reusing `budgetStatusForMonth`, `goalPacing`/`goalProgress`, `savingsRate`), `bandForScore()`, composite, `topAction`, `scoreFinancialHealth()`. Use `roundHalfAwayFromZero` on money, `Math.round`+clamp on scores. Make T008/T009 pass. *(FR-003…FR-007)*

### Onboarding flow (test-first)

- [x] T012 [P] [US1] Write failing onboarding test `web/test/financial-health-onboarding.test.tsx` (jsdom): stepper renders 5 sections; required Income blocks advance; completing writes profile+costs+weights+first snapshot; "Skip — use neutral defaults" writes defaults + snapshot + dismissal and lands on dashboard. *(FR-001, FR-012, US1)*
- [x] T013 [P] [US1] Build shared questionnaire section components under `web/components/financial-health/` (`IncomeSection`, `HousingSection`, `CommitmentsSection` with first-class `remittance` kind, `SafetyNetSection`, `WeightsSection`) using `FormGroup`/`FieldRow`/`TextInput`/sliders; and `useFinancialProfileForm.ts` (draft state + `saveFinancialHealth`). *(FR-001, FR-004)*
- [x] T014 [US1] Build the first-run route `web/app/(app)/welcome/financial-profile/page.tsx`: slim stepper (progress dots, no board chrome), Skip-to-defaults, completion → dashboard. Make T012 pass. *(FR-001, FR-012)*
- [x] T015 [US1] Gate the flow in the shell (`web/app/(app)/layout.tsx` or a small guard): route a profile-less, non-dismissed user to the flow after bootstrap; `ortho.fhOnboardingDismissed` localStorage suppresses re-prompt. Add a `RouteSkeleton` case for the route. *(FR-012)*

### Widget scored state (test-first)

- [x] T016 [P] [US1] Write failing widget test `web/test/financial-health-widget.test.tsx` (jsdom): scored state shows score + band label + one action; profile-null shows the "Set up your profile" CTA; **never-red guard** (no destructive token / red class on the score/band). *(FR-004, FR-005, FR-011, SC-003)*
- [x] T017 [US1] Implement `web/components/widgets/bodies/FinancialHealthBody.tsx` (propless; `useApp()` + `useMemo(scoreFinancialHealth)`), and register `'financial-health'` in `web/lib/widgets/registry.tsx` (title/description/defaultEnabled/Body). Sand ramp only. Make T016 pass. *(FR-011)*

**Checkpoint (MVP)**: new user → questionnaire → dashboard widget shows a calm score. US1 acceptance
scenarios pass; SC-001/002/003/004 demonstrable.

## Phase 4: User Story 2 — Progress over time (Priority P2)

**Goal**: score updates live and the widget shows baseline→now movement. **Independent test**:
quickstart §4.

- [x] T018 [US2] Extend `web/test/financial-health-widget.test.tsx`: with ≥2 snapshots the widget shows the first-vs-latest band/score movement; live score reflects added budget/goal without re-take. *(FR-008, FR-009, US2)*
- [x] T019 [US2] Implement the baseline-delta view in `FinancialHealthBody.tsx` (read earliest+latest `healthSnapshots`, render movement copy); confirm the `useMemo` recomputes from live `transactions/budgets/goals`. Make T018 pass. *(FR-008, FR-009)*

**Checkpoint**: adding data raises the score without a re-take; movement shown.

## Phase 5: User Story 3 — Edit from Settings (Priority P3)

**Goal**: re-take/edit the profile from Settings; re-score + new snapshot. **Independent test**:
quickstart §5 + §6.

- [x] T020 [US3] Write failing settings test `web/test/financial-health-settings.test.tsx` (jsdom): single-scroll form pre-filled from the stored profile; save persists answers, writes a new snapshot, and adjusting a weight slider changes the composite. *(FR-010, SC-006, SC-007, US3)*
- [x] T021 [US3] Build `web/app/(app)/settings/financial-profile/page.tsx` (reuses the `web/components/financial-health/` sections as one scrollable form via `useFinancialProfileForm`); `ReadingColumn`+`PageHeader`; save → snapshot → back to `/settings`. Make T020 pass. *(FR-010)*
- [x] T022 [P] [US3] Add the settings entry: `LinkRow` in `web/app/(app)/settings/page.tsx` + a `SECTIONS` entry in `web/components/settings/SettingsSecondaryNav.tsx` + a `RouteSkeleton` case for `/settings/financial-profile`.

**Checkpoint**: profile editable from Settings; re-scores and snapshots.

## Phase 6: i18n

- [x] T023 [P] Write failing i18n test `web/test/i18n/financial-health-i18n.test.ts`: every new English key used by the feature exists in all 5 catalogs (bn/es/ja/zh/ko) with matching `{0}` placeholder arity. *(FR-014)*
- [x] T024 Add the ~35 new keys (onboarding copy, dimension + band labels, action templates, settings + widget copy) to `web/lib/i18n/{bn,es,ja,zh,ko}.ts`. Make T023 pass. *(FR-014)*

## Phase 7: Polish & cross-cutting

- [~] T025 [P] DEFERRED — per-widget drawer drill-down; all widgets currently share the placeholder detail panel (spec 037), so a bespoke breakdown here is deferred to a later drill-down pass.
- [x] T026 [P] Accessibility pass: sliders/chips are labelled semantic controls, keyboard-reachable, sand focus ring, ≥44px touch targets, `prefers-reduced-motion` honored (Constitution V). Add/extend a source-guard if warranted.
- [x] T027 [P] Update docs: `docs/finance.md` (add the health engine row + §), `docs/web.md` (widget + onboarding/settings routes), and the active-feature pointer in `Ortho/CLAUDE.md`.
- [x] T028 Final gate: full `npm test` green, `npx tsc --noEmit` (UNPIPED) clean, `lib/` coverage ≥ 90/90/80; walk quickstart §1–§8.

---

## Dependencies & order

- **Phase 2 (T003–T007)** blocks everything (types/store/DB).
- **US1 (Phase 3)** is the MVP and the critical path; the **engine (T008–T011)** is test-first and
  unblocks the widget.
- **US2 (Phase 4)** depends on US1 widget + the snapshot write (T007).
- **US3 (Phase 5)** depends on the shared sections (T013) + store (T007); independent of US2.
- **i18n (Phase 6)** depends on the UI strings existing (US1–US3).
- **Polish (Phase 7)** last.

## Parallel opportunities

- T004 ∥ T005 (types vs rows). T002 stub is parallel-safe.
- Within US1: T012/T013 (onboarding) ∥ T016 (widget test) once the engine (T011) lands; T008 ∥ T009
  are the same file so sequential.
- T022 ∥ T021 tail; T025/T026/T027 all `[P]`.

## MVP scope

**User Story 1 only** (Phases 1–3): a profile-less user gets a calm, actionable day-one score in the
dashboard widget. That alone satisfies SC-001/002/003/004 and is independently shippable.

## Format validation

All tasks use `- [ ] Txxx [P?] [US?] description + path`. Setup/Foundational/Polish carry no story
label; US phases are labelled.
