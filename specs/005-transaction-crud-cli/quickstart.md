# Quickstart: Transaction CRUD make commands

End-to-end validation. Assumes spec 004 is in place and `web/.env.local` has the Supabase URL + anon key and `IMPORT_EMAIL`.

## 1. Deterministic tests (no DB, no network)
```bash
cd web && npm test            # Node >= 20.19 (nvm use 22)
```
Expected: `test/import/{filters,validate,render,transactions}.test.ts` pass — month-range, validators, payload shapes (mocked), and table formatting. This is the Principle VI gate.

## 2. List (read-only)
```bash
make tx-list LIMIT=10
make tx-list MONTH=2026-05 KIND=expense CATEGORY=utilities
make tx-list SOURCE='TD Bank' SCOPE=personal
```
Expected: a money-aligned table, newest first, amounts as `+$…`/`−$…`; filters narrow the set; an empty filter prints `No transactions match.` (exit 0). Grab a `short-id`/full id for the next steps.

## 3. Add
```bash
make tx-add MERCHANT='Corner Coffee' AMOUNT='4.50' CATEGORY=coffee
```
Expected: prints the row, asks to confirm, then `Created <short-id>.` Verify with `make tx-list LIMIT=5` and in the app. Negative test: `AMOUNT='0'` or empty `MERCHANT` is rejected with nothing written.

## 4. Edit
```bash
make tx-edit ID=<uuid-from-list>
```
Expected: shows current values; change category/amount; confirm → `Updated <short-id>.` Re-list to confirm only those fields changed. Convert a personal row to a 50/50 shared one (needs a 2-member household) and confirm shares appear in both apps; convert back and confirm shares are gone.

## 5. Delete — preview then real
```bash
make tx-rm ID=<uuid> DRY_RUN=1     # shows the row, deletes nothing
make tx-rm ID=<uuid>               # confirm y → Deleted <short-id>.
```
Expected: dry-run removes nothing; real delete removes the row (and its shares); a re-list no longer shows it. A bogus id prints `… not found …` and changes nothing.

## 6. Access scope
With normal sign-in, `tx-edit`/`tx-rm` on an id you don't own reads as not-found (SC-006). `ADMIN=1` can act on any row.

## Success = all of:
- Tests green (1); list + filters correct (2); add validates + persists (3); edit updates only changed fields incl. scope/shares (4); dry-run safe + real delete works (5); access scoping holds (6).
