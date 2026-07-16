# Ortho

A calm, money-first household budgeting app. Two people, one household, shared
and personal money kept in order — on iOS and on the web.

The **web codebase (`web/`) is the single canonical implementation of the
product**, delivered on two targets: an ordinary responsive web app, and,
wrapped natively via **Capacitor**, the iOS app. Both talk to the same
Supabase backend. (Ortho previously shipped a second, independently-built
native SwiftUI app as the canonical client — that app, `iOS/Ortho-iOS/`, is
now **frozen**: an unmaintained historical reference and rollback path, kept
in the repo but receiving no new work. See `docs/index.md` / `docs/ios.md`.)

## What's inside

```
Ortho/
├── docs/         Deep-dive docs per subsystem — start at docs/index.md
├── web/          Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 —
│                 the canonical implementation; web/ios/App/ is its Capacitor iOS shell
├── iOS/          FROZEN SwiftUI app (Swift) — historical reference / rollback path only
├── shared/       Regression test vectors (finance logic pinning; formerly cross-language)
├── supabase/     Postgres schema + migrations (the shared backend)
├── specs/        Spec-Driven Development artifacts (Spec Kit)
└── .specify/     Spec Kit config + the project constitution
```

**New here (human or agent)?** Read [`docs/index.md`](docs/index.md) first — it maps how the
pieces fit together, then links to a deep-dive doc for each subsystem
([web](docs/web.md) — the canonical implementation, both delivery targets ·
[supabase](docs/supabase.md) · [shared](docs/shared.md) ·
[tooling/Makefile](docs/makefile.md) · [ios](docs/ios.md) — the frozen native app).

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
- **One implementation, pinned against regressions.** The finance engines
  (mortgage, insights, money/date formatting) are pure TypeScript, asserted
  against fixtures in `shared/test-vectors/` so a behavior change never ships
  silently — this used to also lock a second (Swift) implementation in step;
  now it's a single-implementation regression suite (see `PARITY.md`).
- **Right form factor per canvas.** Bottom tab bar on mobile / the Capacitor
  iOS shell, left sidebar on desktop web; bottom sheets on iOS, a shared
  right-side slide-out drawer on desktop web — one codebase, adapted per canvas.

The design system and product principles are governed by the **constitution** at
[`.specify/memory/constitution.md`](.specify/memory/constitution.md). Detailed web/desktop
guidance lives in the `ortho-web` skill.

## Getting started

### Web (`web/`) — desktop/mobile browser

Next.js App Router app. Requires Node and Supabase env vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm test           # full test suite (Vitest + Testing Library)
npm run test:coverage
npx tsc --noEmit   # typecheck
npm run build      # static export → web/out/ (output: 'export')
```

### iOS — Capacitor shell of `web/` (`web/ios/App/`)

The same codebase as above, statically exported and wrapped natively via Capacitor.
Requires Xcode (macOS-only):

```bash
cd web
npm run build && npx cap sync ios
npx cap open ios     # or: xcodebuild build -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator'
```

**CI:** [`.github/workflows/capacitor-ios-ci.yml`](.github/workflows/capacitor-ios-ci.yml)
build-verifies this on a macOS runner for any push/PR touching `web/**` — the iOS
feedback loop for environments without Xcode (Linux dev sandboxes included).

### The frozen native app (`iOS/`)

Historical reference and rollback path only — receives no new work. If you ever need
to compile it (e.g. an emergency rollback), open it in Xcode and run the `Ortho-iOS`
scheme. **CI:** [`.github/workflows/ios-ci.yml`](.github/workflows/ios-ci.yml) is
`workflow_dispatch`-only now — a manual "does it still compile" smoke check, not a
required gate. Setup notes and sandbox usage live in the gitignored
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
  The mortgage and insight engines are pinned by the shared regression vectors. This
  is also the test suite for the Capacitor iOS shell's shared logic — there's one
  codebase, one test suite.
- **Regression vectors:** `shared/test-vectors/` pins the pure finance logic against
  its own output — see [`shared/test-vectors/README.md`](shared/test-vectors/README.md)
  and `docs/shared.md` (which notes this was originally a cross-language lock against
  the now-frozen native app, kept on as an ordinary regression suite).

New behavior is developed **test-first** (see constitution, Principle VI): money math
and date logic are never shipped without coverage.

## How work flows here

Features move through Spec-Driven Development — `specify → plan → tasks → implement`,
recorded under `specs/`. Verification favors typecheck + tests + visual review; a
production build / dev server is never run while a shared dev server is up.

Agent/contributor working notes live in [`CLAUDE.md`](CLAUDE.md).
