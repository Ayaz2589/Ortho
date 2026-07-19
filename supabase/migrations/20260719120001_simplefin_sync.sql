-- ============================================================================
-- Spec 028 — SimpleFIN bank-sync (connect + transaction sync)
-- ============================================================================
-- Additive + reuse-first (data-model.md). No new ledger tables, no reshaped
-- provider tables. SimpleFIN reuses linked_institutions / linked_accounts /
-- linked_institution_secrets (Vault) and the atomic upsert_transaction write
-- path (spec 027). This migration adds:
--   * per-connection sync state on linked_institutions
--   * linked_accounts.currency (SimpleFIN reports a currency per account)
--   * complete_simplefin_link() — atomic institution + Vault secret + accounts
--     (no session table: the SimpleFIN claim is synchronous, research D2)
--   * mark_simplefin_synced() — advance the sync watermark / manual clock
--
-- The generic Vault wrappers (store_/get_/delete_institution_secret) from spec
-- 024 are provider-agnostic (keyed on institution_id) and are REUSED as-is;
-- for SimpleFIN the stored secret is the Access URL (with embedded Basic-Auth).
--
-- Idempotent column adds (add ... if not exists) per the repo migration
-- conventions. The 'simplefin' enum value is committed by 20260719120000.
-- ============================================================================

-- ── Sync state (research D5) ─────────────────────────────────────────────────
alter table public.linked_institutions
  add column if not exists last_synced_at         timestamptz;
alter table public.linked_institutions
  add column if not exists last_manual_refresh_at  timestamptz;
-- Reserved for a future delta cursor — SimpleFIN has none today (date-window sync).
alter table public.linked_institutions
  add column if not exists sync_cursor             text;

comment on column public.linked_institutions.last_synced_at is
  'End (epoch/tz) of the last successful SimpleFIN sync window; drives the next start-date (spec 028).';
comment on column public.linked_institutions.last_manual_refresh_at is
  'Manual-refresh rate-limit clock (spec 028): a manual sync is refused within the cooldown.';

-- ── SimpleFIN reports a currency per account ─────────────────────────────────
alter table public.linked_accounts
  add column if not exists currency text;

comment on column public.linked_accounts.currency is
  'ISO-4217 currency reported by the provider for this account (spec 028). Display only; '
  'the ledger stores USD cents per the launch decision.';

-- ============================================================================
-- RPC — complete_simplefin_link (service_role only)
-- ============================================================================
-- One-transaction establishment of a SimpleFIN connection (research D2): the
-- institution upsert + Vault secret + account rows succeed or fail ATOMICALLY.
-- Unlike Plaid there is no session row — the claim is synchronous. On conflict
-- (provider, provider_item_id) it reactivates + replaces the secret + refreshes
-- accounts, so re-claiming the same Access URL is safe.
create or replace function public.complete_simplefin_link(
  p_household_id      uuid,
  p_created_by        uuid,
  p_provider_item_id  text,
  p_institution_name  text,
  p_access_url        text,
  p_accounts          jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inst_id uuid;
begin
  insert into public.linked_institutions
      (household_id, provider, provider_item_id, provider_institution_id,
       institution_name, created_by)
    values
      (p_household_id, 'simplefin', p_provider_item_id, null,
       coalesce(p_institution_name, ''), p_created_by)
  on conflict (provider, provider_item_id) do update
    set status           = 'active',
        disconnected_at  = null,
        institution_name = case
          when coalesce(excluded.institution_name, '') <> '' then excluded.institution_name
          else public.linked_institutions.institution_name
        end
  returning id into v_inst_id;

  -- Store (replace) the Access URL in Vault via the provider-agnostic wrapper.
  perform public.store_institution_secret(v_inst_id, p_access_url);

  -- Refresh account display metadata (currency included for SimpleFIN).
  insert into public.linked_accounts
      (institution_id, provider_account_id, name, official_name, mask,
       account_type, account_subtype, currency)
    select v_inst_id, a.provider_account_id, coalesce(a.name, ''), a.official_name,
           a.mask, coalesce(a.account_type, ''), a.account_subtype, a.currency
      from jsonb_to_recordset(coalesce(p_accounts, '[]'::jsonb))
        as a(provider_account_id text, name text, official_name text, mask text,
             account_type text, account_subtype text, currency text)
  on conflict (institution_id, provider_account_id) do update
    set name          = excluded.name,
        official_name = excluded.official_name,
        mask          = excluded.mask,
        account_type  = excluded.account_type,
        currency      = excluded.currency;

  return v_inst_id;
end;
$$;

revoke all     on function public.complete_simplefin_link(uuid, uuid, text, text, text, jsonb) from public;
grant  execute on function public.complete_simplefin_link(uuid, uuid, text, text, text, jsonb) to service_role;

-- ============================================================================
-- RPC — mark_simplefin_synced (service_role only)
-- ============================================================================
-- Advance the sync watermark after a successful window. When p_manual is true,
-- also stamp the manual-refresh clock so the cooldown (enforced in the edge
-- function) has something to read.
create or replace function public.mark_simplefin_synced(
  p_institution_id uuid,
  p_synced_at      timestamptz,
  p_manual         boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.linked_institutions
     set last_synced_at         = p_synced_at,
         last_manual_refresh_at = case when p_manual then p_synced_at else last_manual_refresh_at end
   where id = p_institution_id;
end;
$$;

revoke all     on function public.mark_simplefin_synced(uuid, timestamptz, boolean) from public;
grant  execute on function public.mark_simplefin_synced(uuid, timestamptz, boolean) to service_role;
