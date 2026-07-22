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

## Coverage corpus & holistic seed — `gen-corpus.ts` / `seed-corpus.ts`

The deterministic edge-case coverage corpus (spec 026, §9.1) plus the holistic
seed + realistic demo household (spec 030). `gen-corpus.ts` regenerates the
committed snapshot **manifest**; `seed-corpus.ts` populates a **local/dev**
Supabase (guarded — it refuses non-local targets unless a loud double opt-in is
set). It creates the required `auth.users` rows via the Admin API and seeds every
table the app loads (goals, tags, linked banks, entitlements included).

```bash
cd web && npm run gen:corpus                       # rewrite the snapshot manifest
cd web && npm run seed:corpus -- --dry-run         # planned per-table counts + guard verdict, no writes
cd web && npm run seed:corpus                       # seed the realistic DEMO household (idempotent)
cd web && npm run seed:corpus -- --corpus          # ALSO seed the full edge-coverage corpus
```

Set `NEXT_PUBLIC_APP_ENV=local`, `NEXT_PUBLIC_DEV_AUTOLOGIN=1`, and
`NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL/_PASSWORD` (matching `SEED_USER_EMAIL/_PASSWORD`)
to have the app auto-sign-in the seed user against the seeded backend.

👉 Full operator runbook (local + staging):
[`specs/030-holistic-seed-auth/quickstart.md`](../../specs/030-holistic-seed-auth/quickstart.md).
See also [`docs/web.md`](../../docs/web.md) §14 and
[`specs/026-seed-data-harness/`](../../specs/026-seed-data-harness/).

## Notes

- Tests run under the web vitest suite (`cd web && npm test`) and need **Node ≥ 20.19**
  (vitest 4 requires `require(ESM)`); the CLI itself runs on the default Node.
