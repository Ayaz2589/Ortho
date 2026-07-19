# Implementation Plan: SimpleFIN Bank-Sync (Connect + Transaction Sync)

**Branch**: `028-simplefin-sync` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/028-simplefin-sync/spec.md`

## Summary

Add SimpleFIN as a second bank-data provider behind the existing `linked_provider`
seam (spec 024), delivering **connect + transaction sync**. A member pastes a
single-use SimpleFIN **setup token**; an edge function claims it (base64-decode →
POST claim URL → Access URL with embedded Basic-Auth), stores the Access URL in
Vault, and records the institution + accounts. A sync surface (scheduled daily +
manual rate-limited refresh) pulls `GET {ACCESS_URL}/accounts`, normalizes each
signed decimal-string `amount` into **integer USD cents** (inverted sign vs Plaid:
`+`=inflow), dedupes on `(account, provider txn id)`, reconciles pending→posted, and
writes to the household ledger through the **existing atomic `upsert_transaction`
RPC** (preserving the split-sum invariant). The existing Plaid code is **contained**:
relocated into `deprecated/` namespaces with `@deprecated` markers, kept fully wired
and CI-drift-green as a rollback path. Reuse dominates: no new ledger data model, no
new secret vault, no reshaped provider types. TDD against mocked `fetch` (no live
Bridge account in CI).

## Technical Context

**Language/Version**: TypeScript (ES2022 for the runtime-agnostic core; Node 22 for
web/tests; Deno for edge functions). React 19 / Next.js 16 static export for web.

**Primary Dependencies**: none new in the aggregation core (zero-runtime-dep
extraction contract preserved — SimpleFIN uses the same injected `FetchLike`).
Web reuses existing Supabase client + store. **No `react-plaid-link` equivalent is
needed** — SimpleFIN has no embedded widget (token paste only).

**Storage**: existing Supabase (Postgres) — reuse `linked_institutions`,
`linked_accounts`, `linked_institution_secrets` (Vault), and the `transactions` /
`transaction_shares` ledger via `upsert_transaction`. New: extend `linked_provider`
enum with `simplefin`; add per-connection sync-state columns; add a
`simplefin_link_sessions`-equivalent only if needed (claim is synchronous, so likely
**not** needed — see research D2); add SimpleFIN Vault-wrapper/completion RPCs mirroring
the Plaid ones.

**Testing**: Vitest for the aggregation core (mocked `FetchLike`, `fakeFetch` helper)
and web; Deno pure-logic tests for edge functions; the `shared-sync` drift-lock test;
golden/regression vectors for the money normalization (amount→cents, sign, dedupe,
pending→posted) under `shared/test-vectors/` if they fit the gen harness, else pure
Vitest fixtures.

**Target Platform**: responsive web (Vercel) + Capacitor iOS shell (same build). The
token-paste flow is identical on both — a key simplification over Plaid.

**Project Type**: web application (Next.js) + runtime-agnostic service core + Supabase
edge functions + CLI-adjacent (no CLI change needed).

**Performance Goals**: sync stays within SimpleFIN's ~24 req/day/connection budget;
daily cadence; manual refresh rate-limited (research D5). No latency-critical path.

**Constraints**: USD-cents integer invariant; per-person `transaction_shares` sum =
total (SQL-enforced by `upsert_transaction`); read-only bank access; secrets never
client-visible; aggregation core stays zero-dep and host-import-free; `_shared` copy
byte-identical (drift-lock).

**Scale/Scope**: household app (2 people); ≤10s of linked institutions per household;
bounded ≤90-day backfill window per connection.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. One Design System, Tokens Only** — PASS. Linked-banks UI reuses existing
  tokens/components; no new colors. A "Refresh now" control and provider selection use
  existing button/hairline patterns.
- **II. Calm Over Dense** — PASS. Sync status and errors are short, non-alarmist, never
  red. Money-in uses the existing `--positive` sage; spending is neutral (loss never red).
- **III. Right Form Factor Per Canvas** — PASS. Token-paste works identically on
  web/iOS; no OAuth handback/custom-scheme machinery. Safe-area/keyboard rules already
  satisfied by existing Settings forms.
- **IV. Plainspoken Voice & Money Formatting** — PASS. Synced amounts render through
  the existing money formatter (integer cents; income `+`); copy is second-person.
- **V. Accessible & Interaction-Complete** — PASS. Token input is a labelled `<input>`;
  connect/refresh/disconnect are real `<button>`s, keyboard-reachable.
- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — PASS **and central**. All
  new money/date logic (amount→cents, sign, dedupe, pending→posted) is developed
  test-first with deterministic fixtures; no network in tests (mocked `FetchLike`);
  `npm test` gates. This is the highest-risk area and gets the heaviest coverage.

**No violations.** Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/028-simplefin-sync/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 — provider mechanics + design decisions
├── data-model.md        # Phase 1 — schema deltas, sync state, dedupe keys
├── quickstart.md        # Phase 1 — how to run/verify (mocked); operator runbook
├── contracts/
│   ├── simplefin-functions.md      # edge-function request/response + error codes
│   └── accounts-sync-lifecycle.md  # claim → sync → dedupe → reconcile state machine
├── checklists/
│   └── requirements.md  # spec quality checklist (done)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
services/aggregation/
├── src/
│   ├── types.ts                 # + 'simplefin' to LinkedProvider; shared sync types
│   ├── index.ts                 # export deprecated/plaid + new simplefin surface
│   ├── simplefin.ts             # NEW: claim/accounts request builders + parsers
│   ├── simplefinClient.ts       # NEW: Basic-Auth fetch client (FetchLike-injected)
│   ├── normalize.ts             # NEW: amount(decimal string)→USD cents, sign, dedupe key
│   └── deprecated/
│       ├── plaid.ts             # MOVED from src/plaid.ts (+ @deprecated banner)
│       └── plaidClient.ts       # MOVED from src/plaidClient.ts (+ @deprecated banner)
├── test/
│   ├── simplefin-claim.test.ts        # NEW
│   ├── simplefin-accounts.test.ts     # NEW
│   ├── normalize.test.ts              # NEW (money — heaviest coverage)
│   └── (existing plaid tests unchanged, imports repointed to deprecated/)
└── scripts/sync-to-functions.mjs      # unchanged (copies whole src/ tree incl. deprecated/)

supabase/
├── migrations/2026XXXXXXXXXX_simplefin_sync.sql   # NEW: enum value, sync columns, RPCs
└── functions/
    ├── simplefin-claim/index.ts       # NEW: claim setup token → Vault → institution+accounts
    ├── simplefin-sync/index.ts        # NEW: pull /accounts → normalize → upsert_transaction
    ├── simplefin-disconnect/index.ts  # NEW: delete secret + mark disconnected
    ├── plaid-*                        # unchanged (kept wired)
    └── _shared/aggregation/           # regenerated byte-copy (incl. deprecated/ + simplefin)

web/
├── lib/
│   ├── aggregation.ts           # + SimpleFIN client fns (claim/sync/disconnect), provider-aware
│   └── types.ts / supabase/rows.ts  # + 'simplefin' to LinkedProvider; sync-state fields
├── components/settings/
│   ├── LinkedBanks.tsx          # SimpleFIN primary; Plaid de-emphasized
│   ├── SimpleFinConnect.tsx     # NEW: token-paste connect form
│   └── deprecated/              # MOVED EmbeddedPlaidLink.tsx (+ @deprecated)
└── (PlaidHandBack / plaid-oauth kept; unused by SimpleFIN)
```

**Structure Decision**: Web application + runtime-agnostic core + edge functions,
mirroring spec 024 exactly. SimpleFIN is **additive** behind the existing seam; Plaid
is relocated under `deprecated/` sub-namespaces (core `src/deprecated/`, web
`components/settings/deprecated/`) but stays imported and CI-drift-locked. The
aggregation `sync-to-functions.mjs` copies the whole `src/` tree, so nested
`deprecated/` and new `simplefin*` files are covered without script changes (verify:
it currently reads only top-level `.ts` — **research D6** resolves whether the script
needs recursion).

## Complexity Tracking

> No constitution violations. Section intentionally empty.
