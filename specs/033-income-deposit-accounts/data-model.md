# Data Model: Income Deposit Accounts (spec 033)

## New Table: `deposit_accounts`

Mirrors `cards` exactly.

```sql
create table public.deposit_accounts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now()
);

create index deposit_accounts_household_idx on public.deposit_accounts (household_id);

alter table public.deposit_accounts enable row level security;

create policy deposit_accounts_member_select on public.deposit_accounts
  for select using (is_household_member(household_id));
create policy deposit_accounts_member_insert on public.deposit_accounts
  for insert with check (is_household_member(household_id));
create policy deposit_accounts_member_update on public.deposit_accounts
  for update using (is_household_member(household_id));
create policy deposit_accounts_member_delete on public.deposit_accounts
  for delete using (is_household_member(household_id));
```

## No changes to `transactions`

`transactions.source` (text, NOT NULL, default `''`) already stores the name string. Income transactions store the deposit account name there, exactly as expense transactions store the card name.

## Domain Types (`web/lib/types.ts`)

```typescript
export interface DepositAccount {
  id: string
  household_id: string
  name: string
  created_at: string
}
```

## Row Type (`web/lib/supabase/rows.ts`)

```typescript
export interface DepositAccountRow {
  id: string
  household_id: string
  name: string
  created_at: string
}
```

## Store additions (`web/lib/store.tsx`)

New state slice alongside `cards`:
```typescript
depositAccounts: DepositAccount[]
addDepositAccount: (name: string) => void
deleteDepositAccount: (id: string) => void
```

`loadAll` — add `depositAccountsRes` to the fan-out, fail-open (same guard as `tags`):
```typescript
supabase.from('deposit_accounts').select('*').order('created_at', { ascending: true })
```

## TxForm changes (`web/components/web/TxForm.tsx`)

Remove:
```typescript
const INCOME_SOURCES = ['ACH · Checking', 'ACH · Joint', 'Wire']
```

Replace:
```typescript
const { depositAccounts, ... } = useApp()
const incomeSources = useMemo(() => depositAccounts.map((a) => a.name), [depositAccounts])
const sources = isIncome ? incomeSources : expenseSources
```

The `source` state default for income (currently `INCOME_SOURCES[0]`) becomes `incomeSources[0] ?? ''`.

## New files

| Path | Description |
|------|-------------|
| `supabase/migrations/20260730120000_deposit_accounts.sql` | Table + index + RLS |
| `web/components/settings/AddDepositAccountModal.tsx` | Add-account modal (mirrors AddCardModal) |
| `web/app/(app)/settings/deposit-accounts/page.tsx` | Settings page (mirrors cards/page.tsx) |

## Changed files

| Path | Change |
|------|--------|
| `web/lib/types.ts` | + `DepositAccount` interface |
| `web/lib/supabase/rows.ts` | + `DepositAccountRow` interface |
| `web/lib/store.tsx` | + state, actions, `loadAll` fan-out |
| `web/components/web/TxForm.tsx` | Remove `INCOME_SOURCES`; use `depositAccounts` from store |
| `web/app/(app)/settings/page.tsx` | + Deposit Accounts navigation entry |
| `web/lib/i18n/en.ts` + 5 other locale files | + 6 new translation keys |
