# Contract — `seed:corpus` CLI

Entry: `web/scripts/seed-corpus.ts`, run via `npm run seed:corpus` (tsx).
Purpose: populate a **local/dev** Supabase instance with the coverage corpus so
the running app shows varied, non-idealized data (US3).

## Invocation
```
npm run seed:corpus [-- --seed <n>] [--dry-run] [--i-understand-this-is-not-local]
```

## Behavior
1. Load env via the import CLI's `loadEnv()` (`.env.local`), read
   `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
2. **Safe-target guard (FR-009)** — before any write:
   - Allow if the URL host is `localhost`, `127.0.0.1`, `[::1]`, or a
     single-label `.local` mDNS name (e.g. `supabase.local`). A multi-label host
     that merely ends in `.local` (e.g. `x.supabase.co.local`) is refused.
   - Otherwise refuse with a clear message, UNLESS **both**
     `--i-understand-this-is-not-local` is passed **and** `SEED_ALLOW_REMOTE=1`
     is set (loud double opt-in for a personal throwaway cloud project).
   - Never proceed against a URL that looks like the shared hosted project.
3. Generate the corpus (`generateCorpus(seed)`), flatten (`toTables`).
4. Insert in dependency order: users → households → household_people →
   household_members → cards → properties → mortgage_info → lease_info → units →
   rental_payments → budgets → transactions → transaction_shares. Transactions
   and shares reuse the import CLI's `txRecord`/`shareRows` column mappers (one
   share row per owner); they are written through `upsert`, not the import
   `persist()` (whose plain-insert + delete-parent rollback would break the
   idempotent re-run this seeder targets).
5. **Idempotence (FR-008)**: corpus ids are stable; every table is written with
   upsert semantics (`upsert` / `onConflict` on the table's natural key) so
   re-running does not duplicate rows.
6. `--dry-run`: run the guard + generation + row counts and print a summary
   **without writing**.

## Output
- Per-table written/skipped counts and a final total.
- Non-zero exit on guard refusal, missing env, or any insert error (with the
  table + id that failed).

## Non-goals
- No production/shared-DB path. No teardown/reset command in this feature (a
  future `--reset` is out of scope). No wiring into the in-app "Use test data"
  flag.
