# Bank-statement import CLI

Deterministic (no-LLM) importer that parses a bank-statement **PDF or CSV** and
writes transactions into the same Supabase database the web and iOS apps use.
See the full design in [`specs/004-bank-statement-import/`](../../../specs/004-bank-statement-import/).

**Supported sources** (auto-detected): **TD Bank** Premier Checking (PDF) ·
**Apple Card** / Goldman Sachs (PDF) · **American Express Gold** (PDF) ·
**Chase** credit-card Activity (CSV). PDF statements are reconciled against their
printed subtotals; the CSV export has no control total, so reconciliation is
reported `n/a` for it (the preview + duplicate detection are the safeguards).

On multi-cardholder statements (Amex), each charge's **owner defaults to the card
member**, matched to an Ortho user by first name (operator otherwise); you can
change it in review.

## Usage

From the repo root (FILE may be a `.pdf` or `.csv`):

```bash
make ingest FILE=<statement.pdf|csv> [BANK=<id>] [DRY_RUN=1] [YES=1] [ADMIN=1]
make ingest-help
```

| Var | Meaning | Default |
|-----|---------|---------|
| `FILE` | path to the statement PDF (required) | — |
| `BANK` | force a bank profile id (e.g. `td`) | auto-detect |
| `DRY_RUN=1` | parse + preview + reconcile, **no DB writes** | off |
| `YES=1` | accept suggested categories/owners (non-interactive) | off |
| `ADMIN=1` | use `SUPABASE_SERVICE_ROLE_KEY` instead of sign-in | off |

Always start with `DRY_RUN=1` to verify the parse and reconciliation before writing.

## Environment (`web/.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — required.
- `IMPORT_EMAIL` — sign-in mode (default). Auth is **email OTP**, same as the apps: the
  tool emails you an 8-digit code and prompts for it at runtime. **No password is stored.**
  If `IMPORT_EMAIL` is unset you're prompted for the email too.
- `SUPABASE_SERVICE_ROLE_KEY` — only for `ADMIN=1` (cross-account attribution).

## How it works

`extract → detect bank → parse (profile) → categorize → flag exclusions →
reconcile → review → dedupe → confirm → persist`.

Each statement section is reconciled against its printed `Subtotal:`; **a mismatch
blocks the import** (exit code 4). Re-running the same statement imports nothing
new (duplicate detection).

| Exit | Meaning |
|------|---------|
| 0 | success / dry-run / clean abort |
| 1 | usage error |
| 2 | unsupported or ambiguous bank |
| 3 | unparseable PDF (no text layer) |
| 4 | reconciliation failed (nothing written) |
| 5 | auth / DB error |

## Transaction CRUD (`tx-*`)

Manage transactions directly (spec 005). Same OTP / `ADMIN=1` auth as `ingest`.

```bash
make tx-list [MONTH=YYYY-MM] [QUERY=text] [CATEGORY=a,b] [SOURCE=a,b] [OWNER=name] [KIND=expense|income|transfer] [LIMIT=N]
make tx-add  MERCHANT='Corner Coffee' AMOUNT='4.50' [DATE=YYYY-MM-DD] [CATEGORY=…] [KIND=…] [SOURCE='…']
make tx-edit ID=<uuid>
make tx-rm   ID=<uuid> [DRY_RUN=1]
```

- **tx-list** — money-aligned table, newest first; read-only. Filter semantics
  are the apps' (spec 013): only the MONTH window narrows in SQL, everything
  else runs through the shared `filterTransactions` — free-text QUERY
  (merchant/source/category/owner name), comma multi-select CATEGORY/SOURCE
  (OR within a dimension), OWNER by household-person name, KIND incl.
  transfer. Scope is the whole household, like the apps. If the fetch hits
  LIMIT (default 200) the truncation is printed — never silent.
- **tx-add** — validates like the web form (amount > 0, merchant non-empty, valid category); prompts for owners + split when the household has 2+ people (every transaction is household-scoped); confirm before write.
- **tx-edit** — shows current values, edits field-by-field, confirm to save (a stored custom split is preserved).
- **tx-rm** — shows the row, `DRY_RUN=1` previews; otherwise `y/N` confirm; shares cascade.

Listing is household-wide in sign-in mode (RLS still bounds you to your own
household); `ADMIN=1` spans all households. Writes mirror the web store exactly
— including its compensation: a failed shares write rolls back the parent
(create) or restores the previous shares (edit), so a partial failure never
leaves a row that rehydrates as "creator owns all" (spec 013).
See [spec 005](../../../specs/005-transaction-crud-cli/) and its [`contracts/cli.md`](../../../specs/005-transaction-crud-cli/contracts/cli.md).

## Layout

```
engine/    pure logic: readInput, extractText, csv, detectBank, money, dates,
           categorize, exclusions, reconcile, split, dedupe, toTransaction,
           filters, validate, render, args, ownerMatch, types
profiles/  per-bank profiles (td-bank.ts, apple-card.ts, amex-gold.ts PDF; chase-csv.ts CSV) + registry
db/        client (sign-in / admin), lookups, persist, transactions (CRUD)
cli.ts     ingest orchestration + interactive review
tx.ts      transaction CRUD (list | add | edit | rm)
```

## Adding a bank

Implement the `BankProfile` interface in `profiles/<bank>.ts`, register it in
`profiles/index.ts`, and add a golden fixture under `test/import/fixtures/`
(`<bank>-<period>.pages.json` + `.expected.json`). No engine change required.
PDF profiles parse page text and reconcile against printed subtotals; **CSV
profiles** parse `parseCsv(pages[0])` and set `reconcilable: false` (see
`chase-csv.ts`). `readInput` dispatches `.csv` vs `.pdf` by extension.
See [`contracts/bank-profile.md`](../../../specs/004-bank-statement-import/contracts/bank-profile.md).

## Tests

```bash
cd web && npm test          # requires Node >= 20.19 (vitest 4 needs require(ESM))
```

Golden parse + unit tests for every money/date/split/reconcile/dedupe path live
in `web/test/import/`.
