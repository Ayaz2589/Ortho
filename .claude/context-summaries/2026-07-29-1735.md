# Session summary — 2026-07-29

## Date and duration
- Started: 2026-07-27 (spec 032 build) → ran through 2026-07-29
- Ended: 2026-07-29 ~17:35 UTC
- Approximate duration: multi-day thread; this summary supersedes `2026-07-29-1652.md`

## What we worked on
Two things. (1) Shipped **spec 032 "PDF Data Export & Import"** end-to-end via spec-kit
(merged, #66/#67; CJK+Bengali fonts provisioned). (2) Investigated why the user's prod app
showed **"You owe Tasnuva $7,710.68"** — which turned into discovering a **critical
production bug: the web store silently loads at most 1000 rows per table (no pagination)**.
That single bug is the root cause of BOTH the wrong balance AND the duplicate-import problem.

---

## 🔴 HEADLINE BUG — the store caps every table at 1000 rows (no pagination)

**Root cause:** Supabase `max_rows = 1000` (`supabase/config.toml:18`) + the store's bootstrap
loader has **zero `.range()` pagination**:
- `web/lib/store.tsx:669–672` — `from('transactions').select(...).order('date', {ascending:false})` → returns only the **newest 1000**.
- `web/lib/store.tsx:673` — `from('transaction_shares').select(...)` → only **1000** rows, and **not ordered** to match the loaded transactions.
- Same class of risk for any table that can exceed 1000 (tags, rental_payments, goal_contributions).

**The user's prod household has 1,072 transactions and 1,301 share rows** → the app drops the
**oldest ~72 transactions** and **~300 share rows**, invisibly.

### Consequence 1 — the wrong balance (the REAL reason; I corrected an earlier guess)
- Transactions load newest-first, capped at 1000 → the oldest ~72 (early-**January**) rows are discarded.
- Those dropped January rows include big **Ayaz-paid** expenses — e.g. **two Ticketmaster $2,397.60** (= +$4,795 of "Tasnuva owes you") plus other Jan charges.
- Removing ~$10k of "she owes you" flips the balance from my **full-ledger +$2,318.73** (Tasnuva owes Ayaz) to the app's **≈ −$7,710.68** ("you owe Tasnuva") — matches the app.
- Worse: `transaction_shares` also caps at 1000/1301 and isn't ordered to match the loaded txns → some visible transactions load with **missing/incomplete splits**, corrupting their balance contribution too.
- **CORRECTION:** earlier in the thread I hypothesized the $7,710.68 was a "stale/older prod build." That was WRONG. The code-grounded cause is the 1000-row store cap. State this plainly if it comes up.

### Consequence 2 — duplicate imports (the "importer bug" the user asked about)
- Web CSV import builds its dedup `existing` from the store's **truncated ≤1000** `transactions` (`web/lib/csv/useCsvImport.ts:81`). Re-imported rows that duplicate any of the dropped older rows are **not flagged → imported as duplicates.**
- CLI path fails independently, 3 ways:
  - `fetchExistingForDedupe` (`web/scripts/import/db/lookups.ts:55`) — **no pagination** (≤1000) AND `.eq('created_by', createdBy)` (misses rows created by the other member).
  - `markDuplicates` (`web/scripts/import/engine/dedupe.ts`) keys the dedupe on **`source`** → a re-run with a different card/source misses. (The web matcher `web/lib/csv/duplicateMatch.ts` DELIBERATELY ignores source for exactly this reason — the two diverge.)
  - **No intra-batch dedup** in EITHER path (both compare only vs existing DB rows, never within the batch). A single import containing repeated rows inserts all copies → matches the user's **June-17 same-second ×2–4** duplicate cluster.
- Web reducer DOES auto-exclude flagged duplicates (starts them unchecked — `csvImportSession.ts:77`), so the dedup design is sound; it just can't flag what it can't see.

### The fix (should be its own spec; arguably more urgent than the data cleanup)
1. **Paginate every ledger load** in the store (`.range()` loop until a short page) — transactions + transaction_shares first. This one change fixes the **balance** and the **dedup blindness** at once.
2. **Paginate `fetchExistingForDedupe`**, drop the `created_by` filter, stop keying on `source` (align with the web matcher).
3. **Add intra-batch dedup** so a doubled import can't duplicate itself.
4. Do **NOT** just bump `max_rows` — that only moves the cliff. Pagination is the fix.

---

## Prod data findings (read-only investigation)
- Signed in as the user (household `4dfcc877-46b6-4e92-b6b8-65181139247f`, members **Ayaz** + **Tasnuva**). True full-ledger balance = **Tasnuva owes Ayaz $2,318.73**; after collapsing duplicates ≈ **break-even (Ayaz owes Tasnuva $273.22)**. Neither is the app's $7,710.68 (that's the 1000-cap truncation).
- **95 redundant duplicate rows across 66 sets ($4,125.96)** — from two bad imports: a bulk import on **2026-06-17 18:04** (inserted 2–4×) and a CSV import **re-run on 2026-07-21 (14:23 vs 14:25)**. Full list with row IDs + KEEP/DELETE tags saved to `scratchpad/duplicate-report.txt` (95 delete-candidate UUIDs captured). A few sets have differing owners/splits between copies — pick the correct copy to keep, not just the oldest.
- **A $15,895.53 transfer** (2026-05-31, Tasnuva→Ayaz, no note) is the single biggest balance lever and is worth confirming isn't a misentry. All 3 transfers are one-directional (her→him, $17,875.45 total; he's sent $0 back).

## Staging check — CLEAN (rules out systemic cause)
- Staging seed household (members **Sam** + **Riley**, 449 txns) has **0 real duplicates** — the only "×2" is two legit $2.90 MTA OMNY subway taps same day. Confirms the duplication is NOT systemic (not seed/deploy/shared-code); it came from the user's manual prod imports.

## How prod/staging were accessed (reproducible, read-only)
- Public client config (`NEXT_PUBLIC_SUPABASE_URL` + `sb_publishable_...` anon key) is **baked into the deployed bundles** — pull it by fetching the site's `/_next/static/chunks/*.js` and grepping for `supabase.co` / `sb_publishable_`. Prod site `ortho-murex-eight.vercel.app` (project `brujhxmtzfgowimprueo`); staging `ortho-env-staging-ayaz2589s-projects.vercel.app` (project `oozwqzsfbtkzywsxrzdq`).
- **Prod auth:** email OTP as the user (`ayaz2589@gmail.com`) — user pasted the 8-digit code (Gmail MCP was expired). RLS-scoped, read-only.
- **Staging auth:** the DEV_AUTOLOGIN **seed user** (`seed@ortho.test`) via `signInWithPassword` — email+password are `NEXT_PUBLIC_` throwaway non-prod creds recoverable from the staging bundle / `web/lib/auth/autoLogin.ts` (password intentionally omitted from this summary; re-extract from the bundle).
- Tooling: `web/scripts/_diag.ts` — a throwaway diagnostic (auth → paginated load of transactions+shares → balanceBetween per-tx breakdown + duplicate report + balance variants). **Important:** it paginates with `.range()` (learned the 1000-cap the hard way), which is exactly what the store SHOULD do.

## Code changes (commits made)
- Spec 032 shipped earlier in the thread (PRs #66 + #67, merged to `main`). No new commits in this investigation.
- **Uncommitted local (gitignored / throwaway):** `web/.env.local` (public prod anon key only), `web/scripts/_diag.ts` (diagnostic). Neither is committed.

## Current state of the system
- `main` includes spec 032 (PDF export/import) + loading-skeletons. Full suite green (~211 files), tsc clean, no vector drift at last check.
- Prod is a **manual promotion** and lags `main`. No pending PRs from this investigation.
- **Nothing has been written to prod or staging** — all read-only.

## Pending / unresolved
- **Write the 1000-row pagination bug-fix spec** (store pagination + dedup hardening + intra-batch dedup). Highest priority — silently corrupts balances/totals for any household >1000 txns.
- **Prod cleanup NOT done** — awaiting user go-ahead to delete the 95 duplicate rows (live writes; batch + confirm; watch the differing-owner sets).
- **Inspect the $15,895.53 transfer.**
- The **`make data-export` / `make data-import` CLI** was handed to ANOTHER sandbox agent (brief in `2026-07-29-1652.md`).

## Files to read next session
- This file (`latest.md`).
- `web/lib/store.tsx:660–700` — the un-paginated `loadAll` (THE bug).
- `supabase/config.toml` — `max_rows = 1000`.
- `web/lib/csv/useCsvImport.ts`, `web/lib/csv/duplicateMatch.ts`, `web/lib/csv/csvImportSession.ts` — web import dedup.
- `web/scripts/import/engine/dedupe.ts`, `web/scripts/import/db/lookups.ts` — CLI import dedup.
- `web/scripts/_diag.ts` — the diagnostic (pattern for paginated Supabase reads).
- `scratchpad/duplicate-report.txt` — the 95 delete-candidate IDs.
- `2026-07-29-1652.md` — the make-CLI handoff brief.

## Quote-worthy phrases / important commitments
- User wants the `make data-export`/`make data-import` CLI built **properly as a separate spec** (handed to another sandbox agent).
- Established earlier: import is additive/idempotent by design, so a PDF export→wipe→re-import round-trip will **NOT** remove duplicates — cleanup must be targeted deletion.

## What I would tell the next Claude
The big finding is a **production bug: the store loads ≤1000 rows per table with no pagination**
(`store.tsx:669-673`, `max_rows=1000`). For this user's 1072-transaction household it silently
drops the oldest ~72 txns + ~300 share rows, which is the REAL reason the app shows "You owe
Tasnuva $7,710.68" (not a stale build — I corrected that) and also why re-imports created 95
duplicate rows (the dedup `existing` set is truncated). The right next move is a bug-fix spec:
paginate all ledger loads + `fetchExistingForDedupe`, add intra-batch dedup, don't just raise
`max_rows`. Two things are still paused on the user's word: deleting the 95 prod duplicates
(IDs in `scratchpad/duplicate-report.txt`) and inspecting the $15,895.53 transfer. Everything so
far has been strictly read-only.
