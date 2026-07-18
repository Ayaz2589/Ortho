-- Ortho — authorization + validation regression test for public.upsert_transaction
-- (spec 027-ledger-atomic-persistence). Tests the ALREADY-APPLIED migration
-- function against the live local Supabase Postgres — the layer the mock-based
-- vitest suites cannot reach (they never execute the real SQL).
--
-- Why this exists: the RPC is a SECURITY DEFINER money-write. Its authorization
-- lives entirely in SQL (EXECUTE grants + the inline guard), so it needs a SQL
-- test. A prior revision shipped anon-executable and share-less-writable; these
-- scenarios lock that shut.
--
-- HOW TO RUN (local stack up, `supabase start`):
--   docker exec -i -e PGPASSWORD=postgres supabase_db_<project> \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/upsert_transaction_authz.sql
-- (find <project> via `docker ps --format '{{.Names}}' | grep supabase_db`)
--
-- Exit status is non-zero and the final statement RAISEs if any scenario fails.
-- The test creates and then deletes its own fixtures; it does not touch real data.

\set ON_ERROR_STOP on

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- HH-A: owner A (uA), non-owner member C (uC).   HH-B: owner B (uB).
insert into auth.users (id, instance_id) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000'),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000') on conflict do nothing;
insert into public.users (id,name,initial,color_key,created_at) values
  ('11111111-1111-1111-1111-111111111111','A','A','sage', now()),
  ('22222222-2222-2222-2222-222222222222','B','B','slate',now()),
  ('33333333-3333-3333-3333-333333333333','C','C','sand', now()) on conflict do nothing;
insert into public.households (id,owner_id,name,created_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','HH-A',now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','HH-B',now()) on conflict do nothing;
insert into public.household_members (household_id,user_id,role,created_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','owner', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','owner', now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','member',now()) on conflict do nothing;
insert into public.household_people (id,household_id,name,initial,color_key,linked_user_id,sort_order,created_at) values
  ('a1a1a1a1-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A','A','sage', '11111111-1111-1111-1111-111111111111',0,now()),
  ('a2a2a2a2-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','C','C','sand', '33333333-3333-3333-3333-333333333333',1,now()),
  ('b1b1b1b1-0000-0000-0000-000000000003','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B','B','slate','22222222-2222-2222-2222-222222222222',0,now()) on conflict do nothing;

-- Seed a real transaction in HH-B (via the trusted service role) for the
-- cross-household tamper test.
set role service_role;
select set_config('request.jwt.claims','',true);
select public.upsert_transaction(
  '{"id":"b0000000-0000-0000-0000-0000000000b1","household_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","merchant":"B-ORIGINAL","category":"groceries","kind":"expense","amount_cents":500,"source":"","date":"2026-07-01T12:00:00Z","created_by":"22222222-2222-2222-2222-222222222222"}'::jsonb,
  '[{"person_id":"b1b1b1b1-0000-0000-0000-000000000003","amount_cents":500}]'::jsonb);
reset role;

-- ── Scenario matrix ──────────────────────────────────────────────────────────
do $test$
declare
  cA text := '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  cB text := '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  cC text := '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
  fails int := 0;
  got text;
begin
  -- S1 privileges: anon must NOT execute; authenticated + service_role must.
  if has_function_privilege('anon','public.upsert_transaction(jsonb,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.upsert_transaction(jsonb,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.upsert_transaction(jsonb,jsonb)','EXECUTE')
  then fails:=fails+1; raise warning 'S1 privileges: FAIL'; else raise notice 'S1 privileges: PASS'; end if;

  -- S2 anon cannot execute (EXECUTE revoked).
  begin
    set local role anon;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a2","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","amount_cents":1,"merchant":"x","category":"groceries","kind":"expense","source":"","date":"2026-07-01T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":1}]'::jsonb);
    reset role; fails:=fails+1; raise warning 'S2 anon-execute: FAIL (allowed)';
  exception when others then reset role; raise notice 'S2 anon-execute blocked: PASS'; end;

  -- S3 member creates a transaction in their household.
  begin
    perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a1","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"A-T1","category":"groceries","kind":"expense","amount_cents":100,"source":"","date":"2026-07-01T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":100}]'::jsonb);
    reset role; perform set_config('request.jwt.claims','',true);
    if exists(select 1 from transactions where id='a0000000-0000-0000-0000-0000000000a1')
       and (select amount_cents from transaction_shares where transaction_id='a0000000-0000-0000-0000-0000000000a1')=100
    then raise notice 'S3 member create: PASS'; else fails:=fails+1; raise warning 'S3 member create: FAIL'; end if;
  exception when others then reset role; fails:=fails+1; raise warning 'S3 member create: FAIL (%)', sqlerrm; end;

  -- S4 sum mismatch rejected.
  begin
    perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a9","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"bad","category":"groceries","kind":"expense","amount_cents":100,"source":"","date":"2026-07-01T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":90}]'::jsonb);
    reset role; fails:=fails+1; raise warning 'S4 sum-mismatch: FAIL (accepted)';
  exception when others then reset role;
    if sqlstate='23514' then raise notice 'S4 sum-mismatch rejected: PASS'; else fails:=fails+1; raise warning 'S4 wrong sqlstate %', sqlstate; end if; end;

  -- S5/S6/S7 empty / null / non-array shares rejected (no share-less rows).
  begin perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a8","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"b","category":"groceries","kind":"expense","amount_cents":0,"source":"","date":"2026-07-01T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb,'[]'::jsonb);
    reset role; fails:=fails+1; raise warning 'S5 empty-shares: FAIL';
  exception when others then reset role; raise notice 'S5 empty-shares rejected: PASS'; end;
  begin perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a7","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"b","category":"groceries","kind":"expense","amount_cents":0,"source":"","date":"2026-07-01T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb, null);
    reset role; fails:=fails+1; raise warning 'S6 null-shares: FAIL (share-less row!)';
  exception when others then reset role; raise notice 'S6 null-shares rejected: PASS'; end;
  begin perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a6","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"b","category":"groceries","kind":"expense","amount_cents":0,"source":"","date":"2026-07-01T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb,'{}'::jsonb);
    reset role; fails:=fails+1; raise warning 'S7 nonarray-shares: FAIL';
  exception when others then reset role; raise notice 'S7 nonarray-shares rejected: PASS'; end;

  -- S8 non-member cannot create in another household.
  begin perform set_config('request.jwt.claims',cB,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a5","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"intruder","category":"groceries","kind":"expense","amount_cents":100,"source":"","date":"2026-07-01T12:00:00Z","created_by":"22222222-2222-2222-2222-222222222222"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":100}]'::jsonb);
    reset role; fails:=fails+1; raise warning 'S8 non-member create: FAIL';
  exception when others then reset role; raise notice 'S8 non-member create blocked: PASS'; end;

  -- S9 created_by cannot be spoofed on insert.
  begin perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a4","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"spoof","category":"groceries","kind":"expense","amount_cents":100,"source":"","date":"2026-07-01T12:00:00Z","created_by":"22222222-2222-2222-2222-222222222222"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":100}]'::jsonb);
    reset role; fails:=fails+1; raise warning 'S9 created_by-spoof: FAIL';
  exception when others then reset role; raise notice 'S9 created_by-spoof blocked: PASS'; end;

  -- S10 a member of HH-A cannot overwrite HH-B's transaction by id.
  begin perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"b0000000-0000-0000-0000-0000000000b1","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"HIJACKED","category":"dining","kind":"expense","amount_cents":999,"source":"","date":"2026-07-01T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":999}]'::jsonb);
    reset role;
  exception when others then reset role; end;
  select merchant into got from transactions where id='b0000000-0000-0000-0000-0000000000b1';
  if got='B-ORIGINAL' then raise notice 'S10 cross-household overwrite blocked: PASS'; else fails:=fails+1; raise warning 'S10 cross-household overwrite: FAIL (B now %)', got; end if;

  -- S11 a non-owner member cannot edit another member's transaction.
  begin perform set_config('request.jwt.claims',cC,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a1","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"C-EDIT","category":"dining","kind":"expense","amount_cents":100,"source":"","date":"2026-07-01T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":100}]'::jsonb);
    reset role;
  exception when others then reset role; end;
  select merchant into got from transactions where id='a0000000-0000-0000-0000-0000000000a1';
  if got='A-T1' then raise notice 'S11 non-owner edit blocked: PASS'; else fails:=fails+1; raise warning 'S11 non-owner edit: FAIL (now %)', got; end if;

  -- S12 a household owner CAN edit a member's transaction.
  begin perform set_config('request.jwt.claims',cC,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a3","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"C-T3","category":"groceries","kind":"expense","amount_cents":200,"source":"","date":"2026-07-01T12:00:00Z","created_by":"33333333-3333-3333-3333-333333333333"}'::jsonb,'[{"person_id":"a2a2a2a2-0000-0000-0000-000000000002","amount_cents":200}]'::jsonb);
    reset role;
  exception when others then reset role; fails:=fails+1; raise warning 'S12a member create own: FAIL (%)', sqlerrm; end;
  begin perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a3","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"OWNER-EDIT","category":"groceries","kind":"expense","amount_cents":200,"source":"","date":"2026-07-01T12:00:00Z","created_by":"33333333-3333-3333-3333-333333333333"}'::jsonb,'[{"person_id":"a2a2a2a2-0000-0000-0000-000000000002","amount_cents":200}]'::jsonb);
    reset role;
    select merchant into got from transactions where id='a0000000-0000-0000-0000-0000000000a3';
    if got='OWNER-EDIT' then raise notice 'S12 owner edits member tx: PASS'; else fails:=fails+1; raise warning 'S12 owner edit: FAIL'; end if;
  exception when others then reset role; fails:=fails+1; raise warning 'S12 owner edit: FAIL (%)', sqlerrm; end;

  -- S13 service_role (CLI --admin) writes regardless of membership.
  begin perform set_config('request.jwt.claims','',true); set local role service_role;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000c1","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"CLI-IMPORT","category":"groceries","kind":"expense","amount_cents":300,"source":"","date":"2026-07-01T12:00:00Z","created_by":"22222222-2222-2222-2222-222222222222"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":300}]'::jsonb);
    reset role;
    if exists(select 1 from transactions where id='a0000000-0000-0000-0000-0000000000c1') then raise notice 'S13 service_role import: PASS'; else fails:=fails+1; raise warning 'S13 service_role import: FAIL'; end if;
  exception when others then reset role; fails:=fails+1; raise warning 'S13 service_role import: FAIL (%)', sqlerrm; end;

  -- S14 idempotent re-upsert (single row, updated shares).
  begin perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000a1","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"A-T1-UPD","category":"dining","kind":"expense","amount_cents":150,"source":"","date":"2026-07-02T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":150}]'::jsonb);
    reset role;
    if (select count(*) from transactions where id='a0000000-0000-0000-0000-0000000000a1')=1
       and (select amount_cents from transaction_shares where transaction_id='a0000000-0000-0000-0000-0000000000a1')=150
    then raise notice 'S14 idempotent update: PASS'; else fails:=fails+1; raise warning 'S14 idempotent update: FAIL'; end if;
  exception when others then reset role; fails:=fails+1; raise warning 'S14 idempotent update: FAIL (%)', sqlerrm; end;

  -- S15 duplicate person_id is rejected and atomically rolled back (no leak).
  begin perform set_config('request.jwt.claims',cA,true); set local role authenticated;
    perform public.upsert_transaction('{"id":"a0000000-0000-0000-0000-0000000000d1","household_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","merchant":"dup","category":"groceries","kind":"expense","amount_cents":100,"source":"","date":"2026-07-01T12:00:00Z","created_by":"11111111-1111-1111-1111-111111111111"}'::jsonb,'[{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":50},{"person_id":"a1a1a1a1-0000-0000-0000-000000000001","amount_cents":50}]'::jsonb);
    reset role; fails:=fails+1; raise warning 'S15 dup-person: FAIL (accepted)';
  exception when others then reset role;
    if exists(select 1 from transactions where id='a0000000-0000-0000-0000-0000000000d1')
    then fails:=fails+1; raise warning 'S15 dup-person: FAIL (row leaked)';
    else raise notice 'S15 dup-person rejected + rolled back: PASS'; end if;
  end;

  if fails > 0 then
    raise exception 'upsert_transaction authz test: % scenario(s) FAILED', fails;
  else
    raise notice 'upsert_transaction authz test: ALL 15 scenarios PASSED';
  end if;
end $test$;

-- ── Cleanup ──────────────────────────────────────────────────────────────────
delete from public.transaction_shares where transaction_id in (select id from public.transactions where household_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
delete from public.transactions   where household_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from public.household_people where household_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from public.household_members where household_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from public.households      where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from public.users           where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
delete from auth.users             where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
