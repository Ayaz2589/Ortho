# Ortho

A calm, money-first household budgeting app. Two people, one household, shared
and personal money kept in order — on iOS and on the web.

The **iOS app is the canonical expression of the product**; the web app is the
*same product on a different canvas* (desktop and responsive), never a redesign.
Both talk to the same Supabase backend, and the financial logic is kept in lockstep
across languages by shared golden test vectors.

## What's inside

```
Ortho/
├── docs/         Deep-dive docs per subsystem — start at docs/index.md
├── iOS/          SwiftUI app (Swift) — the canonical client
├── web/          Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4
├── shared/       Cross-language golden test vectors (finance parity)
├── supabase/     Postgres schema + migrations (the shared backend)
├── specs/        Spec-Driven Development artifacts (Spec Kit)
└── .specify/     Spec Kit config + the project constitution
```

**New here (human or agent)?** Read [`docs/index.md`](docs/index.md) first — it maps how the
pieces fit together, then links to a deep-dive doc for each subsystem
([iOS](docs/ios.md) · [web](docs/web.md) · [supabase](docs/supabase.md) ·
[shared](docs/shared.md) · [tooling/Makefile](docs/makefile.md)).

The four destinations on every canvas: **Dashboard**, **Transactions**, **Housing**,
**Settings** (with Budgets and Insights surfaced within them).

## Core ideas

- **Money is the headline.** Calm over dense — no gradients, no saturated status
  colors, hairlines over borders. Meaning is carried by position and weight, not
  color. Loss/cost is never red. The type is self-hosted **Lato** with a size-driven
  weight model (large display = Light, body = Regular; no bold).
- **All money is stored as USD cents** and converted to the user's display currency
  at render time (live FX with sensible fallback rates).
- **Shared vs personal scope.** Shared transactions belong to the household and split
  between Ortho members; personal transactions are yours, and can be split with
  *local users* — device-only people without an Ortho account.
- **Cross-platform parity without a backend round-trip.** The finance engines
  (mortgage, insights, money/date formatting) are implemented in both TypeScript and
  Swift and asserted against the **same** golden vectors in `shared/test-vectors/`,
  so neither client can silently drift.
- **Right form factor per canvas.** Bottom tab bar on mobile, left sidebar on desktop;
  bottom sheets on iOS, a shared right-side slide-out drawer on web.

The design system and product principles are governed by the **constitution** at
[`.specify/memory/constitution.md`](.specify/memory/constitution.md). Detailed web/desktop
guidance lives in the `ortho-web` skill.

## Getting started

### Web (`web/`)

Next.js App Router app. Requires Node and Supabase env vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm test           # full test suite (Vitest + Testing Library)
npm run test:coverage
npx tsc --noEmit   # typecheck
```

### iOS (`iOS/`)

Open the project in Xcode and run the `Ortho-iOS` scheme (SwiftUI, uses the Supabase
Swift client; preferences persist in `UserDefaults`).

**CI:** [`.github/workflows/ios-ci.yml`](.github/workflows/ios-ci.yml) builds the app and
runs the XCTest parity suites on a macOS runner for any push/PR touching `iOS/` or
`shared/test-vectors/` — the iOS feedback loop for environments without Xcode (Linux dev
sandboxes included). Setup notes and sandbox usage live in the gitignored
`CI-SETUP.local.md` at the repo root.

### Backend (`supabase/`)

Postgres schema and migrations for the shared backend (households, members,
transactions + shares, cards, properties/mortgage/lease/units, rental payments,
budgets, aggregate RPCs). Apply with the Supabase CLI.

### Importing bank statements (`make ingest`)

A deterministic (no-LLM) CLI parses a bank-statement **PDF** and writes
transactions into the shared database, identical to app-entered ones. Always
preview first: `make ingest FILE=<statement.pdf> DRY_RUN=1`. It auto-detects the
bank, reconciles each section against the statement's printed subtotals (and
refuses to import on a mismatch), suggests categories, flags non-spending rows,
and lets you assign owners/splits. The same CLI also offers transaction CRUD —
`make tx-list / tx-add / tx-edit / tx-rm` — for managing transactions from the
terminal. See [`web/scripts/import/README.md`](web/scripts/import/README.md),
[`specs/004-bank-statement-import/`](specs/004-bank-statement-import/), and
[`specs/005-transaction-crud-cli/`](specs/005-transaction-crud-cli/).

## Testing

- **Web:** Vitest runs pure-logic suites (node) and component/behavior suites (jsdom +
  Testing Library) under one `npm test`, with v8 coverage on the `lib/` business logic.
  The mortgage and insight engines are pinned by the shared golden vectors.
- **Parity:** `shared/test-vectors/` is the single source of truth both clients assert
  against — see [`shared/test-vectors/README.md`](shared/test-vectors/README.md).

New behavior is developed **test-first** (see constitution, Principle VI): money math
and date logic are never shipped without coverage.

## How work flows here

Features move through Spec-Driven Development — `specify → plan → tasks → implement`,
recorded under `specs/`. Verification favors typecheck + tests + visual review; a
production build / dev server is never run while a shared dev server is up.

Agent/contributor working notes live in [`CLAUDE.md`](CLAUDE.md).
