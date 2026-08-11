# Tasks: Financial Routines

**Feature dir**: `specs/044-financial-routines/` | **Branch**: `feat/044-financial-routines`
**Inputs**: plan.md, spec.md, research.md, data-model.md, contracts/{routines-engine,routine-awareness-dimension,location-and-geocoding}.md, quickstart.md
**Approach**: TDD (Constitution VI) — every behavior gets a failing test before the code that satisfies
it. Money/date math (`routines.ts`, `financialHealth.ts`) is unit + property tested (pinned like
`financial-health.test.ts`/`finance-properties.test.ts` already are — not a golden vector, per
research.md §3).

**Path conventions**: web app under `web/`; commands run from `web/` unless noted. Supabase commands
run from the repo root.

---

## Phase 1: Setup

- [X] T001 Add `@capacitor/geolocation` to `web/package.json` dependencies and run `npm install`
      (from `web/`). Create empty test/source dirs if missing: `web/test/location/`,
      `web/lib/location/`, `web/components/routines/`, `web/test/routines/`.
- [X] T002 Write `supabase/migrations/20260811120000_financial_routines.sql`: four tables per
      `data-model.md` — `recognized_routine_states`, `merchant_geocodes` (household-scoped RLS via
      `public.is_household_member(household_id)`, four policies each, reusing the helper from
      `20260521120000_initial_schema.sql`), `user_location_consent`, `user_routine_visits`
      (user-scoped RLS `user_id = auth.uid()`, four policies each, mirroring
      `20260806120000_financial_health_profile.sql`'s shape). Apply locally (`supabase db reset` or
      the project's migrate-up command per `docs/supabase.md`) and confirm it applies cleanly.

---

## Phase 2: Foundational (blocking prerequisite for all 4 stories)

Shared primitives every story's detection/UI work depends on: merchant-name normalization, the new
row/domain types, and getting the new tables into the app's data-load path.

- [X] T003 [P] Write failing unit tests for `normalizeMerchantKey` in `web/test/finance/routines.test.ts`
      per `contracts/routines-engine.md`: strips trailing POS store numbers (`"Dunkin' #04521"` →
      `"dunkin"`), case-folds, collapses whitespace/punctuation, is idempotent
      (`normalizeMerchantKey(normalizeMerchantKey(x)) === normalizeMerchantKey(x)`).
- [X] T004 Create `web/lib/finance/routines.ts` and `web/lib/finance/routines-thresholds.ts`
      (`ROUTINE_THRESHOLDS` per the contract's default values). Implement `normalizeMerchantKey` only
      for now. Make T003 pass.
- [X] T005 [P] Add row types to `web/lib/supabase/rows.ts` (`RecognizedRoutineStateRow`,
      `UserLocationConsentRow`, `UserRoutineVisitRow`, `MerchantGeocodeRow`) and domain types to
      `web/lib/types.ts` (`RoutineKind`, `RoutinePersistedStatus`, `RoutineStatus`,
      `LocationConsentLevel`, `RecognizedRoutineState`, `LocationConsent`, `RoutineVisit`,
      `MerchantGeocode`) per `data-model.md`. Extend `HealthDimension` with `'routine_awareness'`,
      **appended** (do not reorder the existing five).
- [X] T006 Wire `recognized_routine_states` and `merchant_geocodes` into `web/lib/store.tsx`'s
      `loadAll()`: add both `.from(...).select('*')` calls to the boot `Promise.all`, add both to the
      fail-open loop (`missingTable` check), cast to their `*Row` types, and expose them via new state
      (`recognizedRoutineStates`, `merchantGeocodes`). Wire `user_location_consent` via
      `.maybeSingle()` with fail-open `null`, exposed as `locationConsent`. (`user_routine_visits` is
      deliberately NOT added here — lazy-loaded only under US4, per data-model.md.)

**Checkpoint**: `npx tsc --noEmit` clean for all touched files; `npx vitest run test/finance/routines.test.ts` green (normalize-only cases).

---

## Phase 3: User Story 1 — Recognize recurring charges as routines (Priority: P1) 🎯 MVP

**Goal**: `recurring_charge` routines are detected purely from transaction history, presented in a
new Routines view, and can be confirmed/renamed/dismissed; a confirmed routine auto-categorizes the
next matching transaction (FR-017/SC-008).

**Independent test**: seed 3+ months of a same-merchant/same-amount monthly charge → it's listed with
cadence + amount; dismiss → stays gone on reload; confirm → the next matching transaction arrives
pre-categorized.

- [ ] T007 [US1] Write failing tests in `web/test/finance/routines.test.ts` for `detectRoutines()`'s
      `recurring_charge` branch per `contracts/routines-engine.md` §"FR-001/FR-002": below-min-count
      groups produce nothing; amount-tolerance and cadence-window gating (including a group that fails
      the hit ratio); `routineKey` format (`rc:${merchantKey}`) and stability across re-detection runs
      on a superset of the same transactions; `confidence ∈ [0,100]`; `derivedStatus` flips to
      `'lapsed'` after `lapseAfterMissedCycles` missed cycles.
- [ ] T008 [US1] Implement the `recurring_charge` branch of `detectRoutines()` in
      `web/lib/finance/routines.ts` (median amount, tolerance/hit-ratio gates, cadence-gap analysis,
      confidence formula, lapsed detection) using `ROUTINE_THRESHOLDS`. Make T007 pass.
- [ ] T009 [US1] [P] Write failing property tests in `web/test/finance/routines-properties.test.ts`:
      `detectRoutines` is order-independent (shuffle input, same output set by `routineKey`); every
      `evidenceTransactionIds` entry exists in the input and matches the group; `occurrenceCount ===
      evidenceTransactionIds.length`; two households' transactions never cross-contaminate a
      `routineKey` (per contracts/routines-engine.md invariants 1-4, 6).
- [ ] T010 [US1] Write failing tests for `applyRoutineStates()` in `web/test/finance/routines.test.ts`:
      no state row → `status = derivedStatus`; a `dismissed` row always wins; a `confirmed` row wins
      unless `derivedStatus === 'lapsed'` (lapsed wins over confirmed); `label` falls back to
      `merchantLabel` when the state row's label is null; output array length always equals input
      length (invariant 5).
- [ ] T011 [US1] Implement `applyRoutineStates()` in `web/lib/finance/routines.ts`. Make T010 pass.
- [ ] T012 [US1] Write failing store tests in `web/test/store/routines.test.tsx`: `confirmRoutine`,
      `dismissRoutine`, `renameRoutine` each upsert one row into `recognized_routine_states` keyed on
      `(household_id, routine_key)`; a computed `routines: RoutineWithState[]` selector combines
      `detectRoutines(transactions, now)` with `applyRoutineStates(...)` and
      `recognizedRoutineStates`.
- [ ] T013 [US1] Implement `confirmRoutine(routineKey, personId?)`, `dismissRoutine(routineKey)`,
      `renameRoutine(routineKey, label)`, and a memoized `routines` selector in `web/lib/store.tsx`.
      Make T012 pass.
- [ ] T014 [US1] Write failing component tests in `web/test/routines/RoutinesList.test.tsx`: renders
      recognized routines with cadence + typical amount; a household with only 1-2 occurrences shows
      nothing for it; confirm/dismiss/rename buttons call the corresponding store function; a
      dismissed routine never reappears after a re-render with the same transactions; a lapsed routine
      is visually distinguished (not shown as active); an empty/insufficient-history household shows a
      calm message, never a red/alarming empty state (Constitution II/IV).
- [ ] T015 [US1] Implement `web/components/routines/RoutineCard.tsx` (one routine: cadence, typical
      amount, confirm/dismiss/rename controls — real `<button>`s, per Constitution V) and
      `web/components/routines/RoutinesList.tsx` (fetches `routines` from `useApp()`, renders
      `RoutineCard`s, empty state). Make T014 pass.
- [ ] T016 [US1] Create route `web/app/(app)/routines/page.tsx` rendering `<RoutinesList />` inside the
      standard app shell/page-header pattern (match an existing simple list route, e.g.
      `settings/deposit-accounts/page.tsx`, for header/back-nav conventions).
- [ ] T017 [US1] Add a "Routines" entry point: a link row from `web/app/(app)/settings/page.tsx` to
      `/routines` (per Constitution's four preserved top-level destinations — Routines is reached
      *from* Settings, like Budgets/Goals/Deposit Accounts, not a new top-level nav item).
- [ ] T018 [US1] Write failing tests in `web/test/web/tx-form-auto-categorize.test.tsx`: entering a
      merchant that normalizes to a **confirmed** `recurring_charge` routine's `merchantKey`
      pre-fills the category field with that routine's `category` (only when the category field is
      still at its unset/default state — never overrides a category the user already picked); a
      merely-`recognized` (unconfirmed) or `dismissed` routine never auto-categorizes (FR-017);
      auto-categorization never creates or submits a transaction on its own.
- [ ] T019 [US1] Implement the auto-categorization suggestion in `web/components/web/TxForm.tsx`: on
      merchant blur/change, normalize via `normalizeMerchantKey`, look up a confirmed
      `recurring_charge` routine with that `merchantKey` from the store's `routines` selector, and
      prefill `category` if still unset. Make T018 pass.
- [ ] T020 [US1] [P] Manually verify `web/lib/finance/insights.ts`'s existing "Rule 5: Recurring
      subscriptions" is untouched (still present, still tested) — this feature adds a parallel,
      richer surface and does not replace or delete it (research.md §4). Confirm with
      `npx vitest run test/insights.unit.test.ts test/insights.parity.test.ts`.

**Checkpoint**: `npx vitest run test/finance/routines.test.ts test/finance/routines-properties.test.ts test/store/routines.test.tsx test/routines/RoutinesList.test.tsx test/web/tx-form-auto-categorize.test.tsx` green; `npx tsc --noEmit` clean.

---

## Phase 4: User Story 2 — Recognize behavioral spending routines (Priority: P2)

**Goal**: Looser weekday/time-of-day habits (variable amount) are detected alongside Story 1's
fixed-amount routines, using only transactions with a real time-of-day.

**Independent test**: seed several weeks of consistent weekday-morning manual entries at one
merchant with varying amounts → surfaced as a distinct "habit" routine; bank-imported rows never
produce one but still count toward Story 1's detection.

- [ ] T021 [US2] Write failing tests in `web/test/finance/routines.test.ts` for `detectRoutines()`'s
      `behavioral_habit` branch per `contracts/routines-engine.md` §"FR-003": groups by
      `(merchantKey, weekday, hourBucket)`; below-min-count / below-week-hit-ratio groups produce
      nothing; amount is reported (`typicalAmountCents`/`amountVarianceCents`) but never gates
      inclusion; a `hasRealTimeOfDay(tx) === false` transaction (import-tagged `source`) is excluded
      from grouping but still eligible for the `recurring_charge` branch from Phase 3; `routineKey`
      format `bh:${merchantKey}:${weekday}:${hourBucket}`.
- [ ] T022 [US2] Implement the `behavioral_habit` branch and `hasRealTimeOfDay(tx)` predicate in
      `web/lib/finance/routines.ts` (determine the real import-vs-manual/receipt `source` values from
      `web/lib/dataFile/` / scan-entry code and encode the exact predicate, per the contract's note
      that this heuristic must be visible/correctable independent of the grouping logic around it).
      Make T021 pass.
- [ ] T023 [US2] Write failing tests extending `web/test/routines/RoutinesList.test.tsx`: a
      `behavioral_habit` routine is visually labeled distinctly from a `recurring_charge` routine
      (e.g. "habit" vs. "recurring charge"), and the list groups/sorts kind-then-confidence.
- [ ] T024 [US2] Update `RoutineCard.tsx`/`RoutinesList.tsx` to render kind-specific labeling and
      sorting. Make T023 pass.

**Checkpoint**: `npx vitest run test/finance/routines.test.ts test/routines/RoutinesList.test.tsx` green.

---

## Phase 5: User Story 3 — Routines inform the financial-health picture (Priority: P3)

**Goal**: A new sixth `routine_awareness` financial-health dimension, weightable like the existing
five, scored from non-dismissed/non-lapsed routines' share of spend, citing which routines
contributed; the existing five dimensions are unchanged.

**Independent test**: compare two otherwise-identical households, one with recognized routines, one
without — the breakdown differs only for the household with routines and cites specific routines;
dismissing one changes the corresponding part of the breakdown.

- [ ] T025 [US3] Write failing tests in `web/test/financial-health.test.ts` per
      `contracts/routine-awareness-dimension.md`: `DIMENSION_ORDER` includes `routine_awareness`
      appended last; zero routines or zero window spend → `NEUTRAL (50)` with empty
      `contributingRoutineKeys`; coverage-ratio scoring between `ROUTINE_AWARENESS_LOW/HIGH` bounds;
      `dismissed`/`lapsed` routines excluded from `activeRoutines`; `contributingRoutineKeys` sorted by
      windowed-spend descending; the five pre-existing dimensions are byte-identical to their spec 041
      values when `routines: []` (the literal no-regression requirement, FR-010).
- [ ] T026 [US3] [P] Write failing property tests extending `web/test/finance-properties.test.ts` per
      the contract's invariants 7-10: dismissing a routine never increases `routine_awareness`'s
      score; increasing its weight never decreases its composite share; score stays in `[0,100]` for
      all generated `routines` arrays.
- [ ] T027 [US3] Extend `web/lib/finance/financial-health-thresholds.ts` (`ROUTINE_AWARENESS_LOW`,
      `_HIGH`, `_FLOOR`, `ROUTINE_AWARENESS_WINDOW_MONTHS` defaults per the contract) and
      `web/lib/finance/financialHealth.ts`: add `routines: RoutineWithState[]` to
      `FinancialHealthInput`, implement `routineAwarenessScore()`, add its `ACTION_TEMPLATES` entry,
      add `contributingRoutineKeys?` to `DimensionScore`, wire it into `scoreFinancialHealth()`'s
      `rawScores`/`dimensions` construction. Make T025 and T026 pass.
- [ ] T028 [US3] Write failing tests extending `web/test/widgets/financial-health.test.tsx`: the
      widget renders a sixth dimension row citing contributing routine labels; a household with no
      routines shows the calm "not enough history yet" state, never a low/red-reading score.
- [ ] T029 [US3] Update `web/components/widgets/bodies/FinancialHealthBody.tsx` to pass the store's
      `routines` selector into `scoreFinancialHealth`, and render the sixth dimension row + cited
      routine labels (resolve `routineKey`s back to `merchantLabel`/`label` for display). Make T028
      pass.
- [ ] T030 [US3] Write failing tests extending `web/test/financial-health-settings.test.tsx` (or the
      `FinancialProfileForm` component test): `WeightsSection` renders a sixth 1-5 control for
      "Routine awareness" alongside the existing five, and saving persists a `routine_awareness` row
      to `user_dimension_weights`. Implement: add `routine_awareness` to
      `FinancialProfileForm.tsx`'s `DIMENSION_LABEL` map (the `WeightsSection` loop over
      `T.DIMENSION_ORDER` picks it up automatically once T027 appends it). Make the test pass.

**Checkpoint**: `npx vitest run test/financial-health.test.ts test/finance-properties.test.ts test/widgets/financial-health.test.tsx test/financial-health-settings.test.tsx` green.

---

## Phase 6: User Story 4 — Optional location-boosted routine detection (Priority: P4)

**Goal**: Off by default. A `geocoding` tier (merchant-name → place, credential-gated, no device
permission) and a `foreground_capture` tier (one-shot location at app-foreground moments, "When In
Use" permission only) — per research.md §1's descope of true passive background dwell detection.
Revoking removes all location-derived data within one session.

**Independent test**: opted-out household — zero location prompts/collection anywhere; opted into
`foreground_capture` — repeated app-open captures can surface a visit-pattern suggestion; revoke —
all visit data and location-only suggestions gone immediately.

- [ ] T031 [US4] Add `NSLocationWhenInUseUsageDescription` (plain-language: what's collected, that
      it's optional, that it stays scoped to routine detection) to `ios/App/App/Info.plist`. No
      `UIBackgroundModes` entry (foreground-only, per research.md §1 — deliberately no background
      capability).
- [ ] T032 [US4] Write failing tests in `web/test/location/consent.test.ts`: reading/writing
      `user_location_consent` for the three levels; moving off `'off'` stamps `granted_at`; moving to
      `'off'` stamps `revoked_at` **and** triggers deletion of all of that user's `user_routine_visits`
      rows (mocked store/supabase client).
- [ ] T033 [US4] Implement `web/lib/location/consent.ts` (`getLocationConsent`, `setLocationConsent`)
      and wire the revoke-cascades-to-delete-visits call into `web/lib/store.tsx`. Make T032 pass.
- [ ] T034 [US4] Write failing tests in `web/test/location/captureVisit.test.ts`: a capture call is a
      no-op unless `level === 'foreground_capture'`; throttled by `captureMinIntervalMinutes` (no
      second capture within the window); silently no-ops (no thrown error, no repeated nagging) on
      permission denial or an unavailable Geolocation API (mock `@capacitor/geolocation`).
- [ ] T035 [US4] Implement `web/lib/location/captureVisit.ts` using `@capacitor/geolocation`'s
      `requestPermissions`/`getCurrentPosition`, writing one `user_routine_visits` row per qualifying
      capture. Make T034 pass. Hook the capture call into the Routines view's mount effect (app-open
      proxy) — not into every navigation, per the throttle.
- [ ] T036 [US4] Write failing tests in `web/test/location/geocoding.test.ts`:
      `checkGeocodingAvailable()` returns `'unconfigured'` when the probe reports not-configured,
      `'available'` when configured, `'no-household'` when there's no active household; a
      `merchant_geocodes` row is only written/read when `available`.
- [ ] T037 [US4] Implement `web/lib/location/geocoding.ts` (`checkGeocodingAvailable()` calling the
      edge function's probe mode; `resolveMerchantGeocode(merchantKey, merchantLabel)` — fire-and-
      forget, cache-first against `merchant_geocodes`). Make T036 pass.
- [ ] T038 [US4] Implement `supabase/functions/geocode-merchant/index.ts` following the
      `plaid-link-token` pattern exactly: `requiredEnv('MAPS_GEOCODING_API_KEY')` (or the real
      provider's credential name), a `probe` mode returning `{ configured: boolean }` without
      spending a real geocode call, and a normal mode that geocodes via a small internal
      `geocode(merchantLabel): Promise<{lat,lng,label}|null>` interface (stubbed/unimplemented body
      acceptable — no credential exists in this environment per research.md §7 — but the
      `not_configured` 503 path must be real and correct).
- [ ] T039 [US4] [P] Write `supabase/functions/geocode-merchant/config.test.ts` (Deno.test, mirroring
      `plaid-exchange/completion.test.ts`'s style) asserting the `not_configured` decision path when
      the required env var is absent. **Cannot be executed in this sandbox** (no Deno CLI available)
      — write it correctly per the existing pattern and note in the task's completion that it needs a
      `deno test` run in an environment with Deno installed (matching this repo's existing "no
      Xcode/no browser" verification-gap precedent).
- [ ] T040 [US4] Write failing tests in `web/test/location/LocationConsentSection.test.tsx`: renders
      the three-tier control (Off/Geocoding/Foreground capture); geocoding shown as unavailable
      renders the calm "Location enrichment isn't available yet" message instead of a broken toggle;
      selecting "Foreground capture" triggers the permission-request flow; selecting "Off" after a
      higher tier triggers the revoke-and-delete flow.
- [ ] T041 [US4] Implement `web/components/settings/LocationConsentSection.tsx` and route
      `web/app/(app)/settings/location/page.tsx`; add a "Location" entry link from
      `web/app/(app)/settings/page.tsx`. Make T040 pass.
- [ ] T042 [US4] Write failing tests extending `web/test/routines/RoutinesList.test.tsx`: when
      geocoding is `available` and a routine's `merchantKey` has a resolved `merchant_geocodes` row,
      the routine card shows the place label; when `foreground_capture` visits exist that cluster by
      proximity + weekday/hour, a distinct "candidate routine" card is shown, dismissible, and never
      auto-creates a transaction (FR-014); with location off, none of this renders and behavior is
      identical to Phase 3-5's output (US4 AC1).
- [ ] T043 [US4] Implement the visit-clustering-to-candidate-suggestion logic (a small pure helper in
      `web/lib/location/visitClusters.ts` — group `user_routine_visits` by rounded-coordinate
      proximity + weekday/hour-bucket, reusing the same bucket-size constant as
      `routines-thresholds.ts`'s behavioral detection) and render it in `RoutinesList.tsx` as a
      distinct candidate card type with a dismiss action (dismissal here is a lightweight per-cluster
      local/DB flag — reuse `recognized_routine_states` with a synthetic `routineKey` prefix, e.g.
      `loc:${clusterId}`, so it follows the exact same confirm/dismiss persistence path as every other
      routine — no new table). Make T042 pass.
- [ ] T044 [US4] [P] Manually confirm (per `quickstart.md` Story 4 steps 12-17) that: no permission
      prompt fires until the user explicitly opts in past `geocoding`; denying the prompt degrades
      calmly; the unconfigured-geocoding message renders correctly in this environment (expected,
      honest state — no credential is configured anywhere in this sandbox or CI).

**Checkpoint**: `npx vitest run test/location test/routines/RoutinesList.test.tsx` green; `npx tsc --noEmit` clean.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T045 [P] Add `web/test/i18n/routines-i18n.test.ts` (mirror the spec-043/042 i18n guard pattern):
      every new English string introduced across Phases 3-6 (routines list/card copy, confirm/
      dismiss/rename controls, lapsed/empty states, the 6th dimension label + action template,
      location consent tiers + calm unconfigured/denied copy) is present in `bn`/`es`/`ja`/`zh`/`ko`
      with matching `{n}`-placeholder arity.
- [ ] T046 Add the translations for every key from T045 to `web/lib/i18n/{bn,es,ja,zh,ko}.ts`. Make
      T045 pass.
- [ ] T047 Run the full gate: `npx tsc --noEmit` (UNPIPED — must be clean) then `npm test` (full
      suite green), from `web/`.
- [ ] T048 [P] Verify no accidental deletion/regression of Rule 5 (`insights.ts`'s existing recurring-
      subscriptions detector) and no stale references:
      `grep -rn "TODO.*routine\|FIXME.*routine" web/{app,components,lib,test}` returns nothing
      unresolved; confirm `web/lib/finance/insights.ts`'s Rule 5 block is untouched.
- [ ] T049 [P] Run `npm run gen:vectors` (from `web/`) and confirm **no diff** — routine detection and
      the 6th health dimension are unit/property-pinned only, never promoted into
      `shared/test-vectors/` by this feature (research.md §3, spec Assumptions).
- [ ] T050 [P] Manual cross-canvas confirm per `quickstart.md` (all four stories, desktop + mobile +
      the Capacitor iOS shell for the location permission flow) — in a real browser/device before
      merge (no browser in sandbox; matches spec 043's T020 precedent).

---

## Dependencies & Execution Order

- **Setup (T001-T002)** → **Foundational (T003-T006)** → all user stories.
- **US1 (T007-T020)** is the MVP; only depends on Foundational.
- **US2 (T021-T024)** extends `detectRoutines`/`RoutinesList` from US1 — depends on US1's T008/T015.
- **US3 (T025-T030)** depends only on Foundational's types (T005) + US1's `RoutineWithState` shape
  (T011) for its `routines: RoutineWithState[]` input — does not require US2's behavioral branch to
  exist, though in practice both kinds flow through the same array once US2 ships.
- **US4 (T031-T044)** is independent of US2/US3 (only needs Foundational's tables/types + US1's
  `RoutinesList` to extend) — can be built in parallel with US2/US3 by a different contributor.
- **Polish (T045-T050)** after all four stories; i18n (T045-T046) depends on every story's final copy.

## Parallel Opportunities

- T003 (normalize tests) ∥ T005 (row/type additions) — different files.
- US2 (T021-T024) ∥ US3 (T025-T030) ∥ US4 (T031-T044) once US1 is merged — three independent
  extensions of the same foundation.
- T009, T026, T039, T045, T048, T049, T050 are marked [P] within their phases (independent files).

## MVP Scope

**US1 (Phase 3)** — recurring-charge detection, the Routines view, confirm/dismiss/rename, and bounded
auto-categorization — is a complete, independently shippable increment on its own (spec's own
"🎯 MVP" marker). US2-US4 are additive.

## Task Count

50 tasks — Setup 2, Foundational 4, US1 14, US2 4, US3 6, US4 14, Polish 6.
