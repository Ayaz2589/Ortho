-- ============================================================================
-- Fix: household_members INSERT privilege-escalation gap (broken access control)
-- ============================================================================
--
-- The initial-schema policy (20260521120000) was:
--
--   with check (
--     public.is_household_owner(household_id)
--     or (user_id = auth.uid() and role = 'owner')
--   )
--
-- The second branch exists so a household CREATOR can self-insert their own
-- owner-role membership row at creation time (is_household_owner is false then,
-- because it reads household_members and no member row exists yet). But that
-- branch imposed NO link between the row's household_id and a household the
-- caller legitimately owns. Because RLS is the sole authorization layer and
-- household UUIDs are not secret (they travel in invite deep-links, shared URLs,
-- screenshots, logs), ANY authenticated user who learned a victim household's id
-- could POST /rest/v1/household_members {household_id: <victim>, user_id: <self>,
-- role: 'owner'} and become an OWNER of that household — gaining read/write/delete
-- over all its transactions, people, budgets, properties, and linked banks.
--
-- Fix: gate the self-insert branch on the caller actually owning the target
-- household at the `households` level. The creation flow is unaffected: a creator
-- inserts households (owner_id = auth.uid(), enforced by households_insert) BEFORE
-- self-inserting their membership, so the ownership check is satisfied at creation
-- time. The accept_invite() SECURITY DEFINER RPC (the invitee path) bypasses RLS
-- and is unaffected. is_household_owner(household_id) still covers an existing
-- owner adding rows.
--
-- The ownership check MUST be a SECURITY DEFINER helper, not an inline
-- `exists (select ... from households)`: an inline subquery is evaluated under the
-- CALLER's RLS, and during household creation the caller is not yet a member, so
-- households_select (member-only) hides the just-inserted row and the check would
-- wrongly fail (chicken-and-egg). The definer helper reads households.owner_id
-- with RLS bypassed, mirroring is_household_member/is_household_owner. It still
-- sees the row inserted earlier in the same transaction.

create or replace function public.is_household_record_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.households
     where id = p_household_id
       and owner_id = auth.uid()
  );
$$;

drop policy if exists household_members_insert on public.household_members;

create policy household_members_insert on public.household_members
  for insert with check (
    public.is_household_owner(household_id)
    or (
      user_id = auth.uid()
      and role = 'owner'
      and public.is_household_record_owner(household_id)
    )
  );
