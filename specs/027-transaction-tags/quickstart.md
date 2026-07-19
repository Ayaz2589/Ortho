# Quickstart: Transaction Tags & Richer Notes

Local dev + verification for spec 027. Assumes the docker-sandbox bootstrap has run (local Supabase
up, `web/.env.local` pointing at `http://127.0.0.1:54321`, `npm ci` done).

## Apply the migration

```bash
# from repo root — replays all migrations incl. 20260718120001_transaction_tags.sql
supabase db reset
```

Verify the schema:

```bash
# tables + column exist
supabase db diff --schema public   # should be empty after reset (migrations == DB)
```

## Run the suite (TDD loop)

```bash
cd web
npm test -- transaction-filters          # the pure engine unit + parity tests
npm run gen:vectors                       # regenerate shared/test-vectors/transaction-filters.json
git diff --stat ../shared/test-vectors    # diff limited to the new tag/notes cases
npm test                                  # full suite green
npx tsc --noEmit                          # typecheck gate (CI parity)
```

## Manual smoke (app)

```bash
cd web && npm run dev    # http://localhost:3000
```

1. **Tag a transaction**: open a transaction (desktop drawer or mobile edit page), type "vacation"
   in Tags, press Enter → a chip appears; add "work"; Save. Reopen → both chips persist.
2. **Reuse + dedup**: on another transaction type "Vacation" (capital V) → the existing tag is
   reused; the household tag list does not grow a duplicate.
3. **Filter by tag**: open Filters → the Tags section lists "vacation"/"work"; select "vacation" →
   only tagged transactions show; the active-filter chip row shows a removable "vacation" chip and
   the count includes the tag dimension; remove it → list returns.
4. **Notes + search**: add a note "reimburse Sam" to a transaction; type "reimburse" in the search
   box → the transaction is found. Type a tag name in the search box → transactions carrying it are
   found.
5. **Additivity**: an untagged, note-less transaction looks and behaves exactly as before.

## What "done" looks like

- `supabase db reset` clean; `npm test` + `npx tsc --noEmit` green.
- `shared/test-vectors/transaction-filters.json` regenerated and committed (diff = new cases only).
- PARITY.md + `docs/web.md` + `docs/supabase.md` reconciled (see tasks).
- `docs/future_tasks/4.4-transaction-tags-notes.md` marked delivered (or removed) with a pointer to
  `specs/027-transaction-tags/`.
