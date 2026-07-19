-- Ortho — budget rollover & bucket types (spec 027)
-- Created: 2026-07-19
--
-- Adds a bucket TYPE and an optional rollover cap to budgets, powering the
-- rollover engine (lib/finance/budgets.ts). Additive + backward-compatible:
-- every existing row defaults to 'fixed', preserving today's reset-monthly
-- behavior and identical insights. Carry is derived from transaction history at
-- render time — nothing is stored here beyond the configuration.
--
--   fixed        — resets every month (the pre-027 behavior; no carry).
--   flex         — unused remainder rolls forward (overspend forgiven);
--                  rollover_cap_cents optionally caps the accumulated surplus.
--   non_monthly  — signed sinking fund: base accrues each month, surplus and
--                  shortfall both carry (uncapped).

create type public.budget_type as enum ('fixed', 'flex', 'non_monthly');

alter table public.budgets
  add column budget_type public.budget_type not null default 'fixed',
  add column rollover_cap_cents bigint
    check (rollover_cap_cents is null or rollover_cap_cents >= 0);

comment on column public.budgets.budget_type is
  'Rollover behavior (spec 027): fixed=reset monthly; flex=surplus rolls forward, overspend forgiven; non_monthly=signed sinking fund.';
comment on column public.budgets.rollover_cap_cents is
  'Flex-only cap (USD cents) on accumulated carry; null = uncapped. Ignored for other types.';
