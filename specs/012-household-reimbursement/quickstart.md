# Quickstart / Validation: Household reimbursement & settle-up

How to prove the feature works end-to-end. Reference data is injected in tests (never the real clock).

## Prerequisites

- Node ≥ 22 for web tooling: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"`. Run `vitest`/`gen:vectors` with the Bash sandbox disabled (tsx/vitest IPC).
- Xcode for iOS.
- The Supabase migration applied to the dev/local DB (and, at deploy time, the production project): `supabase/migrations/20260618120000_member_reimbursement.sql`.

## 1. Migration

Apply `20260618120000_member_reimbursement.sql` and confirm: `transactions.paid_by` exists; `transaction_kind` and `transaction_category` both include `transfer`; existing expenses have `paid_by` set to their creator's person. Additive + reversible.

## 2. Shared balance logic (golden vectors)

```bash
cd web && npm run gen:vectors
git diff --stat shared/test-vectors/
```

Expected: a **new** `shared/test-vectors/member-balance.json`; **no diff** to existing vector files (`transaction-splits.json` etc. unchanged — `computeShares` is not touched).

## 3. Automated suites (both green)

```bash
cd web && npm test                       # Vitest: balanceBetween parity (member-balance.json) + unit;
                                          # transfer excluded from spend/income/budget/per-owner; form behavior
cd ../iOS && xcodebuild test -scheme Ortho-iOS -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

Expected: prior tests still pass; new balance/transfer tests pass on both; iOS asserts the same `member-balance.json`.

## 4. Manual worked example (each surface)

1. **Who paid** — add an expense; confirm "Paid by" defaults to you; change it and confirm it persists through save + reload. ✅ US1.
2. **Balance** — add a $150 expense split **you $100 / Tasnuva $50, paid by you**; the balance reads "**Tasnuva owes you $50**". ✅ US2.
3. **Settle up** — tap "Settle up"; the transfer pre-fills Tasnuva → you, $50; save; the balance becomes "**Settled**". ✅ US3.
4. **No pollution** — confirm spending, income, budgets, insights, and the per-owner breakdown are **unchanged** by the reimbursement. ✅ SC-003.
5. **Activity** — the reimbursement shows as "**Tasnuva → Ayaz $50**", distinct from expenses/income; the expense detail shows "Paid by Ayaz". ✅ US3.
6. **Parity** — the same data yields the same balance/direction on iOS and web. ✅ SC-004.
7. **Edge** — an expense Tasnuva paid that only she owns contributes nothing; an expense you paid that only Tasnuva owns → she owes you the full amount; an over-reimbursement flips the direction.

## Done when

- New `member-balance.json` present; existing vectors unchanged.
- `npm test` (web) and `xcodebuild test` (iOS) both green.
- Manual steps 1–7 pass on both surfaces.
- PARITY.md updated.
