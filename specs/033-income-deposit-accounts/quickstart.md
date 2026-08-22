# Quickstart: Income Deposit Accounts (spec 033)

## Prerequisites

- Sandbox bootstrapped (`supabase start`, `web/.env.local` written)
- `cd web && npm ci`

## 1. Apply the migration

```bash
# From repo root
supabase db reset   # replays all migrations including the new one
# OR (incremental, if you don't want to wipe seed data):
supabase migration up
```

Verify:
```bash
supabase db query "select count(*) from deposit_accounts;"
# → 0 (table exists, empty)
```

## 2. Run the test suite

```bash
cd web && npm test
```

All tests must pass (green). The new tests covering deposit accounts are:

- `test/store/deposit-accounts.test.tsx` — `addDepositAccount` / `deleteDepositAccount` optimistic CRUD + rollback
- `test/transactions/tx-form-income-deposit.test.tsx` — "Deposit to" dropdown shows configured accounts; empty state; orphan passthrough; direction-switch resets source

## 3. Manual smoke test

```bash
cd web && npm run dev
```

1. **Settings → Deposit Accounts**: tap "Add account", enter "Chase Checking", tap Add → appears in list. Add "Joint Savings". Delete "Chase Checking" → removed.
2. **New transaction → Income**: "Deposit to" dropdown shows "Joint Savings" (only). Pick it, save. Reopen → "Deposit to" still shows "Joint Savings".
3. **New transaction → Expense**: "Paid with" still shows cards, not deposit accounts.
4. **Direction toggle**: Start as Expense → switch to Income → "Deposit to" shows deposit accounts. Switch back → "Paid with" shows cards.
5. **No accounts configured**: delete all deposit accounts → "Deposit to" shows "No accounts yet" placeholder.

## 4. i18n smoke test

Open Settings → Deposit Accounts in each of the 6 supported languages (via the language picker in Settings) and verify headings, labels, and placeholder text are translated (not showing the English key).

## Expected outcomes

- Deposit Accounts list in Settings: add/delete works, persists across reload
- Income "Deposit to" picker: reactive (shows new accounts without reload), orphan-safe
- Expense flow: completely unchanged
- `npm test`: green with new coverage
