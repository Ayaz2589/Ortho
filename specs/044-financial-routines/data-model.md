# Data Model: Financial Routines (spec 044)

Consistent with README's "derived, never stored" principle (also followed by `insights.ts` /
`personSummary.ts`): **routine detection is recomputed live** from transactions on every read by a
pure engine (`web/lib/finance/routines.ts`). Only genuinely user-authored state that can't be
re-derived — confirming, dismissing, or renaming a routine, and location opt-in/consent — is
persisted. One migration, `supabase/migrations/20260811120000_financial_routines.sql` (timestamp
strictly > `20260806120000`, the latest existing migration).

## Enumerations

- `routine_kind` (engine-level, not a DB column): `recurring_charge | behavioral_habit`
- `routine_derived_status` (engine-level, computed): `recognized | lapsed`
- `routine_persisted_status` (DB column, `recognized_routine_states.status`): `confirmed | dismissed`
  — "recognized" and "lapsed" are never written to the DB; a routine with **no** state row is
  "recognized" (or "lapsed") by pure computation.
- `location_consent_level` (DB column): `off | geocoding | foreground_capture` — the three feasible
  tiers after research.md §1's descope of true background dwell detection.
- `health_dimension` (existing enum, extended): adds `routine_awareness` to the CHECK list already
  used by `user_dimension_weights.dimension` and `financial_health_snapshots` — six values total.

## Table: `recognized_routine_states` (household-scoped, 0..many per household)

The only durable piece of a "Recognized Routine" (FR-005): a user's confirm/dismiss/rename decision,
keyed to a deterministic `routine_key` so it survives re-detection as new transactions arrive.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `household_id` | uuid NOT NULL | `references households(id) on delete cascade` |
| `routine_key` | text NOT NULL | engine-computed deterministic key (see contracts/routines-engine.md) |
| `status` | text NOT NULL | CHECK `in ('confirmed','dismissed')` |
| `label` | text NULL | user rename override; null = use the engine's derived label |
| `person_id` | uuid NULL | `references household_people(id) on delete set null` — attribution override |
| `created_by` | uuid NOT NULL | `references auth.users(id) on delete cascade` |
| `created_at` | timestamptz NOT NULL | default `now()` |
| `updated_at` | timestamptz NOT NULL | default `now()` |
| | | `UNIQUE (household_id, routine_key)` |

Index: `recognized_routine_states_household_idx (household_id)`.

**RLS**: household-membership, matching `transactions`/`budgets`/`goals` (not `user_id = auth.uid()`
— research.md §2 found no existing per-member privacy boundary for household data to mirror; the
household-visible/private-to-member split from FR-016 is a UI-layer filter over `person_id`, not an
RLS restriction):

```sql
create policy recognized_routine_states_select on public.recognized_routine_states
  for select using (public.is_household_member(household_id));
create policy recognized_routine_states_insert on public.recognized_routine_states
  for insert with check (public.is_household_member(household_id));
create policy recognized_routine_states_update on public.recognized_routine_states
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy recognized_routine_states_delete on public.recognized_routine_states
  for delete using (public.is_household_member(household_id));
```

## Table: `user_location_consent` (user-scoped, one row per user)

Tracks FR-011/FR-015's opt-in/opt-out. Genuinely private — mirrors spec 041's `user_id = auth.uid()`
tables, not household-shared.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | `references auth.users(id) on delete cascade`, `UNIQUE` |
| `level` | text NOT NULL | CHECK `in ('off','geocoding','foreground_capture')`; default `'off'` |
| `granted_at` | timestamptz NULL | set when `level` moves off `'off'` |
| `revoked_at` | timestamptz NULL | set when `level` moves back to `'off'` |
| `created_at` | timestamptz NOT NULL | default `now()` |
| `updated_at` | timestamptz NOT NULL | default `now()` |

RLS: `user_id = auth.uid()` on all four policies (identical shape to spec 041's profile tables).

## Table: `user_routine_visits` (user-scoped, 0..many per user)

Opportunistic foreground location captures (research.md §1's replacement for background dwell
detection). Written only while `user_location_consent.level = 'foreground_capture'`; a raw
coordinate log is personal, so this stays user-private even though `household_id` is carried for
matching against the household's merchant geocodes.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | `references auth.users(id) on delete cascade` |
| `household_id` | uuid NOT NULL | `references households(id) on delete cascade` |
| `captured_at` | timestamptz NOT NULL | default `now()` |
| `latitude` | double precision NOT NULL | |
| `longitude` | double precision NOT NULL | |
| `accuracy_meters` | real NULL | |
| `created_at` | timestamptz NOT NULL | default `now()` |

Index: `user_routine_visits_user_idx (user_id, captured_at)`.

RLS: `user_id = auth.uid()` on all four policies. FR-015 (revoke ⇒ delete): revoking consent
(`user_location_consent.level` back to `'off'`) deletes all of a user's `user_routine_visits` rows
(app-level cascade on the settings save path — not a DB trigger, consistent with how the app already
handles other user-initiated deletions).

## Table: `merchant_geocodes` (household-scoped cache, 0..many per household)

FR-012's baseline enrichment result, cached so the same merchant isn't re-resolved on every read.
Purely a geocoding cache — no personal/location-consent gating needed to *read* it (a resolved place
label for "Blue Bottle Coffee" isn't personal data), but *populating* it only happens when at least
one household member has consent `level ∈ {geocoding, foreground_capture}` and the geocoding
provider is configured (see contracts/geocoding-provider.md).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid NOT NULL | `references households(id) on delete cascade` |
| `merchant_key` | text NOT NULL | normalized (see `normalizeMerchantKey`, contracts/routines-engine.md) |
| `latitude` | double precision NULL | null while unresolved/pending |
| `longitude` | double precision NULL | |
| `label` | text NULL | provider's display name for the place |
| `resolved_at` | timestamptz NULL | null = not yet resolved (provider unconfigured or lookup pending) |
| `created_at` | timestamptz NOT NULL | default `now()` |
| | | `UNIQUE (household_id, merchant_key)` |

RLS: household-membership (`is_household_member`), same shape as `recognized_routine_states`.

## RLS helper reuse

All household-scoped tables above reuse `public.is_household_member(household_id)` /
`public.is_household_owner(household_id)`, already defined in
`supabase/migrations/20260521120000_initial_schema.sql` — no new SQL functions needed.

## Row types (`web/lib/supabase/rows.ts`)

New interfaces, column-for-column: `RecognizedRoutineStateRow`, `UserLocationConsentRow`,
`UserRoutineVisitRow`, `MerchantGeocodeRow`.

## Domain types (`web/lib/types.ts`)

```ts
export type RoutineKind = 'recurring_charge' | 'behavioral_habit'
export type RoutinePersistedStatus = 'confirmed' | 'dismissed'
export type RoutineStatus = 'recognized' | 'lapsed' | RoutinePersistedStatus
export type LocationConsentLevel = 'off' | 'geocoding' | 'foreground_capture'

export type HealthDimension =
  | 'cash_flow' | 'safety_net' | 'commitment_load' | 'savings_momentum'
  | 'plan_engagement' | 'routine_awareness'   // extended, spec 044 — appended, order preserved

export interface RecognizedRoutineState {
  id: string
  household_id: string
  routine_key: string
  status: RoutinePersistedStatus
  label: string | null
  person_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface LocationConsent {
  id: string
  user_id: string
  level: LocationConsentLevel
  granted_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export interface RoutineVisit {
  id: string
  user_id: string
  household_id: string
  captured_at: string
  latitude: number
  longitude: number
  accuracy_meters: number | null
  created_at: string
}

export interface MerchantGeocode {
  id: string
  household_id: string
  merchant_key: string
  latitude: number | null
  longitude: number | null
  label: string | null
  resolved_at: string | null
  created_at: string
}
```

Pure-engine-only types (not persisted, defined in `web/lib/finance/routines.ts` — see
`contracts/routines-engine.md`): `DetectedRoutine`, `RoutineWithState`.

## Fail-open load

`recognized_routine_states`, `merchant_geocodes` join `loadAll`'s fail-open group (missing table →
`[]`), consistent with goals/tags/deposit-accounts/financial-health arrays. `user_location_consent`
follows the `user_financial_profile` pattern (`.maybeSingle()`, fail-open → `null`).
`user_routine_visits` is loaded lazily (only when `level = 'foreground_capture'`), not part of the
initial `loadAll` boot payload — it's write-heavy, read-rarely (only by the detection-boost path),
and keeping it out of the boot `Promise.all` avoids growing cold-start payload for the common
location-off case.
