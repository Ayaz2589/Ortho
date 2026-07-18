# Quickstart & Validation Guide: Ledger Atomic Persistence

## Prerequisites

- Local Supabase stack running (`supabase start` from repo root)
- `web/.env.local` pointing at the local stack (written by bootstrap script)
- `cd web && npm ci` completed

---

## Step 1 — Apply the migration

```bash
supabase db reset   # replays all migrations including the new one
```

Verify the function exists:

```bash
supabase db execute --sql "select proname from pg_proc where proname = 'upsert_transaction';"
# Expected: one row → upsert_transaction
```

---

## Step 2 — Run the test suite (should be green)

```bash
cd web && npm test
```

All existing parity suites must remain green. The new `ledger-atomic.test.ts` suite:
- Calls `upsert_transaction` with a valid tx+shares → asserts both rows exist
- Calls with sum-mismatched shares → asserts DB returns check_violation, no rows written
- Calls with empty shares array → asserts DB returns check_violation, no rows written
- Calls `upsert_transaction` again with the same id (update path) → asserts rows replaced atomically

---

## Step 3 — Manual smoke test (web UI)

1. Start the dev server: `npm run dev`
2. Log in as a household member
3. Add a new expense split between two people — verify it appears in the ledger with the correct split
4. Edit the expense, change the amount — verify the split updates correctly
5. Open Supabase Studio (`supabase studio`) → Table editor → `transaction_shares` → confirm share rows exist and sum to `amount_cents`

---

## Step 4 — Verify the sum constraint

In Supabase Studio SQL editor (or via `supabase db execute`):

```sql
-- Attempt a direct insert that violates the invariant (bypassing the RPC)
-- This should still succeed because the constraint is enforced by the RPC,
-- not a DB-level trigger — the test confirms the RPC path is the guard.
-- The quickstart tests above are the enforcement verification.

-- Verify zero share-less rows exist after writes:
select count(*) from public.transactions t
where not exists (
  select 1 from public.transaction_shares s where s.transaction_id = t.id
);
-- Expected: 0 (for any rows written after the migration)
```

---

## Step 5 — CLI smoke test

```bash
cd web
DRY_RUN=1 npx tsx scripts/import/cli.ts --help
# Confirm CLI still starts and shows usage

# With a real CSV and credentials (use --dry-run):
DRY_RUN=1 IMPORT_EMAIL=you@example.com npx tsx scripts/import/cli.ts path/to/statement.csv --dry-run
```

---

## Expected outcomes

| Scenario | Expected |
|----------|----------|
| Valid tx + shares summing to amount | Both rows committed, no error |
| Shares sum ≠ amount | Error `23514`, zero rows written |
| Empty shares array | Error `23514`, zero rows written |
| Edit existing tx (same id) | Transaction updated, shares replaced atomically |
| CLI import of valid CSV | All transactions written with share rows; `select count(*)` query returns 0 share-less rows |
| Query for share-less rows after all writes | Returns 0 |
