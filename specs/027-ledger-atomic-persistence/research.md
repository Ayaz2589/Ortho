# Research: Ledger Atomic Persistence

## D1 — How should the RPC enforce the sum invariant?

**Decision**: Inline PL/pgSQL validation inside the RPC before any write. If `sum(shares.amount_cents) != p_tx.amount_cents` or the shares array is empty, `RAISE EXCEPTION` with `errcode = 'check_violation'`. No separate trigger is needed if all callers route through the RPC.

**Rationale**: The current aggregates RPCs (`household_owner_spend`, etc.) already use `security definer` PL/pgSQL functions called via PostgREST — this is the established pattern. An inline raise is simpler, faster, and produces a predictable error shape (`{ code: '23514', message: 'SHARES_MISMATCH …' }`) for callers to handle. A cross-table deferred constraint trigger would enforce the invariant even on direct SQL edits, but adds migration complexity and triggers on every `transaction_shares` write, not just the RPC path.

**Alternatives considered**:
- Deferrable constraint trigger: more robust against future callers that bypass the RPC, but PostgreSQL's cross-table deferred triggers require careful ordering and can cause deadlocks under concurrent updates to the same row. Deferred until a future hardening pass if needed.
- Application-layer check only: the existing pattern — exactly what this feature is eliminating.
- Generated column / materialized view: not supported for cross-table sum checks in Postgres without triggers.

---

## D2 — `security invoker` vs `security definer` for `upsert_transaction`

**Decision**: `security invoker` (the default). The function runs with the permissions of the calling user. Existing RLS policies on `transactions` and `transaction_shares` already gate by household membership — they apply naturally when the authenticated web user calls the RPC.

**Rationale**: The aggregate RPCs use `security definer` because they must read across a household's rows for a rollup — a deliberate privilege escalation. `upsert_transaction` is a point write (one transaction, its shares) on rows the caller already owns under RLS. `security invoker` is the least-privilege choice; no special escalation is needed.

**Implication for `--admin` mode (CLI)**: The CLI in service-role mode bypasses RLS at the connection level, so `security invoker` still works — the service role has full access regardless. No code change in the CLI auth path.

---

## D3 — INSERT vs INSERT … ON CONFLICT (upsert) for the transaction row

**Decision**: `INSERT … ON CONFLICT (id) DO UPDATE` (true upsert). The same RPC serves both `addTransaction` (new rows) and `updateTransaction` (existing rows).

**Rationale**: A single RPC reduces surface area. The conflict target is `id` (the primary key). The `DO UPDATE` clause updates all mutable columns and sets `updated_at = now()`. Immutable columns (`id`, `created_by`, `created_at`) are excluded from the update set. This mirrors the iOS-era all-or-nothing write and is idempotent on retry.

**Columns updated on conflict**: `merchant`, `category`, `kind`, `amount_cents`, `source`, `date`, `paid_by`, `updated_at`. `household_id` and `created_by` are immutable after creation.

---

## D4 — Share rows: replace or merge on update

**Decision**: Full replace — `DELETE … WHERE transaction_id = v_id`, then `INSERT` the new rows. This is consistent with the current `writeShares` behavior in `store.tsx`.

**Rationale**: The set of owners can change on edit (someone leaves or joins the split). A merge (DELETE orphaned, UPSERT changed) requires diffing the old and new owner sets, adding complexity with no benefit. Full replace is O(n) on the share count, which is always small (≤ household size, typically 2–4).

**Ordering**: DELETE happens first (within the function, after the parent UPSERT succeeds), then INSERT. The function is atomic so a reader between the DELETE and INSERT is not possible.

---

## D5 — Error shape returned to callers

**Decision**: Let PostgREST surface the Postgres exception as its standard `{ code, message, details, hint }` JSON error. Callers check `error.message` or `error.code === '23514'` (check_violation) to distinguish a sum-mismatch from a network or auth error.

**Rationale**: `store.tsx` already inspects `error.message` for display; the import CLI propagates error messages to the operator. No new error type is needed.

---

## D6 — Existing share-less rows (pre-migration audit)

**Decision**: The migration will run a diagnostic query and record a count of share-less transaction rows in a migration comment. If the count is non-zero, the migration logs a warning but does not fail (the RPC's invariant is forward-only; backfill is out of scope for this PR).

**Rationale**: The prior client-side rollback path succeeded for the vast majority of writes. A small tail of pre-existing share-less rows, if any, cannot be auto-corrected without knowing the intended split. Operator remediation (manual inspection or a follow-up migration) is the right path.

**SC-004 implication**: SC-004 ("all existing data readable after migration") is met because the migration adds only a function and leaves the data tables unchanged.

---

## D7 — `scope` column (initial schema vs current)

**Decision**: The `scope` column was present in the initial schema but was removed in a later migration. The RPC does not include it in the INSERT column list. The `txRecord()` shape in `store.tsx` (which the RPC mirrors) confirms the omission.

**Research finding**: `grep -r "scope" supabase/migrations/` shows `scope` referenced only in the initial schema (20260521120000) and a later drop. The current `store.tsx` `txRecord()` does not include `scope`. The RPC INSERT will match the current live schema.

---

## D8 — `paid_by` column type and nullability

**Decision**: `paid_by` is a nullable `uuid` referencing `public.household_people(id)` (added in the `household_people_and_value_splits` migration). The RPC casts `p_tx->>'paid_by'` to `uuid` with a null guard: `nullif(p_tx->>'paid_by', '')::uuid`.

**Rationale**: `store.tsx` writes `paid_by: tx.paid_by ?? null`; the CLI `txRecord()` does the same. The `nullif` guard converts both a missing key and an explicit empty string to SQL NULL, preventing a cast error on `income` and `transfer` transactions that have no payer.
