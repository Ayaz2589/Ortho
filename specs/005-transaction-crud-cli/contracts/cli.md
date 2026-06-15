# Contract: CLI / Make interface (transaction CRUD)

All targets delegate to `cd web && npx tsx scripts/import/tx.ts <sub> …`. Auth, env, and exit codes are inherited from spec 004 (`contracts/cli.md`): email-OTP sign-in by default, `ADMIN=1` for service-role, env from `web/.env.local`.

## Targets

```
make tx-list [MONTH=YYYY-MM] [CATEGORY=…] [SOURCE=…] [SCOPE=personal|shared] [KIND=expense|income] [LIMIT=N] [ADMIN=1]
make tx-add  MERCHANT='…' AMOUNT='12.34' [DATE=YYYY-MM-DD] [CATEGORY=…] [KIND=expense|income] [SCOPE=personal|shared] [SOURCE='…'] [ADMIN=1]
make tx-edit ID=<uuid> [ADMIN=1]
make tx-rm   ID=<uuid> [DRY_RUN=1] [ADMIN=1]
```

| Var | Sub | Meaning |
|-----|-----|---------|
| `MONTH/CATEGORY/SOURCE/SCOPE/KIND/LIMIT` | list | optional, combinable filters |
| `MERCHANT/AMOUNT` | add | required (prompted if absent) |
| `DATE/CATEGORY/KIND/SCOPE/SOURCE` | add | optional (defaults: today / entertainment(or income) / expense / personal / '') |
| `ID` | edit, rm | target uuid (required) |
| `DRY_RUN=1` | rm | preview only, no delete |
| `ADMIN=1` | all | service-role; act on any row |

## Exit codes
| Code | Meaning |
|---|---|
| 0 | success / clean abort / not-found reported / dry-run |
| 1 | usage error (missing/invalid args, bad subcommand) |
| 5 | auth or DB error |

## stdout contracts

**tx-list** — money-aligned table, newest first:
```
id        date        merchant                amount      category     scope     source
a1b2c3d4  2026-05-04  Verizon                  −$89.99    utilities    personal  TD Bank
e5f6a7b8  2026-05-01  Crossterra Payroll    +$4,178.44    income       personal  TD Bank
(2 transactions)
```
Empty result → `No transactions match.` (exit 0).

**tx-add** — validates, prompts for anything missing, prints the row, asks `Create this transaction? [y/N]`, then `Created <short-id>.`

**tx-edit** — prints current values, edits field-by-field, asks `Save changes? [y/N]`, then `Updated <short-id>.` (or `No changes.`).

**tx-rm** — prints the row; `DRY_RUN` → `Dry run — nothing deleted.`; else `Delete this transaction? [y/N]` → `Deleted <short-id>.`

**not found** (edit/rm) → `Transaction <id> not found (or not accessible).` exit 0, no change.

## Invariants
- No create/update/delete without validation passing **and** an explicit confirmation (FR-009/012/015; SC-003).
- `DRY_RUN` deletes nothing (SC-004).
- Non-admin: only the operator's own rows are visible/mutable (SC-006).
- Money rendered via `formatMoney`; amounts stored as integer cents.
