# Quickstart: Validating Drift Reconciliation

Prereqs: `cd web && npm install` (on Linux-arm64 also `npm i @rolldown/binding-linux-arm64-gnu … --no-save`). iOS validates only via CI. Golden-vector regen: `cd web && npm run gen:vectors`.

## Per-story validation

**P1 — defects**
- `paid_by`: `cd web && npx vitest run test/import/persist.test.ts` → payer round-trips; a CLI expense with a payer is included in `balanceBetween`.
- OTP: `grep otp_length supabase/config.toml` → `8`; on the local stack an emailed code is enterable and sign-in completes.

**P2 — config/dead-knobs**
- `grep -rn "scope\|asUserId" Makefile web/scripts/import` → no live forwards/fields (only unrelated matches); `test -f supabase/seed.sql` (or `[db.seed] enabled=false`).

**P3 — parity + vectors**
- `cd web && npm run gen:vectors && git status --porcelain shared/test-vectors/` → ONLY `currency-names.json`, `currency-symbols.json`, `lease.json` (new) and `transaction-filters.json` (modified). Any other changed vector = unintended drift → stop.
- `cd web && npm test` → new `currency-names/-symbols/lease` parity suites + filter cases green; per-platform unit tests for money sign/decimals/rounding/month-validation green.
- iOS: after push, `GH_TOKEN=placeholder gh run watch --exit-status` → all `*ParityTests` (incl. 3 new) green on macOS CI.

**P4 — occupancy**
- Migration applied; `git diff shared/test-vectors/housing-net-rental.json` → empty (byte-identical).
- Web: mark a unit vacant/occupied explicitly in the add/edit modal; net = occupied-only and dashboard == detail; helper copy reads "occupied unit rent". Backfill: no existing property's net changes.
- iOS: same via CI simulator screenshots (Housing tab).

**P5 — i18n**
- `cd web && npx vitest run test/i18n/catalog-parity.test.ts` → green; temporarily mislabel a shared key → test FAILS (proves the hardened assertion), then revert.

**P6 — comments**
- `grep -rn "scope\|percent\|Set<User.ID>" iOS/Ortho-iOS/Services/TransactionsAPI.swift iOS/Tasks.md iOS/ARCHITECTURE.md` → no stale schema descriptions; ARCHITECTURE.md updated or clearly archived.

**P7 — docs/counts/PARITY**
- Reconfirm each figure against the tree: `wc -l web/components/web/TxForm.tsx`, `ls iOS/Ortho-iOSTests/*.swift | wc -l`, `ls web/test -R | grep -c '\.test\.'`, vitest summary; `grep -rn "014\|seven" docs/` → none stale; PARITY.md matches code.

## Gate (Success Criteria)
- `cd web && npm test` green + `npx tsc --noEmit` clean; iOS CI green; `git diff shared/test-vectors/` shows only intended changes; all 41 inventory items closed; PARITY.md/docs match reality.
