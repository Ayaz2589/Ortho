# `web/scripts/`

Developer scripts for the Ortho web package. Run them from the **repo root** via
`make` (or directly with `npx tsx` from `web/`).

## Transaction CLI — `import/`

A deterministic CLI to **import bank-statement PDFs** and to **manage transactions**
(list / add / edit / delete) directly in the shared Supabase database. Everything it
writes is identical to app-entered data.

```bash
make ingest FILE=<statement.pdf> DRY_RUN=1   # preview an import (no writes)
make ingest FILE=<statement.pdf>             # import it

make tx-list [MONTH=YYYY-MM] [CATEGORY=…] [LIMIT=N]
make tx-add  MERCHANT='Corner Coffee' AMOUNT='4.50'
make tx-edit ID=<uuid>
make tx-rm   ID=<uuid> [DRY_RUN=1]

make ingest-help                             # full flag reference
```

Auth is your Ortho **email OTP** (it emails a code you paste at the prompt — no
password). Set `IMPORT_EMAIL` in `web/.env.local` or you'll be prompted.

👉 **Full usage, flags, exit codes, and how to add a bank:**
[`import/README.md`](import/README.md). Design docs:
[`specs/004-bank-statement-import/`](../../specs/004-bank-statement-import/) and
[`specs/005-transaction-crud-cli/`](../../specs/005-transaction-crud-cli/).

## `gen-vectors.ts`

Regenerates the shared finance golden vectors (`shared/test-vectors/`) from the
TypeScript implementations so the web and iOS suites stay in parity.

```bash
cd web && npm run gen:vectors
```

## Notes

- Tests run under the web vitest suite (`cd web && npm test`) and need **Node ≥ 20.19**
  (vitest 4 requires `require(ESM)`); the CLI itself runs on the default Node.
