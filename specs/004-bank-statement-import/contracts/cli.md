# Contract: CLI / Make interface

## Make targets (root `Makefile`)

```
make ingest FILE=<path.pdf> [BANK=<id>] [DRY_RUN=1] [YES=1] [ADMIN=1]
make ingest-help
```

`ingest` delegates to: `cd web && npx tsx scripts/import/cli.ts --file <path> [--bank <id>] [--dry-run] [--yes] [--admin]`.

| Make var | CLI flag | Meaning | Default |
|---|---|---|---|
| `FILE` | `--file` | Path to the statement PDF (required). | — |
| `BANK` | `--bank` | Force a bank profile id (e.g. `td`); skips auto-detect. | auto-detect |
| `DRY_RUN=1` | `--dry-run` | Parse, categorize, reconcile, preview — **no DB writes**. | off |
| `YES=1` | `--yes` | Accept all suggested categories/owners (non-interactive); still blocks on reconciliation failure and still asks one final confirm unless `DRY_RUN`. | off |
| `ADMIN=1` | `--admin` | Use service-role key instead of sign-in. | off |

## Environment (from `web/.env.local` or shell)
- `NEXT_PUBLIC_SUPABASE_URL` (required)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required for sign-in mode)
- `IMPORT_EMAIL` (sign-in mode; email OTP — the tool emails a 6-digit code and prompts for it; email itself is prompted if unset). No password (Ortho uses OTP, not passwords).
- `SUPABASE_SERVICE_ROLE_KEY` (required only for `ADMIN=1`)

## Exit codes
| Code | Meaning |
|---|---|
| `0` | Success (import completed, or dry-run completed, or user aborted cleanly with nothing written). |
| `1` | Usage error (missing `FILE`, bad flag). |
| `2` | Unsupported/ambiguous bank (no profile matched, or >1 matched without `BANK=`). |
| `3` | Unparseable PDF (no extractable text). |
| `4` | **Reconciliation failed** — computed section totals ≠ printed subtotals; nothing written. |
| `5` | Auth/DB error (sign-in failed, missing env, write error). |

## stdout contract (stable, greppable lines)
```
Detected bank: TD Bank (Premier Checking)
Statement period: 2026-04-26 → 2026-05-25  (holder: AYAZ UDDIN)
Reconciliation: OK (7/7 sections)            # or: FAILED — Electronic Payments expected $22,414.68 computed $22,376.18 (Δ $38.50)
Preview (N transactions, M excluded):
  2026-05-04  Verizon                 −$89.99   utilities   [expense]   ← owner: Ayaz
  2026-05-01  Zelle · John Tejada    +$2,200.00 income     [income]    ← owner: Ayaz
  2026-05-04  AMEX EPAYMENT          −$2,164.08 —          [EXCLUDED: cc-payment]
Summary: imported 11 · skipped(duplicate) 3 · excluded 6 · reconciliation OK
```
- Money rendered via the shared `formatMoney` (Principle IV): `$87.42`, income `+`, costs use Unicode minus `−`, never abbreviated.
- A `DRY_RUN` ends after `Preview`/`Summary` with `Dry run — nothing written.`

## Interactive review (when not `--yes`)
Per included transaction, prompt allows: `[Enter]` accept · `c` change category · `x` toggle exclude · `o` reassign/add owners · `s` set split (multi-owner). A final `Import N transactions? [y/N]` gates all writes. `Ctrl-C`/`n` aborts with nothing written.

## Invariants
- No write occurs unless reconciliation passed **and** the operator confirmed (FR-009, FR-025).
- Re-running the same statement imports 0 new rows (FR-024).
