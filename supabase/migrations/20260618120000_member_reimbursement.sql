-- Feature 012: household reimbursement & settle-up.
-- Records who PAID each expense and adds a member-to-member `transfer` kind, so a
-- running "who owes whom" balance is computable and settle-up reimbursements can be
-- logged. Additive + reversible. The new enum values are NOT referenced within this
-- migration (the backfill uses the existing 'expense' value + created_by), so they
-- commit cleanly before any runtime use (mirrors the 'entertainment' precedent).

-- 1. Member-to-member reimbursement kind (sender -> recipient); never spend/income.
alter type transaction_kind add value if not exists 'transfer';

-- 2. `category` is NOT NULL, so a transfer row needs a category member.
alter type transaction_category add value if not exists 'transfer';

-- 3. Who paid: for an expense, the member who fronted it (defaults to the creator);
--    for a transfer, the sender. References a household person (kept resolvable).
alter table transactions
  add column if not exists paid_by uuid references household_people(id);

-- 4. Backfill existing expenses: payer = the person linked to the row's creator.
update transactions t
set paid_by = hp.id
from household_people hp
where t.kind = 'expense'
  and t.paid_by is null
  and hp.household_id = t.household_id
  and hp.linked_user_id = t.created_by;
