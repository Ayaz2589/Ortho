-- Platform lock: enforces single-device login between web and iOS.
-- When a user signs in on web, platform is set to 'web'.
-- When iOS signs in (future), it sets 'ios'.
-- The web middleware reads this table and signs out if platform = 'ios'.

create table if not exists public.platform_locks (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  platform   text not null check (platform in ('web', 'ios')),
  locked_at  timestamptz not null default now()
);

alter table public.platform_locks enable row level security;

-- Users can only read/write their own platform lock.
create policy platform_locks_self_select on public.platform_locks
  for select using (user_id = auth.uid());

create policy platform_locks_self_upsert on public.platform_locks
  for insert with check (user_id = auth.uid());

create policy platform_locks_self_update on public.platform_locks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy platform_locks_self_delete on public.platform_locks
  for delete using (user_id = auth.uid());
