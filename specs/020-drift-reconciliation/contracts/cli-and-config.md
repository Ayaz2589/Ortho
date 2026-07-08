# Contract: CLI & Config Truth-Up (P1/P2)

## CLI `paid_by` (P1, defect)
- `web/scripts/import/db/persist.ts` `txRecord()` MUST include `paid_by` in the inserted column set, so `createOne` (`tx.ts`) and `updateOne` (`tx.ts`) and the `cli.ts` ingest path all persist the payer — matching `web/lib/store.tsx` (`store.tsx:620`).
- Value source: the transaction's resolved payer (ingest attributes by statement-holder name-match; `tx-add` uses the provided/current person). NULL only when genuinely unknown.
- **Test**: `web/test/import/persist.test.ts` (new or extended) asserts `txRecord(tx).paid_by` round-trips and that a CLI-created expense with a payer participates in `balanceBetween` (not dropped by the `if (!payer) continue` guard).
- **PARITY.md**: correct the CLI row that claims payer support.

## OTP length (P1, defect)
- `supabase/config.toml [auth.email] otp_length = 8` (was 6). Verify `otp_expiry` and `[auth.sessions] timebox = "720h"` unchanged. Hosted project already 8 (docs) — this fixes the local stack only.

## `[db.seed]` honesty (P2)
- Create `supabase/seed.sql` (empty + header comment) so `sql_paths=["./seed.sql"]` resolves and `enabled=true` is truthful (no-op seed today; home for future seeds). Equivalent-valid alt: set `enabled=false`.

## Dead knobs (P2)
- Remove `--scope` forward from `Makefile` (`tx-add`); remove the `SCOPE=` example from `docs/makefile.md`; remove personal/shared + `SCOPE=` language from `web/scripts/import/README.md`. (`scope` column dropped in migration 6; `tx.ts` never parsed it.)
- Remove `ClientOptions.asUserId` field and the `opts.asUserId ?? ''` branch from `web/scripts/import/db/client.ts` (never passed; admin attribution resolved after the fact).
- No behavior change (both were no-ops); note removal so it isn't read as a regression.
