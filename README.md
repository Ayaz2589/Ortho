# Ortho

A calm, money-first household budgeting app. Two people, one household, shared
and personal money kept in order — on iOS and on the web.

The **web codebase (`web/`) is the single canonical implementation**, delivered on
two targets: a responsive web app and, wrapped via **Capacitor**, the iOS app
(`web/ios/App/`). Both talk to the same Supabase backend. The earlier native
SwiftUI app (`iOS/Ortho-iOS/`) is **frozen** since spec 021 — historical
reference / rollback path only (see `docs/ios.md`).

What the product does today: transactions with splits, tags, and notes;
budgets with rollover bucket types (`fixed` / `flex` / `non_monthly`);
savings and debt-payoff goals with pacing; a Dashboard with an
**Overview | Reports** mode switch (savings rate + category deep-dive);
housing (mortgage, rentals, multifamily occupancy); member settle-up;
receipt/statement scan; connect-only Plaid bank linking; Stripe subscriptions
with a paywall; 6 languages; 7 display currencies over a USD-cents ledger.

## What's inside

```
Ortho/
├── docs/         Deep-dive docs per subsystem — start at docs/index.md
├── web/          Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 —
│                 the canonical implementation; web/ios/App/ is its Capacitor iOS shell
├── iOS/          FROZEN SwiftUI app (Swift) — historical reference / rollback path only
├── shared/       Regression test vectors (finance logic pinning; formerly cross-language)
├── supabase/     Postgres schema + 15 migrations + edge functions (the shared backend)
├── services/     Node cores synced into edge functions: billing (Stripe, spec 018) + aggregation (Plaid, spec 024)
├── specs/        Spec-Driven Development artifacts (Spec Kit)
└── .specify/     Spec Kit config + the project constitution
```

**New here (human or agent)?** Read [`docs/index.md`](docs/index.md) first — it maps how the
pieces fit, then links a deep-dive per subsystem
([web](docs/web.md) · [finance engines](docs/finance.md) · [supabase](docs/supabase.md) ·
[shared vectors](docs/shared.md) · [tooling/Makefile](docs/makefile.md) ·
[ios](docs/ios.md) — Capacitor shell, TestFlight deploy, and the frozen native app).

The four destinations on every canvas: **Dashboard**, **Transactions**, **Housing**,
**Settings**. Budgets and Goals are reached from Settings → Planning; Reports is a
mode inside Dashboard, not a fifth destination.

## Core ideas

- **Money is the headline.** Calm over dense — no gradients, no saturated status
  colors, hairlines over borders. Meaning is carried by position and weight, not
  color. Loss/cost is never red. Self-hosted **Lato**, size-driven weight
  (large display = Light, body = Regular; no bold).
- **All money is stored as integer USD cents** and converted to the display
  currency at render time (live FX with fallback rates).
- **Derived, never stored.** Budget rollover carry, goal progress (sum of
  contributions), and member balances are computed from history on every
  render — there is no month-close job and no cached progress column.
- **Shared vs personal scope.** Shared transactions split between Ortho members;
  personal ones can split with *local users* — name-only people without an
  Ortho account. Transaction + shares are written atomically via the
  `upsert_transaction` Postgres RPC (spec 027).
- **One implementation, pinned against regressions.** The pure-TS finance
  engines (`web/lib/finance/`, splits, balances, filters, reports) are asserted
  against 13 fixtures in `shared/test-vectors/`, so a behavior change never
  ships silently (see `PARITY.md`).
- **Right form factor per canvas.** Bottom tab bar on mobile / the Capacitor
  shell, left sidebar on desktop (≥1024px); bottom sheets on mobile, a shared
  right-side drawer on desktop — one codebase, adapted per canvas.

The design system and product principles are governed by the **constitution** at
[`.specify/memory/constitution.md`](.specify/memory/constitution.md). Detailed
web/desktop guidance lives in the `ortho-web` skill.

## Getting started

### Web (`web/`) — desktop/mobile browser

Node 22 (`.nvmrc`). Requires Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`).

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm test           # full Vitest suite (node + jsdom/Testing Library)
npm run test:tz    # timezone-shifted rerun of date-sensitive suites
npx tsc --noEmit   # typecheck
npm run build      # static export → web/out/ (output: 'export')
```

Deterministic demo data: `npm run gen:corpus` builds the seedable coverage
corpus, `npm run seed:corpus` loads it (spec 026).

### iOS — Capacitor shell of `web/` (`web/ios/App/`)

Same codebase, statically exported and wrapped natively. Requires Xcode
(macOS-only — Linux sandboxes cannot build iOS):

```bash
cd web
npm run build && npx cap sync ios
npx cap open ios     # or: xcodebuild build -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator'
```

**CI:** [`.github/workflows/capacitor-ios-ci.yml`](.github/workflows/capacitor-ios-ci.yml)
build-verifies this on a macOS runner for any push/PR touching `web/**` — the iOS
feedback loop for environments without Xcode. TestFlight deployment is covered in
[`docs/ios.md`](docs/ios.md).

### The frozen native app (`iOS/`)

No new work. [`.github/workflows/ios-ci.yml`](.github/workflows/ios-ci.yml) is
`workflow_dispatch`-only — a manual "does it still compile" check. Local CI
credentials/setup live in the gitignored `CI-SETUP.local.md` at the repo root.

### Backend (`supabase/`)

Postgres schema + migrations (households, members/people, transactions + shares
+ tags + notes, cards, properties/mortgage/lease/units, rental payments, budgets
with rollover, goals + contributions, aggregate RPCs, `upsert_transaction`,
billing/entitlements, Plaid-linked institutions/accounts). Deno **edge
functions** under `supabase/functions/` (Stripe billing + Plaid connect). Apply
with the Supabase CLI;
[`.github/workflows/supabase-migrations.yml`](.github/workflows/supabase-migrations.yml)
validates and auto-applies migrations in CI. Details: [`docs/supabase.md`](docs/supabase.md).

### Importing bank statements (`make ingest`)

A deterministic (no-LLM) CLI parses a bank-statement **PDF or CSV** and writes
transactions into the shared database, identical to app-entered ones. Always
preview first: `make ingest FILE=<statement.pdf|csv> DRY_RUN=1`. It auto-detects the
bank, reconciles PDF sections against printed subtotals (refuses on mismatch),
suggests categories, and lets you assign owners/splits. The same CLI offers
transaction CRUD — `make tx-list / tx-add / tx-edit / tx-rm`. See
[`web/scripts/import/README.md`](web/scripts/import/README.md) and
[`docs/makefile.md`](docs/makefile.md).

## Testing

- **Web:** Vitest runs pure-logic suites (node) and component suites (jsdom +
  Testing Library) under one `npm test`, with v8 coverage on `lib/` business
  logic. One codebase, one suite — this also tests the Capacitor iOS shell.
- **Regression vectors:** 13 JSON fixtures in `shared/test-vectors/` pin the
  finance engines (mortgage, insights, budget rollover, goals, splits, filters,
  balances, and more); regenerate with `npm run gen:vectors`. See
  [`shared/test-vectors/README.md`](shared/test-vectors/README.md) and
  [`docs/shared.md`](docs/shared.md).

New behavior is developed **test-first** (constitution, Principle VI): money
math and date logic never ship without coverage.

## How work flows here

Features move through Spec-Driven Development — `specify → plan → tasks →
implement`, recorded under `specs/`. All seven spec-027 features are merged;
nothing is currently in-flight. The backlog lives in `docs/future_tasks/`.
Agent/contributor working notes live in [`CLAUDE.md`](CLAUDE.md).
