-- Ortho — atomic transaction + shares upsert  (spec 027-ledger-atomic-persistence)
-- Created: 2026-07-18
--
-- Replaces the client-side two-step write (INSERT transactions, then INSERT
-- transaction_shares) + compensating rollback with a single PL/pgSQL function
-- that commits both writes atomically — or rolls back both on any failure.
--
-- The function also validates the shares-sum invariant inline, so the database
-- rejects any payload where sum(shares.amount_cents) ≠ transaction.amount_cents
-- before a single row is written.
--
-- Design decisions: specs/027-ledger-atomic-persistence/research.md

-- ── Pre-migration audit ──────────────────────────────────────────────────────
-- Count existing share-less transaction rows and surface as a NOTICE.
-- This migration does NOT modify historical data; operator remediation is
-- required if the count is non-zero (specs/027-ledger-atomic-persistence/research.md D6).
do $$
declare v_count bigint;
begin
  select count(*) into v_count
    from public.transactions t
   where not exists (
     select 1 from public.transaction_shares s where s.transaction_id = t.id
   );
  raise notice 'upsert_transaction migration: % share-less transaction row(s) found (pre-existing; not modified by this migration)', v_count;
end $$;

-- ── upsert_transaction ───────────────────────────────────────────────────────
-- Atomically upsert one transaction and replace all of its share rows.
--
-- Security: security definer (bypasses RLS on both tables) with an explicit
-- household-membership guard that mirrors the existing RLS policies.
-- auth.uid() is NULL in service-role / admin-mode contexts, so the guard is
-- skipped for those callers — matching the RLS bypass the service-role key
-- already grants on direct table writes.
create or replace function public.upsert_transaction(
  p_tx     jsonb,   -- transaction fields (see contracts/upsert_transaction.md)
  p_shares jsonb    -- array of {person_id, amount_cents}
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         uuid   := (p_tx->>'id')::uuid;
  v_hh_id      uuid   := (p_tx->>'household_id')::uuid;
  v_amount     bigint := (p_tx->>'amount_cents')::bigint;
  v_shares_sum bigint;
begin
  -- Auth guard: re-implements the RLS membership check for authenticated callers.
  -- Skipped when auth.uid() is NULL (service-role / admin mode) — those callers
  -- bypass RLS at the connection level and do not need this check.
  if auth.uid() is not null and not public.is_household_member(v_hh_id) then
    raise exception 'UNAUTHORIZED: not a member of household %', v_hh_id
      using errcode = 'insufficient_privilege';
  end if;

  -- Validate: shares array must be non-empty.
  if jsonb_array_length(p_shares) < 1 then
    raise exception 'NO_SHARES: transaction must have at least one owner share'
      using errcode = 'check_violation';
  end if;

  -- Validate: sum(shares.amount_cents) must equal the transaction amount.
  select coalesce(sum((s->>'amount_cents')::bigint), 0)
    into v_shares_sum
    from jsonb_array_elements(p_shares) as s;

  if v_shares_sum != v_amount then
    raise exception 'SHARES_MISMATCH: shares sum % != transaction amount %', v_shares_sum, v_amount
      using errcode = 'check_violation';
  end if;

  -- Upsert the transaction row.
  -- Immutable columns (id, household_id, created_by, created_at) are excluded
  -- from the DO UPDATE set so re-upserts cannot change ownership or creation time.
  insert into public.transactions (
    id, household_id, merchant, category, kind, amount_cents,
    source, date, created_by, paid_by, updated_at
  ) values (
    v_id,
    v_hh_id,
    p_tx->>'merchant',
    (p_tx->>'category')::transaction_category,
    (p_tx->>'kind')::transaction_kind,
    v_amount,
    coalesce(p_tx->>'source', ''),
    (p_tx->>'date')::timestamptz,
    (p_tx->>'created_by')::uuid,
    nullif(p_tx->>'paid_by', '')::uuid,
    now()
  )
  on conflict (id) do update set
    merchant     = excluded.merchant,
    category     = excluded.category,
    kind         = excluded.kind,
    amount_cents = excluded.amount_cents,
    source       = excluded.source,
    date         = excluded.date,
    paid_by      = excluded.paid_by,
    updated_at   = now();

  -- Replace share rows atomically (delete-then-insert within this function call;
  -- Postgres guarantees all three DML statements commit together or not at all).
  delete from public.transaction_shares
   where transaction_id = v_id;

  insert into public.transaction_shares (transaction_id, person_id, amount_cents)
  select v_id,
         (s->>'person_id')::uuid,
         (s->>'amount_cents')::bigint
    from jsonb_array_elements(p_shares) as s;
end;
$$;
