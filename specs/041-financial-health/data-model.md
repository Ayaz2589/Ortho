# Data Model: Financial Health (spec 041)

Four new **user-scoped** tables (RLS `user_id = auth.uid()`), one migration file
`supabase/migrations/<TS>_financial_health_profile.sql` (TS strictly > `20260730120000`). All amounts
are integer USD cents. Row types (`web/lib/supabase/rows.ts`) mirror columns 1:1; domain types
(`web/lib/types.ts`) are the app-layer shapes. Keep `rows.ts` ↔ `types.ts` ↔ SQL in lockstep. All
four reads **join the `loadAll` fail-open group** (missing table → `[]` / `null`).

## Enumerations

- `housing_type`: `rent | own | family | none`
- `emergency_fund_level`: `none | under_1m | 1_3m | 3_6m | 6m_plus`
- `fixed_cost_kind`: `remittance | loan | phone | transit | childcare | subscription | other`
  (default `other`; `remittance` is surfaced first-class in the UI)
- `health_dimension`: `cash_flow | safety_net | commitment_load | savings_momentum | plan_engagement`
- `health_band`: `strong | steady | building | getting_started` (stored on snapshots)

Enumerations are enforced with `CHECK` constraints (text columns), not Postgres enum types — cheaper
to evolve and consistent with recent additive tables.

## Table: `user_financial_profile` (one row per user)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `user_id` | uuid NOT NULL | `references auth.users(id) on delete cascade`, `UNIQUE` |
| `monthly_income_cents` | integer NOT NULL | ≥ 0 |
| `income_is_variable` | boolean NOT NULL | default `false` |
| `income_low_estimate_cents` | integer NULL | set when variable |
| `housing_type` | text NOT NULL | CHECK in housing_type; default `rent` |
| `housing_cost_cents` | integer NULL | null for family/none |
| `housing_share_fraction` | numeric(5,4) NOT NULL | default `1.0` (0<..≤1) |
| `savings_target_fraction` | numeric(5,4) NOT NULL | default `0.10` |
| `emergency_fund_level` | text NOT NULL | CHECK; default `none` |
| `created_at` | timestamptz NOT NULL | default `now()` |
| `updated_at` | timestamptz NOT NULL | default `now()` |

Read with `.maybeSingle()` → row | null; fail-open default **`null`**.

## Table: `user_fixed_costs` (0..many per user)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | cascade |
| `label` | text NOT NULL | |
| `amount_cents` | integer NOT NULL | `CHECK (amount_cents > 0)` |
| `kind` | text NOT NULL | CHECK in fixed_cost_kind; default `other` |
| `created_at` | timestamptz NOT NULL | default `now()` |

Index `user_fixed_costs_user_idx (user_id)`. Written **replace-all** (delete then insert) on save.

## Table: `user_dimension_weights` (one row per user per dimension)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | cascade |
| `dimension` | text NOT NULL | CHECK in health_dimension |
| `weight` | smallint NOT NULL | `CHECK (weight BETWEEN 1 AND 5)`, default `3` |
| `created_at` | timestamptz NOT NULL | default `now()` |
| | | `UNIQUE (user_id, dimension)` |

Written via batch upsert on `(user_id, dimension)`.

## Table: `financial_health_snapshots` (append-only, many per user)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | cascade |
| `score` | smallint NOT NULL | `CHECK (score BETWEEN 0 AND 100)` |
| `band` | text NOT NULL | CHECK in health_band |
| `created_at` | timestamptz NOT NULL | default `now()` |

Index `financial_health_snapshots_user_idx (user_id, created_at)`. The widget reads the earliest and
latest to show movement.

## RLS (all four tables, identical pattern)

```sql
alter table public.<t> enable row level security;
create policy <t>_select on public.<t> for select using (user_id = auth.uid());
create policy <t>_insert on public.<t> for insert with check (user_id = auth.uid());
create policy <t>_update on public.<t> for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy <t>_delete on public.<t> for delete using (user_id = auth.uid());
```

## Row types (`web/lib/supabase/rows.ts`)

`UserFinancialProfileRow`, `UserFixedCostRow`, `UserDimensionWeightRow`, `FinancialHealthSnapshotRow`
— column-for-column, numeric(5,4) → `number`, smallint → `number`, text enums as string-literal
unions where they map cleanly.

## Domain types (`web/lib/types.ts`)

```ts
export type HousingType = 'rent' | 'own' | 'family' | 'none'
export type EmergencyFundLevel = 'none' | 'under_1m' | '1_3m' | '3_6m' | '6m_plus'
export type FixedCostKind = 'remittance' | 'loan' | 'phone' | 'transit' | 'childcare' | 'subscription' | 'other'
export type HealthDimension = 'cash_flow' | 'safety_net' | 'commitment_load' | 'savings_momentum' | 'plan_engagement'
export type HealthBand = 'strong' | 'steady' | 'building' | 'getting_started'

export interface FinancialProfile {
  id: string; user_id: string
  monthly_income_cents: number
  income_is_variable: boolean
  income_low_estimate_cents: number | null
  housing_type: HousingType
  housing_cost_cents: number | null
  housing_share_fraction: number
  savings_target_fraction: number
  emergency_fund_level: EmergencyFundLevel
  created_at: string; updated_at: string
}
export interface FixedCost { id: string; user_id: string; label: string; amount_cents: number; kind: FixedCostKind; created_at: string }
export interface DimensionWeight { id: string; user_id: string; dimension: HealthDimension; weight: number; created_at: string }
export interface HealthSnapshot { id: string; user_id: string; score: number; band: HealthBand; created_at: string }
```

Derived (not persisted): `DerivedFinancialProfile`, `FinancialHealthResult`, `DimensionScore`,
`HealthAction` — defined in `web/lib/finance/financialHealth.ts` (see
[contracts/health-scoring.md](./contracts/health-scoring.md)).

## Store additions (`web/lib/store.tsx`)

- **State**: `userFinancialProfile: FinancialProfile | null`, `userFixedCosts: FixedCost[]`,
  `userDimensionWeights: DimensionWeight[]`, `healthSnapshots: HealthSnapshot[]`.
- **`loadAll`**: 4 reads scoped by `ownerId` (the auth user id), appended to the `Promise.all`; all 4
  join the fail-open group; profile default `null`, others `[]`.
- **Actions**: `saveFinancialProfile(input)` (upsert on `user_id`), `saveFixedCosts(costs)`
  (delete-then-insert), `saveDimensionWeights(weights)` (batch upsert on `user_id,dimension`),
  `writeHealthSnapshot(score, band)` (insert), and `saveFinancialHealth(profile, costs, weights, score, band)`
  orchestrating all four in sequence for a questionnaire submit.
