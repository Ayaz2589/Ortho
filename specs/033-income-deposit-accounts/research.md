# Research: Income Deposit Accounts (spec 033)

## Decision 1 — Storage approach for deposit account names on transactions

**Decision**: Reuse the existing `transactions.source` text column. No new FK or column needed.

**Rationale**: `cards` already works identically — the card name is stored as a free-text string in `source`, not an FK to `cards.id`. Deleting a card leaves the name verbatim on past transactions. The same orphan-value passthrough applies to deposit accounts: a deleted account name stays on the stored transaction, and the form shows it as-is when editing. This avoids a non-trivial migration to `transactions` and keeps the write path simple.

**Alternatives considered**:
- Add `deposit_account_id UUID NULL FK → deposit_accounts.id` — rejected: would require a migration to transactions (the largest table), creates a nullable FK that income-only transactions must null-check, and diverges from how cards work. The name-as-string model is already proven and accepted.

---

## Decision 2 — Table structure for `deposit_accounts`

**Decision**: Mirror `cards` exactly: `id uuid PK, household_id uuid FK → households, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`. Same RLS policy shape (member select/insert/update/delete).

**Rationale**: `cards` is the precedent for household-scoped, user-managed name lists. Copying its structure and RLS keeps the DB surface minimal and makes the store + UI code a near-direct copy.

**Alternatives considered**:
- Add a `kind` enum (checking / savings / brokerage) — rejected: unnecessary complexity for v1; free-form naming is sufficient and matches how the user described it ("Chase Checking", "Joint Savings").

---

## Decision 3 — Fallback when no deposit accounts configured

**Decision**: Show "No accounts yet" placeholder in the "Deposit to" picker (mirrors "No cards yet" for expenses). Remove the hardcoded `INCOME_SOURCES` constant entirely; no fallback to the old strings.

**Rationale**: The hardcoded `['ACH · Checking', 'ACH · Joint', 'Wire']` list was a temporary convenience. Keeping it as a fallback would mean users who never configure accounts silently use the hardcoded names, making it unclear whether the feature is working. Clean removal is honest.

**Alternatives considered**:
- Seed the hardcoded names as default deposit accounts on first household creation — rejected: overly opinionated; users should name their own accounts.
- Keep hardcoded strings as fallback until accounts are configured — rejected: makes onboarding state ambiguous.

---

## Decision 4 — Fail-open vs fail-loud for `deposit_accounts` in `loadAll`

**Decision**: Fail-open (like `tags`, `linked_institutions`, `goals`) — if the table doesn't exist yet (PGRST205 / 42P01), treat as empty array, no error.

**Rationale**: The deploy-before-migrate window means `loadAll` runs before `supabase db push` applies the migration. A hard fail would take down the whole bootstrap for all users. The same pattern is already used for every post-v1 additive table.

---

## Decision 5 — i18n key strategy for new strings

**Decision**: Add 5 new translation keys:
- `'Deposit Accounts'` — Settings section title + page header
- `'Add account'` — Add row label + modal confirm button
- `'New account'` — Modal title
- `'No accounts yet'` — Empty-state picker label
- `'e.g. Chase Checking'` — Name field placeholder in modal
- `'Accounts appear in the Deposit to menu when you log income. Existing transactions keep their original account name.'` — Helper copy below the list

**Rationale**: Mirrors the exact card strings (`'Cards'`, `'Add card'`, `'New card'`, `'No cards yet'`, `'e.g. Chase Freedom'`, the helper paragraph). Using parallel structure keeps translator mental load low.
