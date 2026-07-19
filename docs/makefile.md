# Root Tooling: Makefile CLI, Spec Kit, `.claude/`

Read this when: running the bank-statement import / transaction CRUD CLI from the repo root, or
working with the spec-kit (`specs/` + `.specify/`) and `.claude/` tooling.

The CLI implementation lives in `web/scripts/import/` (see `web/scripts/import/README.md` for the
full flag/exit-code contract); the Makefile is a thin flag-forwarding wrapper. Subsystem docs:
[`web.md`](./web.md), [`supabase.md`](./supabase.md), [`finance.md`](./finance.md),
[`shared.md`](./shared.md).

## 1. Prerequisites (all targets)

- **Node 22** (root `.nvmrc`); **no root `package.json`** — every target does `cd web && npx tsx …`,
  so run `cd web && npm install` first.
- Env from `web/.env.local`: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` always;
  `IMPORT_EMAIL` for OTP sign-in; `SUPABASE_SERVICE_ROLE_KEY` only for `ADMIN=1`.
- Boolean vars (`DRY_RUN`, `YES`, `ADMIN`, `APPLY`) use `$(filter 1,…)`: **only the literal `X=1`
  activates them** — `DRY_RUN=true` is silently ignored.
- Targets hit the **real shared Supabase backend**. `DRY_RUN=1` first is the contract, especially
  with `ADMIN=1`. Node-only — works in a Linux sandbox (unlike iOS builds).

## 2. The 7 Make targets

| Target | Usage | Notes |
|---|---|---|
| `ingest` | `make ingest FILE=<path.pdf\|csv> [BANK=td\|apple\|amex\|chase] [DRY_RUN=1] [YES=1] [ADMIN=1]` | `FILE` required; resolved to an absolute path before `cd web` (bypassing Make resolves relative to `web/`). Flags map 1:1 to `--file/--bank/--dry-run/--yes/--admin`. |
| `ingest-help` | `make ingest-help` | Prints the flag/env cheat-sheet; no side effects. |
| `tx-list` | `make tx-list [MONTH=YYYY-MM] [QUERY=text] [CATEGORY=a,b] [SOURCE=a,b] [OWNER=name] [KIND=expense\|income\|transfer] [LIMIT=N] [ADMIN=1]` | Read-only. Only MONTH narrows in SQL; the rest runs the apps' shared `filterTransactions` in-process. LIMIT default 200; because filters apply **after** the SQL cap, results at LIMIT can be incomplete even when fewer rows print (truncation is always announced). |
| `tx-add` | `make tx-add MERCHANT='..' AMOUNT='12.34' [DATE=YYYY-MM-DD] [CATEGORY=..] [KIND=expense\|income] [SOURCE='..'] [ADMIN=1]` | Missing MERCHANT/AMOUNT prompted interactively. Default category: `income` for income, else `entertainment`. Only `expense\|income` for KIND — the CLI can list transfers but not create them. |
| `tx-edit` | `make tx-edit ID=<uuid> [ADMIN=1]` | ID required. Field-by-field prompts; blank keeps current. Preserves stored splits when owners are kept; custom split + amount change preserves per-owner **ratios** (never silently flattened to even). Deliberately does not recompute `household_id`. |
| `tx-rm` | `make tx-rm ID=<uuid> [DRY_RUN=1] [ADMIN=1]` | ID required; `DRY_RUN=1` previews. Shares delete via FK cascade. |
| `repair-dates` | `make repair-dates [APPLY=1] [ADMIN=1]` | Dry-run by default. `APPLY=1` additionally requires typing the literal word `repair` at a prompt. |

Ingest exit codes: 0 success/dry-run/abort · 1 usage · 2 unsupported/ambiguous bank · 3 unparseable
PDF (no text layer) · 4 reconciliation failed (nothing written) · 5 auth/DB error. `tx.ts` uses 1
(usage/validation) and 5 (auth).

## 3. Ingest pipeline internals

Orchestrated by `web/scripts/import/cli.ts` (301 lines):
`extract → detect → parse → reconcile → review → dedupe → confirm → persist`. Pure engine modules
in `web/scripts/import/engine/` (18: args, categorize, csv, dates, dedupe, detectBank, exclusions,
extractText, filters, money, ownerMatch, readInput, reconcile, render, split, toTransaction, types,
validate); bank profiles in `profiles/` (`td-bank.ts`, `apple-card.ts`, `amex-gold.ts` — PDF;
`chase-csv.ts` — CSV; registry `profiles/index.ts` exports `PROFILES`).

- **Detection** (`detectBank.ts`): every profile's `detect(text)` runs; exactly one match wins.
  Zero → exit 2 "unknown"; many → exit 2 "ambiguous"; bad `--bank` override → exit 1.
- **Reconciliation** (`reconcile.ts`): per-section net sum must equal the printed `Subtotal:` in
  cents (row sign = row kind vs section kind, so refunds inside a charges section net correctly).
  **Mismatch blocks the entire import, exit 4.** Skipped only when a profile sets
  `reconcilable: false` (Chase CSV — reported `n/a`).
- **Categorization** (`categorize.ts`): ordered regexes against the UPPERCASED merchant, first match
  wins; income → `income`; unmatched expense → fallback `entertainment`. Category list is the shared
  `PICKABLE_CATEGORIES` from `web/lib/types`.
- **Exclusions** (`exclusions.ts`): cc-payments, Wealthfront investment transfers, internal
  transfers — excluded by default, re-includable in review.
- **Dedupe** (`dedupe.ts`): key = `created_by|day|amount_cents|source(lowercased)`, compared only
  against existing DB rows (never within-batch — two identical same-day charges both import).
  Matches show `[DUPLICATE]`, excluded by default. Key is scoped to `created_by`, **not household**
  — a partner re-importing the same statement can double-write (PARITY.md "CLI-only data paths").
- **Owner/splits**: multi-cardholder statements (Amex) match each row's card member to a household
  person by case-insensitive **first name** (`ownerMatch.ts`); fallback = operator. Review loop:
  `Enter` accept · `c` category · `x` toggle-exclude · `o` owners · `s` percent split (validated via
  `validateCustomSplit` atop the shared `validateSplit`; needs 2+ owners) · `a` accept-all · `q` abort. Changing owners
  resets splits to even. Share math uses shared `computeShares`/`orderedOwnerIds` (leftover cent →
  canonically-first owner by ascending UUID).
- **Final gate**: `YES=1` skips per-row review but never the final `Import N transactions? [y/N]`.
- Dry-run performs no sign-in, so the preview shows `—` for every owner.

Adding a bank = one profile implementing `BankProfile { id, label, source, detect, parse }`
(`engine/types.ts`), a registry entry, and a golden fixture under `web/test/import/fixtures/`
(`<bank>-<period>.pages.json` + `.expected.json`). No engine change.

### `repair-dates` (`web/scripts/maintenance/repair-legacy-dates.ts`)

Spec 013 US2. Finds rows with UTC time-of-day in [00:00, 04:00)Z (the pre-2026-07-02 iOS
evening-wall-clock signature; noon-UTC is the convention now), infers the America/New_York calendar
day, proposes noon-UTC of that day. NY wall-clock [00:00, 01:00) is ambiguous and **never
auto-repaired**. Writes are guarded by each row's original date — race-safe and idempotent.
Contract: `specs/013-post-audit-closeout/contracts/repair-legacy-dates.md`.

## 4. CLI auth (`web/scripts/import/db/client.ts`)

- **Sign-in (default)**: plain `@supabase/supabase-js`, `signInWithOtp({ email })` → emailed
  **8-digit** code (`supabase/config.toml otp_length=8`) → `verifyOtp`. Email from `IMPORT_EMAIL`
  or a prompt. `persistSession: false` — every invocation costs one fresh emailed OTP. Yields a
  real `userId` → correct `created_by`; **RLS applies**.
- **`ADMIN=1`**: uses `SUPABASE_SERVICE_ROLE_KEY` (placeholder values rejected); **bypasses RLS**;
  `userId: ''`, so attribution is resolved afterwards — ingest name-matches the statement's
  `accountHolder` to a user (fallback: first user); `tx add` uses the first user. `tx-list` in
  admin mode spans **all households**. Keep the key out of git (`web/.env.local` only).

## 5. Write paths — CLI vs web (spec-027 split)

Full ledger: `PARITY.md`. The load-bearing facts:

- **Ingest is atomic.** `db/persist.ts` calls the `upsert_transaction(p_tx, p_shares)` RPC
  (migration `20260718120002_upsert_transaction_atomic.sql`) per row — same write path as the web
  store (`web/lib/store.tsx`). SECURITY DEFINER; EXECUTE granted to `authenticated` +
  `service_role` only; NULL `auth.uid()` (service role) skips the auth guard — that is how
  `ADMIN=1` works. The RPC enforces `sum(shares) = amount_cents` and immutability of id,
  household_id, created_by, created_at. Mid-import failure is per-row: earlier rows stay committed
  (`UPSERT_TX (N written)`); re-running is safe (RPC upserts by id, dedupe flags re-imports).
- **`tx-add`/`tx-edit` are NOT.** `db/transactions.ts` still uses the pre-027 two-step insert +
  client-side compensation (parent insert, then shares, rollback on failure) — a crash between the
  writes can still orphan. Untouched since spec 013.
- `txRecord` in `persist.ts` includes `paid_by` (required for settle-up) but has **no `notes`
  key** — force re-upserting an already-imported row through the CLI would null an app-added note.
  The CLI also never reads or writes tags: imports are untagged by design.
- The CLI sits outside the golden-vector harness; parity relies on importing shared modules
  (`computeShares`, `formatMoney`, `filterTransactions`, `effectiveShares`, `PICKABLE_CATEGORIES`).
  What it reimplements (money parsing, date inference incl. Dec→Jan year inference, first-name
  owner matching) is unvectored — see PARITY.md "How parity is enforced".

## 6. Spec-kit flow (`specs/` + `.specify/`)

Features move `specify → plan → tasks → implement` (skills `speckit-specify`, `speckit-plan`,
`speckit-tasks`, `speckit-implement`, plus `speckit-clarify/analyze/checklist/constitution/
taskstoissues/agent-context-update` — 10 total), producing `specs/NNN-short-name/` with spec.md,
plan.md, research.md, data-model.md, quickstart.md, tasks.md, contracts/, checklists/.

- **32 spec dirs**: 001–026 (016/017 skipped; two dirs share prefix 025) plus **seven** `027-*`
  features — numbering is no longer strictly unique. Spec `**Status**` headers are unreliable
  (most shipped specs still say "Draft"); derive ship state from merge commits/PRs.
- **Constitution gate**: every `plan.md` checks `.specify/memory/constitution.md` — **v2.0.0**
  (amended 2026-07-09): web/TS is the single canonical implementation; principles I tokens-only
  design, II calm-over-dense (NON-NEGOTIABLE), III right form factor per canvas, IV plainspoken
  voice/money formatting, V accessible, VI test-driven & regression-safe (NON-NEGOTIABLE — money/
  date math never ships uncovered; golden vectors are a single-implementation regression suite).
- `.specify/feature.json` = `{"feature_directory":"specs/027-transaction-tags"}` (last-run
  feature; nothing is currently in-flight). `init-options.json`: speckit `0.10.3.dev0`,
  integration claude, `script: sh`. `scripts/bash/`: create-new-feature.sh, setup-plan.sh,
  setup-tasks.sh, check-prerequisites.sh, common.sh. `templates/`: 5 (spec/plan/tasks/checklist/
  constitution). `extensions.yml` wires the `agent-context` extension (`after_specify`/
  `after_plan` hooks). `workflows/speckit/` + `workflow-registry.json` bundle the full SDD cycle.

## 7. `.claude/` and root files

- `.claude/skills/` (tracked) — **16 skills**: the 10 `speckit-*`, `ortho-web` (web design-system
  guide — read before web UI work), `remember` + `get-up-to-speed` (session continuity pair),
  `docker-sandbox` (SKILL.md + bootstrap-sandbox.sh + set-github-secret.sh), `kill-sandbox`,
  `create-pr` (templated PR bodies via `.claude/scripts/pr-build-body.sh`; saves prefs to
  `.claude/pr-config.md` on first run).
- `.claude/research/` — 3 memos dated 2026-07-16 (bank-aggregation feasibility,
  bank-statement-upload, plaid-connect).
- `.claude/context-summaries/` — gitignored session handoffs (`latest.md` = most recent); a fresh
  clone/sandbox will not have it.
- Root `.gitignore` covers root/cross-cutting only (subdirs have their own): `temp/`,
  `/CI-SETUP.local.md` and `/.secrets*` (credentials — never commit), `.history-backup/`
  (pre-monorepo bare repos `ortho-ios.git`/`ortho-web.git` — the only local copy of that history),
  `.claude/settings.local.json`, `.claude/context-summaries/`, `Ortho-web/` (stray dir from a
  pre-rename dev server — stop it and restart from `web/`).
- Root `CLAUDE.md` points at the current plan and the session-continuity rule; update it (and
  `feature.json`) when a new feature starts. `PARITY.md` is the cross-surface parity ledger;
  the feature backlog lives in `docs/future_tasks/`.

## 8. Quick start

```bash
nvm use && cd web && npm install     # Node 22; Makefile depends on web/node_modules
# create web/.env.local (see section 1)

make ingest FILE=~/statements/td-may.pdf DRY_RUN=1   # ALWAYS preview first
make ingest FILE=~/statements/td-may.pdf             # real write, interactive review
make tx-list MONTH=2026-06 CATEGORY=dining,coffee
make tx-add MERCHANT='Coffee' AMOUNT='4.50' CATEGORY=dining
make tx-rm ID=<uuid> DRY_RUN=1
```
