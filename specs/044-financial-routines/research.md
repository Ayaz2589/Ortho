# Research: Financial Routines (spec 044)

Phase 0 output. Every item below either resolves a spec-time unknown or documents a planning-time
correction discovered by reading the actual codebase (the spec's own Assumptions section flagged
these as things to validate during planning).

## 1. Location booster feasibility on the Capacitor/web architecture

**Question**: Is `CLVisit`-style passive background dwell detection (the deepest tier of the
grounding decision record, github.com/Ayaz2589/Ortho/pull/5) achievable given this repo's actual
architecture?

**Finding**: No, not without adding a substantial new dependency and native surface the project
doesn't have today.

- `web/package.json` has no location plugin at all — no `@capacitor/geolocation`, no background
  variant. `ios/App/App/Info.plist` declares no `NSLocation*UsageDescription` keys and no
  `UIBackgroundModes`. The location capability doesn't exist yet in any form.
- Apple's `CLVisit` (what the grounding doc assumes) is a native `CoreLocation` API. Capacitor's
  official `@capacitor/geolocation` plugin only wraps foreground-style `getCurrentPosition` /
  `watchPosition` — it has no visit-monitoring equivalent, and doesn't work in the background.
- True background/passive detection on Capacitor requires a third-party native plugin —
  `@capacitor-community/background-geolocation` (continuous tracking updates, not low-power
  "visits" — a much bigger battery and privacy cost than `CLVisit`) or
  `transistorsoft/capacitor-background-geolocation` (a sophisticated, motion-aware, **paid**
  product). Either is a large new native dependency, a new `UIBackgroundModes: [location]`
  entitlement, and — per the grounding doc's own analysis — the exact kind of "Always" location
  trust cost that should be earned later, not bundled into a first release.

**Decision**: Descope true passive/background dwell detection (FR-013's "deeper, higher-friction
opt-in") for this build. Replace it with **opportunistic foreground visit capture**: when a user has
opted in beyond the geocoding baseline, a one-shot location read (`getCurrentPosition`, standard
`@capacitor/geolocation`, "When In Use" permission only — no "Always" prompt, no background mode) is
taken at natural app-foreground moments (e.g. app open, dashboard/routines view). Repeated captures
over multiple sessions can still accumulate a visit pattern over time and satisfy User Story 4's
intent (a repeating-place signal building toward a routine suggestion) without any background
permission, third-party native plugin, or new entitlement. `@capacitor/geolocation` is added as a new
dependency; this is the only new native surface this feature introduces.

**Rationale**: Matches the grounding doc's own sequencing advice ("earn the 'Always' permission
later, after demonstrated value") and the spec's Assumptions section, which explicitly anticipated
this outcome and named foreground capture as the fallback. Keeps User Story 4 real (not merely
"geocode a name") while adding zero new App Store review risk category (background location).

**Alternatives considered**: (a) Ship geocoding-only, no capture at all — rejected, underdelivers the
spec's US4 acceptance scenario 3 (a visit-pattern-based suggestion) for no added engineering cost
saved once `@capacitor/geolocation` is already being added for the one-shot case. (b) Add a
third-party background-geolocation plugin — rejected as disproportionate scope/cost/trust-risk for a
v1, consistent with the grounding doc's own "earn it later" stance.

## 2. Household visibility for routines — no existing per-member privacy boundary to mirror

**Question** (raised by FR-016, resolved by the user as "household-visible for shared transactions,
private for personal-scope routines"): what does "mirroring the app's existing shared-vs-personal
transaction visibility" concretely mean at the data layer?

**Finding**: There is no existing per-member privacy boundary to mirror. "Personal" vs "shared" is
not a stored/enforced concept anywhere in the schema or RLS today — every transaction's Postgres RLS
already grants read access to every member of the household (`transactions_select` policy uses
`public.is_household_member(household_id)`, no per-owner restriction; see
`supabase/migrations/20260616120000_household_people_and_value_splits.sql`). "Personal" is purely a
UI-level reading of `owner_ids.length === 1` — the underlying row is still household-readable in the
database.

**Decision**: Routines get the **same** RLS shape as transactions — household-membership-scoped
(`public.is_household_member(household_id)`), not a new per-member access-control layer. FR-016's
"personal-scope routines are private to the member" is honored at the **presentation layer**: a
routine derived from a single-owner transaction pattern carries a `person_id` attribution, and the
routines list UI filters/groups by it (a personal routine is not shown mixed into the household list
by default), exactly mirroring how personal vs. shared transactions are already only a *display*
distinction today, not a database one. Building true DB-level per-member privacy would be a new
access-control primitive well beyond this feature's scope and inconsistent with how every other
household-scoped table in this schema works.

**Rationale**: Keeps the promise of FR-016 (a personal routine isn't presented to the whole household
by default) without inventing a new RLS pattern nothing else in the app uses, and without a scope
creep into rewriting transaction-level privacy.

## 3. Financial-health engine is unit/property-test pinned, not vector-locked

**Correction to spec.md's Assumptions section**: the spec's Assumptions describe the sixth-dimension
change as touching "the vector-locked regression harness for financial health." That's inaccurate —
`web/lib/finance/financialHealth.ts`'s own header comment states it is "Pinned by unit + property
tests (`web/test/financial-health.test.ts`), **not a golden vector**" and it does not appear in
`shared/test-vectors/`. This is corroborated by CLAUDE.md: "Engine pinned by unit/property tests (not
a golden vector)."

**Impact**: Lower risk than the spec assumed — extending `HealthDimension`, `DIMENSION_ORDER`,
`ACTION_TEMPLATES`, and adding a scorer function only needs new/updated Vitest unit + property tests
in `web/test/financial-health.test.ts`, not a `shared/test-vectors/` fixture regeneration
(`npm run gen:vectors` is unaffected).

## 4. An existing recurring-charge detector already exists — reuse its shape, not its output

`web/lib/finance/insights.ts` ("Rule 5: Recurring subscriptions", ~line 220) already does
household-wide trailing-window, min-count, cadence-range, hit-ratio recurring-charge detection for
a one-off insight card — constants live in `web/lib/finance/insights-thresholds.ts`
(`recurringWindowMonths: 6`, `recurringMinCount: 3`, `recurringCadenceMinDays/MaxDays: 28/35`,
`recurringHitRatio: 0.8`). This is a **precedent for the tuning shape** (window, min-count, cadence
band, hit-ratio), not code to import: it's a single ephemeral insight message (no per-item identity,
no persisted status, no confirm/dismiss, no per-person attribution, no drift-adaptation, no
merchant-name normalization). Spec 044's `web/lib/finance/routines.ts` is a new, richer engine using
the same statistical shape but producing individually-identified, persistently-trackable routine
candidates. The two will independently continue to exist — Rule 5 is not deleted or replaced by this
feature (out of scope; it's a different surface, the Insights card).

## 5. "Derived, never stored" applies — persist only what can't be recomputed

README's Core Ideas principle ("Derived, never stored... member balances are computed from history
on every render — there is no month-close job and no cached progress column") governs the data model:
routine *detection* (which patterns currently qualify, with what confidence) is recomputed live by
the pure engine from transactions on every read, exactly like `insights.ts` and `personSummary.ts`.
Only genuinely user-authored state that cannot be derived — a routine being **confirmed**,
**dismissed**, or **renamed** — is persisted, keyed by a deterministic `routine_key` the engine
computes so the same real-world pattern always maps back to the same stored state row even as new
transactions arrive. "Lapsed" is also computed live (no recent evidence within the expected cadence
window) rather than stored, so it needs no background job.

## 6. Migration, row-mirror, store, widget, weights-UI, and i18n conventions (precedent to follow)

- **Migration**: one file per feature, `supabase/migrations/YYYYMMDDHHMMSS_description.sql` (next
  timestamp after the latest, `20260806120000`, so `20260811120000_financial_routines.sql`). CHECK
  constraints for enum-like columns (not Postgres enums), `gen_random_uuid()` PKs,
  `timestamptz not null default now()`. Household-scoped tables use
  `public.is_household_member(household_id)` / `public.is_household_owner(household_id)` RLS helpers
  (defined in `20260521120000_initial_schema.sql`), not `user_id = auth.uid()` (that pattern is only
  for genuinely single-user-private tables like spec 041's profile tables — location consent is the
  one new table in this feature that fits that shape).
- **Row/type mirror**: `web/lib/supabase/rows.ts` gets one new `*Row` interface per table,
  column-for-column; `web/lib/types.ts` gets the domain-shape equivalents.
- **Store/load**: `web/lib/store.tsx`'s `loadAll()` `Promise.all` gets new `.from(...).select(...)`
  calls added to the array and the fail-open loop (`missingTable` check on `PGRST205`/`42P01`),
  matching how goals/tags/deposit-accounts/financial-health tables are already loaded — no explicit
  `.eq('household_id', ...)` needed since RLS already scopes the rows.
- **Financial-health weights UI**: `components/financial-health/FinancialProfileForm.tsx`'s
  `WeightsSection` (~line 266) renders one 1–5 button-group "radiogroup" per `T.DIMENSION_ORDER`
  entry — adding `routine_awareness` to `DIMENSION_ORDER` extends this UI with no new component.
- **Dashboard widget**: `web/lib/widgets/registry.tsx`'s `WIDGETS` array — one object
  `{ id, title, description, defaultEnabled, Body }` per widget; a routines widget is one more entry
  plus a new `Body` component under `web/components/widgets/bodies/`.
- **i18n**: catalogs are flat `Record<string,string>` keyed by the literal English string
  (`web/lib/i18n/{bn,es,ja,zh,ko}.ts`); `web/test/i18n/catalog-reachability.test.ts` and
  `placeholder-parity.test.ts` guard completeness — every new English string used via `tr()` needs an
  entry added to all five catalogs (financial-health precedent:
  `web/test/i18n/financial-health-i18n.test.ts`).
- **Tests**: pure engines get `web/test/finance/*.test.ts` (unit + property, `fast-check`-style
  where `financial-health.test.ts`/`finance-properties.test.ts` already do); component/store/i18n
  coverage follows the existing `web/test/{widgets,store,i18n}/` split.

## 6b. No transaction in this system carries a real time-of-day — behavioral habits key on weekday only (discovered during US2 implementation)

**Question**: FR-003 assumed manual/receipt-entry transactions carry a real time-of-day and only
bank-import rows don't (per the spec's own Assumptions section).

**Finding**: That assumption is wrong. Every write path in the app pins `date` to
`T12:00:00.000Z` (noon UTC on the picked calendar day) — manual entry (`TxForm.tsx`, a day-only
picker with no time input, per the spec-004 cross-client-parity convention: "iOS + CLI write the
same instant"), receipt/statement scan (`ParsedCandidate.date` is calendar-day-only, no hour ever
extracted), and bank/CSV import all produce the identical noon-UTC placeholder. There is no `source`
convention distinguishing origins either — `source` is the payment card/account label, set
identically by both paths. **No transaction anywhere in the current system has a genuine
time-of-day.**

**Decision**: Behavioral-habit detection (`bh:${merchantKey}:${weekday}`) drops the hour-bucket
dimension from FR-003 — it groups by `(merchantKey, weekday)` only, using the weekday derived from
the noon-UTC date (still a real, meaningful signal: "coffee most Tuesdays" is a genuine cadence
pattern even without knowing it was 8am). `hourBucket` stays in the `DetectedRoutine` type (and the
`routine_key` format keeps a slot for it) for forward-compatibility, but `hasRealTimeOfDay(tx)`
returns `false` unconditionally today, so it's always `null` in practice — this keeps the data model
honest about what it can't currently know rather than fabricating a fake "everyone's noon" bucket
that would read as real granularity it isn't.

**Follow-up (out of scope here)**: capturing a real time-of-day would sharpen this meaningfully — an
optional time field on manual/receipt entry (bank imports would still have none) is a small,
independent, low-risk future enhancement worth its own spec; it wasn't scoped or estimated as part
of spec 044.

## 7. Merchant-name geocoding needs a credentials-gated provider — greenfield, follow the Plaid/SimpleFin pattern

**Question**: FR-012's baseline geocoding turns a merchant name into a place. That needs a real
geocoding provider (the grounding doc names Apple Maps Server API on web — JWT-signed, needs an
Apple Developer key) or an equivalent. No such credential exists in this environment, and this is
the first time the repo has scoped any geocoding integration (nothing prior — confirmed by
searching all specs/docs for "geocod"/"Apple Maps").

**Decision**: Build the full plumbing using this repo's existing credential-gated-integration
pattern (Plaid/SimpleFin, `supabase/functions/plaid-link-token/index.ts`): a `requiredEnv(...)`
check in a new edge function reading a `MAPS_GEOCODING_API_KEY`-style secret, a `probe` mode so the
client can ask "is this configured?" without spending a real geocode call, and a calm client-side
"not configured" state (mirroring `web/components/settings/LinkedBanks.tsx`'s
`Availability: 'checking'|'available'|'unconfigured'`) instead of a broken button. In this sandbox
(no credential available) it will correctly and honestly report unconfigured; an operator with an
Apple Developer / geocoding-provider credential can light it up later by setting the secret — no
code change required. This keeps FR-012 fully built and testable (the fail-open/unconfigured path is
itself a first-class, tested state) without fabricating a working third-party integration this
environment can't actually authenticate.

**Rationale**: Reuses a pattern already proven in this codebase rather than inventing a new one;
degrades honestly instead of silently no-op'ing; matches Constitution Principle IV (calm,
non-alarmist empty/unconfigured states).

## 8. Technical Context resolution (for plan.md)

All prior `NEEDS CLARIFICATION` items from the plan template are resolved by the above + the
existing stack: TypeScript/Next.js 16/React 19 (unchanged), Supabase Postgres + RLS (unchanged),
Vitest (unchanged), web + Capacitor iOS shell (unchanged), one new runtime dependency
(`@capacitor/geolocation`, foreground-only usage), one new credential-gated Supabase edge function
for merchant geocoding (§7, inert without an operator-supplied secret). No other new services or
external APIs.
