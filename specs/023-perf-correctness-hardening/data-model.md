# Data Model — Spec 023

**No database schema change.** This feature adds no tables, columns, enums, or RPCs. What follows is
the set of existing entities/invariants the work touches, and the type-level shapes introduced at the
client boundary (compile-time only).

## Existing invariants this feature protects or corrects

### Split shares (US1 / FR-001, FR-008) — the #1 money invariant
- **Shape**: a transaction carries `amount_cents` (integer USD cents) and a per-owner `shares` map
  (`Record<personId, cents>`), reconstructed from `transaction_shares` rows.
- **Invariant**: `sum(shares.values) === amount_cents`, always, enforced by the client (not SQL).
- **Correction**: the invariant must hold after editing a value-split in any display currency, and a
  no-op edit must not mutate it (D6). A write failure must never persist a state that breaks it (D11).
- **Authority rule**: integer cents are authoritative; the display-currency string is presentation
  only and must never round-trip back into stored shares.

### Budget-insight reference date (US3 / FR-003)
- **Shape**: the `now: Date` passed into `generateInsights(...)`, and the derived `dayOfMonth`,
  `daysLeft`, `monthProgress`.
- **Invariant (corrected)**: for a selected month, these derive from that month's real elapsed time —
  a completed past month is fully elapsed (`daysLeft` = 0 / "over"), the current month uses today.
  The default (current-month) path is unchanged.

### Session (US4 / FR-005, FR-006, FR-011)
- **Shape**: the Supabase auth session (Keychain-persisted on iOS, spec 021); the biometric gate state
  (`locked` | `unlocking` | `unlocked`) in `lib/biometricGate.ts`.
- **Invariants (corrected)**:
  - Foreground re-validation calls the server (`getUser`), so a server-revoked session is caught even
    within the local access-token TTL (FR-006).
  - The biometric lock is an overlay over a **kept-mounted** provider — unlocking preserves loaded
    data, scroll, open modals, and in-progress form input; no re-bootstrap (FR-005).
  - `unlocking` is not re-entered while an unlock is in flight; transient interruptions don't
    re-trigger it (FR-011).

## Type-level shapes introduced (compile-time only, no runtime schema)

### Supabase row → domain boundary (US7 / FR-018)
- **`Database` types** (preferred): generated `lib/supabase/database.types.ts`; the browser client is
  `SupabaseClient<Database>`. Row types (`Tables<'transactions'>`, `Tables<'transaction_shares'>`,
  `Tables<'users'>`, …) replace the `data as T[]` / `(m: any)` casts in `loadAll`.
- **Typed mapper fallback**: hand-written `Row` interfaces mirroring `supabase/migrations` columns +
  a mapper module (`rowToTransaction`, `rowToPerson`, …) at the load boundary. Either way the
  compiler rejects a column/enum rename.
- **Rule**: the projected `select(<columns>)` (D5) column lists and the `Row` types are kept in
  lockstep — a dropped/renamed column is a compile error, not a runtime `undefined`.

### `Transaction` transfer accessor (US7 / FR-019)
- **Guard**: `isTransfer(tx): tx is TransferTx` — narrows on `kind === 'transfer'`.
- **Accessor**: `transferParties(tx): { from: PersonId; to: PersonId }` — the single source for the
  transfer from/to, replacing scattered `owner_ids[0]` / `paid_by ? … : '—'` idioms.
- **Rule**: no call site indexes `owner_ids` or branches `kind === 'transfer'` directly once routed
  through the accessor; invalid shapes (a transfer with two owners, a spend with empty owners) become
  representable-but-centralized, checked in one place.

### Translation catalog loading (US2 / FR-012, FR-021)
- **Shape**: `Catalog = Record<string, string>` per language; `t(key) → string`.
- **States**: `unloaded` (default-language identity `t`), `loading` (identity until the dynamic
  `import()` resolves), `loaded` (active-language catalog in effect). English/default users stay in
  `unloaded` forever (no fetch).
- **Rule (reachability)**: every key in every catalog is reachable from a `t()` call or an allowlisted
  dynamic source; the guard test (FR-021) is the enforcement.

## Regression-vector impact

- **`lib/finance/insights.ts` (D7/B2)**: the corrected month-select reference changes vectored output
  for **month-select inputs only** (day-count / rule-selection fields). Regenerate
  `shared/test-vectors/*` for the affected fixtures and **review the diff** — current-month/default
  inputs must be unchanged; a diff there signals an unintended behavior change.
- **All other engines** (`money`, `currency`, `splits`, `balances`, `mortgage`, `housing`,
  `transactionFilters`): **no output change** — P2 (formatter cache) and the refactors are
  byte-identical, so their vectors must stay green with no regeneration.
