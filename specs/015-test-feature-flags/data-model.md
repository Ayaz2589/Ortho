# Data Model: Test-Build Feature Flags

No backend/schema change. Two client-side data shapes: the **flag registry** (per surface) and the
**refreshed sample dataset** (per surface). Everything here is in-memory or per-device preference.

## 1. Feature flag registry

A small, extensible set of named boolean test toggles. Default OFF. Effective only on test builds;
forced OFF in production (FR-003).

| Flag key | Label (UI) | Default | Effect when ON |
|---|---|---|---|
| `useTestData` | "Use test data" | `false` | App runs against the in-memory sample dataset; zero live-backend reads/writes. |
| `bypassAuth` | "Bypass auth" | `false` | App opens straight to the tabs with no sign-in / real session; **implies `useTestData`**. |

**Derived rule**: `effectiveUseTestData = useTestData || bypassAuth`. UI shows the raw `useTestData`
switch state, but the data layer keys off `effectiveUseTestData`.

### iOS shape — `FeatureFlags` (`Config/FeatureFlags.swift`)

```
@Observable final class FeatureFlags {
    // @AppStorage-backed via UserDefaults keys "ff_useTestData", "ff_bypassAuth".
    var useTestData: Bool          // getter returns false unless TestBuild.isTestBuild
    var bypassAuth: Bool           // getter returns false unless TestBuild.isTestBuild
    var effectiveUseTestData: Bool { useTestData || bypassAuth }
}
```
- Reads are gated on `TestBuild.isTestBuild`, so a value persisted on a Debug/TestFlight install is
  ignored in an App Store build (FR-003).
- Injected into the SwiftUI environment next to `AppState`.

### web shape — `FlagState` (`lib/flags.ts`)

```
type FlagState = { useTestData: boolean; bypassAuth: boolean }
readFlags(): FlagState        // {false,false} if !isTestBuild() or no storage
writeFlags(next): void        // localStorage 'ortho.flags' (JSON) + set/clear 'ortho_bypass_auth' cookie
effectiveUseTestData(f): boolean   // f.useTestData || f.bypassAuth
```
- `readFlags()` returns all-false unless `isTestBuild()` (build-time), so the honoring code
  dead-code-eliminates in production (FR-003).
- The `ortho_bypass_auth` cookie mirrors `bypassAuth` so the server-side `proxy.ts` gate can read it.

### Test-build signal

| Surface | `isTestBuild` true when | false when |
|---|---|---|
| iOS (`TestBuild.isTestBuild`) | `#if DEBUG` **or** `Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"` (TestFlight) | App Store Release |
| web (`isTestBuild()`) | `NEXT_PUBLIC_VERCEL_ENV !== 'production'` (fallback `NODE_ENV !== 'production'`) | production build/deploy |

## 2. Refreshed sample dataset ("test data")

A self-contained, in-memory dataset that mirrors the **current** domain model so every screen is
populated and correct. Fixed deterministic identities; never written to the live backend.

### Entities & required corrections (vs. today's stale sample)

| Entity | Must include | Correction from current sample |
|---|---|---|
| **Household** | one household with a name | keep `homeSample` id `3333…`; membership expressed via People (not `memberIDs:[User.ID]`) |
| **Person** (owners) | ≥2 people, linked to the two sample users, with `colorKey`, `sortOrder`, `removedAt: nil` | **NEW `Person.sample`** — none exists today; owners currently fall back to `users` |
| **User** | the two account personas | keep `mayaSample`/`jordanSample`; link each to a Person |
| **Transaction** | ≥ ~15 rows across ≥3 months; owners are **Person ids**; `paidBy` set; includes joint/split rows and ≥1 `.transfer` (reimbursement) | today: `Set<User.ID>` owners, no `paidBy`, 3-day span, no transfer |
| **Card** | the existing 4 cards | keep `Card.sample`; ensure names still match `Transaction.source` |
| **Budget** | ≥2 budgets on categories present in the sample tx | **NEW `Budget.sample`** — none today |
| **Property** | the primary home + mortgage | keep `Property.sample` |
| **RentalPayment** | ≥2 payments so Housing rental view is non-empty | **NEW `RentalPayment.sample`** — none today |

### Invariants (asserted by tests)

- **Person-keyed owners**: every `Transaction.ownerIDs` / `owner_ids` references a Person in the
  sample People list — no unresolved / "removed" owners (SC-003, FR-011).
- **Non-empty balances**: `paidBy` + splits produce at least one non-zero member balance (FR-011).
- **Month span**: transaction dates cover ≥ 2 distinct months so range/month pickers navigate
  (FR-010, SC-003).
- **No identity leak**: the fixed sample UUIDs are never passed to a live create/update/delete
  (FR-012) — enforced by the isolation contract + tests.
- **Determinism**: dates are anchored relative to a reference "now" so the sample is always "fresh"
  but reproducible within a launch.

### iOS factories (static, on the models)

- `Person.sample` (NEW) → `[maya, jordan]` as People, `householdID = homeSample.id`,
  `linkedUserID` = the matching sample user id.
- `Transaction.sample` (MODERNIZE) → `makeSample` retyped to `ownerIDs: Set<Person.ID>`, add
  `paidBy`, widen `daysAgo` to span ≥3 months, add ≥1 `.transfer` row.
- `Budget.sample` (NEW), `RentalPayment.sample` (NEW).
- `AppState.init` default params updated so demo/test seeding uses People and the new collections.

### web seed (`lib/testdata/seed.ts`)

- Person-centric dataset built with the same field shapes as `test/helpers/fixtures.ts`
  (`owner_ids`, `shares` via `computeShares`, `created_at`/`updated_at`, `paid_by`), plus people,
  budgets, cards, a property, and rental payments — pre-loaded into the in-memory client
  (`lib/testdata/memory-client.ts`) so `loadAll()` returns them unchanged.

## 3. State transitions

```
(flags off) ──enable Use test data──▶ (test data)      : swap data source to in-memory seed
(test data) ──disable Use test data─▶ (flags off)      : restore live bootstrap (real data intact)
(flags off) ──enable Bypass auth────▶ (bypass+test)    : skip auth gate + seed in-memory (implies test data)
(bypass)    ──disable Bypass auth───▶ (flags off)      : restore normal auth gate; real session (if any) untouched
```

Transitions re-initialize the data layer cleanly (re-seed / re-bootstrap, or a prompted relaunch on
iOS for the session-less direction). Live and test rows are never blended in one session.
