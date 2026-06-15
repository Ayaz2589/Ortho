# Implementation Plan: Bank-Statement PDF Import CLI

**Branch**: `004-bank-statement-import` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-bank-statement-import/spec.md`

## Summary

A deterministic, `make`-invoked TypeScript CLI that extracts transactions from a bank-statement PDF and writes them into the shared Supabase database, so imported activity is identical to app-entered activity. Parsing is **codified, not LLM-based**: a shared engine (PDF text extraction → record grouping → merchant normalization → categorization → exclusion flagging → subtotal reconciliation → owner/split assignment → dedupe → persist) plus a thin per-bank **profile** that knows one bank's layout. The bank is auto-detected from the statement text. TD Bank Premier Checking is the only profile in v1; adding a bank is a new profile + fixtures with no engine change. The tool reuses the web package's `Transaction` types, `effectiveSplits`, money helpers, and the exact `transactions`/`transaction_shares` write shapes used by the web store, and runs/tests under the existing `web/` tsx + vitest toolchain.

## Technical Context

**Language/Version**: TypeScript 5 on Node (run via `tsx` ^4.22.4, already a `web/` devDependency).

**Primary Dependencies**: `@supabase/supabase-js` ^2.108 (already present), `pdfjs-dist` (NEW — PDF text extraction in Node), Node built-in `readline/promises` (interactive prompts, no new dep). Reuse `web/lib/types.ts`, `web/lib/format.ts` (`effectiveSplits`), `web/lib/finance/money.ts`.

**Storage**: Supabase Postgres (existing). Tables: `public.transactions`, `public.transaction_shares`, read-only `public.users` / `public.households` / `public.household_members`.

**Testing**: Vitest ^4.1.8 (existing `web/` setup; `npm test` → `vitest run`). Golden-fixture + unit tests for all money/date/parse logic.

**Target Platform**: Local developer machine (macOS), interactive terminal. Not hosted.

**Project Type**: CLI tool living inside the `web/` package (mirrors the `web/scripts/gen-vectors.ts` precedent), orchestrated by a root `Makefile`.

**Performance Goals**: A month-sized statement (≤ a few hundred rows) parses and previews in well under a second; the human review is the only slow part. No throughput target.

**Constraints**: Money is integer USD cents end-to-end (no floats in persisted values). No network/LLM in the parse path — extraction is fully deterministic. Never write without passing reconciliation + explicit confirmation. Idempotent re-runs.

**Scale/Scope**: One profile (TD Bank), one operator, statements of ≤ ~500 rows. ~12–16 small modules + their tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is largely front-end/design-system guidance. Relevant gates for a CLI:

- **Principle VI — Test-Driven & Regression-Safe (NON-NEGOTIABLE)**: BINDING. Every money/date transformation — cents conversion, date resolution, split math, subtotal reconciliation, duplicate detection, categorization, exclusion — is a pure function developed test-first and locked by deterministic tests (golden vector for the TD profile). Tests inject reference dates (no real clock) and mock the data layer (no network). ✅ Satisfied by design (see Phase 1 + tasks).
- **Principle IV — Money Formatting**: APPLIES to the preview output only. The CLI's preview renders money via the shared `formatMoney` so amounts read as money (`$87.42`, income with `+`). ✅
- **Stack constraint — USD cents + Supabase**: APPLIES. All amounts stored as cents; persistence mirrors the web store's exact `transactions`/`transaction_shares` writes. ✅
- **Principles I, II, III, V (design tokens, calm/dense, form factor, accessible web UI)**: N/A — this feature ships **no UI surface** (CLI only). No design-system impact.

**Result**: PASS. No deviations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-bank-statement-import/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities & validation rules
├── quickstart.md        # Phase 1 — end-to-end validation guide
├── contracts/           # Phase 1 — CLI, bank-profile, persistence contracts
│   ├── cli.md
│   ├── bank-profile.md
│   └── persistence.md
└── checklists/
    └── requirements.md  # Spec quality checklist (done)
```

### Source Code (repository root)

```text
Makefile                         # NEW (root) — `make ingest FILE=… [BANK=…] [DRY_RUN=1]`, `make ingest-help`

web/scripts/import/              # NEW — the CLI tool (run via tsx)
├── cli.ts                       # entry: args → orchestrate → interactive review → confirm → persist/summary
├── engine/
│   ├── types.ts                 # ParsedStatement, ParsedTransaction, BankProfile, RunOptions
│   ├── extractText.ts           # pdfjs-dist → per-page text (only IO in the parse path)
│   ├── detectBank.ts            # run profiles' detect(); handle override / ambiguity / no-match
│   ├── money.ts                 # parseAmountToCents("2,800.00") → 280000 (pure)
│   ├── dates.ts                 # resolveStatementDate(mmdd, period) → ISO at noon (pure)
│   ├── categorize.ts            # codified merchant→category rules + fallback (pure)
│   ├── exclusions.ts            # non-spending classifier (transfers/CC-pmt/investment) (pure)
│   ├── reconcile.ts             # per-section parsed-sum vs printed subtotal (pure)
│   ├── split.ts                 # evenSplit (via effectiveSplits) + validateCustomSplit sums to 100 (pure)
│   ├── dedupe.ts                # dedupe key + match vs existing rows (pure)
│   └── toTransaction.ts         # ParsedTransaction + owners → web `Transaction` (pure)
├── profiles/
│   ├── index.ts                 # profile registry (array of BankProfile)
│   └── td-bank.ts               # TD Premier Checking: detect + sections + date + grouping + cleanup
├── db/
│   ├── client.ts                # supabase-js client (sign-in or service-role mode)
│   ├── lookups.ts               # read users / household / membership
│   └── persist.ts               # insert transactions (+ shares for shared) — mirrors txRecord/writeShares
└── README.md                    # usage

web/test/import/                 # NEW — vitest
├── fixtures/
│   ├── td-bank-2026-05.txt          # extracted statement text (golden input)
│   └── td-bank-2026-05.expected.json# expected ParsedStatement (golden output)
├── td-bank.golden.test.ts
├── money.test.ts  dates.test.ts  categorize.test.ts  exclusions.test.ts
├── reconcile.test.ts  split.test.ts  dedupe.test.ts  detectBank.test.ts
└── toTransaction.test.ts
```

**Structure Decision**: The tool lives in `web/scripts/import/` so it directly imports `@/lib/types`, `@/lib/format` (`effectiveSplits`), and `@/lib/finance/money`, and runs under the existing tsx + vitest toolchain (the `web/scripts/gen-vectors.ts` precedent). A thin root `Makefile` is the user-facing entry (`cd web && npx tsx scripts/import/cli.ts …`). The engine is pure and IO-free except `extractText.ts` (PDF read) and `db/*` (Supabase); profiles hold all bank-specific knowledge behind the `BankProfile` interface (FR-027).

## Architecture & Flow

```
make ingest FILE=stmt.pdf [BANK=td] [DRY_RUN=1] [ADMIN=1]
  └─ cli.ts
      1. extractText(pdf)             → string[] (pages)        [engine/extractText]
      2. detectBank(text, override)   → BankProfile | error     [engine/detectBank + profiles]
      3. profile.parse(text)          → ParsedStatement         [profiles/td-bank]
           rows grouped, amounts→cents, mm/dd→ISO, sections tagged income/expense
      4. categorize + exclusions      → annotate each row       [engine/categorize, exclusions]
      5. reconcile(sections)          → BLOCK on mismatch       [engine/reconcile]
      6. interactive review (skip if --yes): per row edit category / include / owners / split
      7. dedupe vs existing rows      → mark skips              [engine/dedupe + db/lookups]
      8. preview + summary; if DRY_RUN or not confirmed → STOP (no writes)
      9. persist included, non-dup rows → transactions (+ shares) [db/persist]
     10. print summary: imported / skipped(dup) / excluded / reconciliation
```

## Phasing (maps to user stories)

- **P1 (US1)** — Engine + TD profile + reconciliation + dry-run preview. Pure, fully testable offline against the golden fixture. **MVP.**
- **P2 (US2)** — Persistence (personal, single-owner) + dedupe + confirm step + summary.
- **P3 (US3)** — Owner reassignment + multi-owner shared splits (even + custom), graceful degrade when no second account/household.

## Complexity Tracking

No constitution violations. (No rows.)
