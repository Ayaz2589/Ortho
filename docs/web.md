# Ortho Web (`web/`)

## 1. Purpose

`web/` is the Next.js port of the Ortho iOS app — "the same product on a different canvas" (desktop + responsive), never a redesign. The iOS app (`iOS/`, see [./ios.md](./ios.md)) is the canonical expression of the product; the web app talks to the **same live Supabase project** and keeps its financial logic in lockstep with Swift via shared golden test vectors in `shared/test-vectors/` (see [./shared.md](./shared.md)).

It is a household-finance app with four destinations on every canvas: **Dashboard**, **Transactions**, **Housing**, **Settings** (Budgets and Insights are surfaced within them). All money is stored as integer **USD cents** and converted to the display currency at render time.

The package also hosts a deterministic (no-LLM) **bank-statement import + transaction CRUD CLI** (`web/scripts/import/`) that writes to the same database, driven by the root Makefile (see [./makefile.md](./makefile.md)).

## 2. Stack & key dependencies

From `web/package.json` (`ortho-web`, requires **Node >= 20.19.0 or >= 22.12.0**):

| Dependency | Version | Role |
|---|---|---|
| `next` | **16.2.9** (pinned) | App Router; note Next 16 renamed `middleware.ts` → `proxy.ts` |
| `react` / `react-dom` | **19.2.4** (pinned) | UI |
| `typescript` | ^5 | strict mode, `@/*` path alias to package root |
| `tailwindcss` + `@tailwindcss/postcss` | ^4 | Tailwind v4 (CSS-first, `@config` bridge to `tailwind.config.ts`) |
| `@supabase/supabase-js` | ^2.108.1 | data + auth client |
| `@supabase/ssr` | ^0.12.0 | cookie-based SSR session (browser/server/proxy clients) |
| `lucide-react` | ^1.17.0 | outlined monochrome icons (matches iOS SF Symbols) |
| `recharts` | ^3.8.1 | dashboard charts |
| `clsx` + `tailwind-merge` | ^2.1.1 / ^3.6.0 | `cn()` helper in `web/lib/utils.ts` |
| `vitest` + `@vitest/coverage-v8` | ^4.1.8 | tests (Vitest 4 needs Node >= 20.19 for `require(ESM)`) |
| `@testing-library/react` / `jest-dom` / `user-event`, `jsdom` | — | component tests |
| `tsx` | ^4.22.4 | runs the import CLI and `gen-vectors.ts` |
| `unpdf`, `ws` | dev | PDF text extraction / Supabase realtime shim for the CLI |

Deployed on Vercel (`web/.vercel/project.json`, project `ortho`).

**Heads-up (from `web/AGENTS.md` / `web/CLAUDE.md`):** this Next.js version has breaking changes vs. older training data — consult the bundled guides in `web/node_modules/next/dist/docs/` before writing Next-specific code.

## 3. Directory map

```
web/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # root layout: self-hosted Lato, pre-paint appearance boot script
│   ├── globals.css             # ALL design tokens (light/dark CSS vars) + ow-* desktop chrome
│   ├── page.tsx                # "/" → redirect('/dashboard')
│   ├── sign-in/page.tsx        # email-OTP sign-in (8-digit code, no password)
│   ├── fonts/                  # Lato-{Light,Regular,Bold,Black}.ttf — same files iOS bundles
│   └── (app)/                  # authed route group
│       ├── layout.tsx          # 'use client' shell: AppStateProvider + Sidebar + TabBar
│       ├── dashboard/page.tsx  # branches mobile stack vs DashboardDesktop at ≥1024px
│       ├── transactions/page.tsx
│       ├── housing/page.tsx
│       ├── budgets/page.tsx
│       └── settings/page.tsx, settings/household/page.tsx
├── proxy.ts                    # Next 16 "middleware": Supabase session refresh + auth gate
├── components/
│   ├── ui.tsx                  # primitives: Card, SectionLabel, Avatar, StackedAvatars, PageHeader, Modal…
│   ├── inputs.tsx              # form inputs
│   ├── layout.tsx              # ReadingColumn (560px centered column)
│   ├── Sidebar.tsx             # desktop nav (icon rail @sm, full @lg) + household footer + sign-out
│   ├── TabBar.tsx              # mobile bottom tab bar (sm:hidden, backdrop-blur)
│   ├── dashboard/              # widget cards (MonthSummary, Insights, BudgetProgress, SpendByCategory,
│   │                           #   PerOwnerBreakdown, TopMerchants, HousingSnapshot, DailySpendTrend,
│   │                           #   MonthPicker, RangePicker) + range.ts (pure range math, iOS-mirrored)
│   ├── transactions/           # TransactionRow, TransactionDetailModal/Body, BalanceSummary
│   ├── housing/                # PropertyCard/Content, Mortgage/Rental/Multifamily cards, Add modals
│   ├── budgets/BudgetDrawer.tsx
│   ├── settings/               # rows, ChoiceRows, HouseholdDrawer, AddCardModal, appearance.ts (THEME_VARS)
│   └── web/                    # ≥1024px desktop chrome: DashboardDesktop, TransactionsDesktop,
│                               #   HousingDesktop, Drawer (shared slide-out), WebModal, TxForm,
│                               #   TxModalWeb, FilterPanel, ActiveFilterChips, kit.tsx (WebPageHeader, Seg…)
├── lib/
│   ├── store.tsx               # AppStateProvider — the entire client data layer (React context)
│   ├── supabase/client.ts      # createBrowserClient
│   ├── supabase/server.ts      # createServerClient (cookies)
│   ├── api/aggregates.ts       # wrappers over Postgres aggregate RPCs (ADDITIVE — not yet wired)
│   ├── finance/                # pure engines: money.ts, currency.ts, mortgage.ts, insights.ts
│   ├── splits.ts               # split math + orderedOwnerIds (canonical leftover-cent order)
│   ├── balances.ts             # member settle-up balance (mirrors iOS Balances.swift)
│   ├── transactionFilters.ts   # filter engine + monthBounds
│   ├── format.ts               # date grouping, effectiveShares
│   ├── categories.ts           # category metadata + paletteFor
│   ├── types.ts                # domain types mirroring the Supabase schema; exports PICKABLE_CATEGORIES
│   ├── language.ts             # language → BCP-47 locale (bn pinned to Latin digits)
│   ├── i18n/                   # full-UI translation catalogs (bn/es/ja/zh/ko), seeded from iOS xcstrings; store exposes t()
│   │                           #   layout invariant: iOS-seeded block, `— web-only keys —` marker, web-only block
│   ├── useMediaQuery.ts        # useIsExpanded() = (min-width: 1024px)
│   ├── useDashboardRange.ts    # persisted range + transient month scope hook
│   └── useTransactionFilters.ts
├── scripts/
│   ├── gen-vectors.ts          # regenerates shared/test-vectors/*.json from the TS engines
│   ├── import/                 # bank-statement import + tx CRUD CLI (engine/, profiles/, db/, cli.ts, tx.ts)
│   └── maintenance/repair-legacy-dates.ts  # one-shot date repair (make repair-dates, dry-run by default)
├── test/                       # 63 Vitest files, 705 tests (unit, jsdom component, *.parity.test.ts,
│   │                           #   i18n/ catalog + render-locale locks, import/ golden suites + fixtures/,
│   │                           #   helpers/supabase-mock.ts)
│   └── setup.ts                # jest-dom matchers + conditional RTL cleanup
├── next.config.ts              # images.remotePatterns → brujhxmtzfgowimprueo.supabase.co
├── tailwind.config.ts          # maps semantic color names → CSS variables
├── vitest.config.ts            # node default env, fileParallelism:false, v8 coverage thresholds
├── postcss.config.mjs          # @tailwindcss/postcss
└── .env.local                  # NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
```

## 4. Architecture

### Routing & auth
- `app/page.tsx` redirects `/` → `/dashboard`. All product pages live in the `(app)` route group; each page is a `'use client'` component.
- **Auth gate** is `web/proxy.ts` (Next 16's `middleware.ts` replacement): it creates an `@supabase/ssr` server client over request cookies, calls `auth.getUser()`, redirects signed-out users to `/sign-in` and signed-in users away from `/sign-in`. There is deliberately **no single-active-platform lock** — iOS and web may be signed in simultaneously (feature 010); the 30-day cap is Supabase's session timebox.
- Sign-in (`app/sign-in/page.tsx`) is passwordless email OTP: `signInWithOtp` → `verifyOtp(type: 'email')` → `router.replace('/dashboard')`.

### Test-build feature flags (spec 015)
A **Developer** section on the Settings page (`components/settings/flags-section.tsx`) exposes **Use test data** and **Bypass auth**, letting a tester run the app on a disposable in-memory dataset without touching the live shared backend.
- **Gating:** `lib/test-build.ts` `isTestBuild()` (`NEXT_PUBLIC_VERCEL_ENV`/`NODE_ENV !== 'production'`) gates both the section and every flag-honoring branch, so they **dead-code-eliminate from the production bundle**. Flags persist via `lib/flags.ts` (`localStorage['ortho.flags']`, mirroring `appearance.ts`) and read all-off off a test build (FR-003). Bypass also sets an `ortho_bypass_auth` **cookie** because the `proxy.ts` middleware runs server-side and can't read localStorage.
- **Isolation (the single seam):** when `isTestBuild() && effectiveUseTestData(readFlags())`, `lib/supabase/client.ts` returns an **in-memory seeded client** (`lib/testdata/memory-client.ts`, a productionized copy of `test/helpers/supabase-mock.ts`, seeded from `lib/testdata/seed.ts`) instead of `createBrowserClient`. Because the store funnels every read/write/auth call through that one handle, no live call is constructed — the store needs no changes; toggling a flag reloads to re-bootstrap from a clean seed.
- **Auth bypass has two halves:** `proxy.ts` skips the `/sign-in` redirect when `isTestBuild()` + the cookie; the store boots from the seed client (its `getUser` returns a seed user; `onAuthStateChange` never fires `SIGNED_OUT`). The seed is Person-centric (owner_ids + shares + paid_by, budgets, rental, transfers). Tests: `test/{flags,settings,store,proxy}/*`. Outside the golden-vector harness (PARITY.md).

### Data layer — one React context, optimistic writes
`lib/store.tsx` (`AppStateProvider` / `useApp()`) is the whole client data layer, mirroring iOS `AppState`:
- **Bootstrap** (once, in the `(app)` layout): `auth.getUser()` → upsert the `users` profile row → find-or-create `households` + `household_members` → ensure the account holder has a `household_people` row (and fold legacy device-only `localUsers` from localStorage) → `loadAll()`.
- **`loadAll()`** issues 11 parallel Supabase selects: `users`, `household_people`, `transactions`, `transaction_shares`, `cards`, `properties`, `mortgage_info`, `lease_info`, `units`, `rental_payments`, `budgets`; it then stitches properties with their mortgage/lease/units and **rehydrates** each transaction's `owner_ids` + per-person `shares` map from `transaction_shares` rows (a `transfer` with no shares gets `owner_ids: []`, never a synthesized owner).
- **Mutations are optimistic with rollback**: state updates immediately, the Supabase write runs async, and failure restores the previous state and sets a banner `error`. Transaction writes are **atomic with shares**: if `transaction_shares` fails after the parent insert/update, the parent is deleted/restored so a share-less row never survives (matches iOS's all-or-nothing write; see `writeShares`, `addTransaction`, `updateTransaction`).
- **FX**: `refreshRates()` fetches `https://www.floatrates.com/daily/usd.json` and caches in localStorage (`fxRates` / `fxRatesFetchedAt`, refreshed after 24h). On fetch failure it KEEPS the last cached live rates at any age (mirrors iOS; since 2026-07-02) and surfaces a freshness caption in Settings; the hardcoded `FALLBACK_RATE_FROM_USD` (`lib/finance/currency.ts`) applies only when no cache has ever existed. `formatMoney` converts USD cents → display currency with the active locale.
- **Preferences in localStorage**: `currency`, `language`, `appearance`, `dashboardRange` (+ FX cache). All are adopted *after mount* so SSR and first client paint agree — no hydration mismatch.
- `lib/api/aggregates.ts` wraps the shared Postgres aggregate RPCs (`household_owner_spend` etc., defined in `supabase/migrations/20260611120000_aggregates.sql`). It is **additive and not yet wired** — dashboard widgets still compute locally; the file documents the per-widget cut-over plan.

### Pure finance core (parity-locked)
`lib/finance/{money,currency,mortgage,insights}.ts`, `lib/splits.ts`, `lib/balances.ts`, `lib/transactionFilters.ts`, and `components/dashboard/range.ts` are pure TypeScript mirrored by Swift on iOS and pinned by golden vectors. `npm run gen:vectors` (`scripts/gen-vectors.ts`) regenerates `shared/test-vectors/*.json` from these TS implementations; both the web `*.parity.test.ts` suites and the iOS XCTest suite assert against the same files, so neither language can silently drift. Key invariants: integer USD cents everywhere, `orderedOwnerIds` canonicalizes the deterministic leftover cent, half-open `[start, end)` month windows. Since spec 013, `generateInsights` takes a trailing `locale` parameter (threaded from the store's `localeForLanguage` value; vectors stay language-neutral at the default `en-US`), and the recurring insight's 3-merchant preview is vector-locked via `Insight.preview_merchants` — amount descending, case-insensitive name tie-break, casing from the newest transaction. `lib/types.ts` also exports `PICKABLE_CATEGORIES` (transfer is deliberately unpickable) with `TransactionCategory` derived from it.

### Responsive behavior
Three tiers, one source of truth (`lib/useMediaQuery.ts`):
- **< 640px (mobile)**: bottom `TabBar` (`sm:hidden`), single-column stacks, bottom padding `pb-24` clears the bar.
- **640–1023px (sm)**: `Sidebar` appears as a 72px icon rail; TabBar hides; `<main>` becomes the scroll container (`sm:h-screen sm:overflow-y-auto`).
- **≥ 1024px (lg / "expanded")**: `useIsExpanded()` flips pages to the desktop compositions in `components/web/` — pages literally branch: `if (isExpanded) return <DashboardDesktop scope={scope} />` (see `app/(app)/dashboard/page.tsx`). Desktop uses a 12-column `ow-grid`, a ledger table + right-side detail **Drawer** (`components/web/Drawer.tsx`: portal to `<body>`, scrim, Escape/scrim-click close, scroll lock), and centered `WebModal`s. Scope/filter state is lifted into hooks (`useDashboardScope`, `useTransactionFilters`) so a window resize across the breakpoint preserves selection.

### Styling & design tokens
- **`app/globals.css` is the single source of truth for tokens.** Semantic CSS variables (`--bg`, `--surface`, `--text/-2/-3`, `--accent`, `--positive`, `--destructive`, `--hairline`), the six household palettes (`peach/slate/sage/terracotta/mauve/sand` bg+fg), desktop handoff tokens (`--surface-2`, `--chip-bg`, `--chip-text`), fixed category tints (`--cat-*`), and motion/elevation tokens. Dark mode comes from `@media (prefers-color-scheme: dark)` plus `:root[data-appearance='light'|'dark']` override blocks for the Settings toggle.
- **Forced appearance without flash**: `components/settings/appearance.ts` exports `THEME_VARS`; `app/layout.tsx` embeds it verbatim in an inline `APPEARANCE_BOOT` script that reads the `appearance` localStorage key and sets `data-appearance` + inline vars on `<html>` *during HTML parse* — theme is correct on the first frame.
- **Tailwind v4** with `@config "../tailwind.config.ts"`; the config maps utility color names (`bg-surface`, `text-text-2`, `border-hairline`, `bg-sage-bg`…) onto the CSS variables. Desktop-only chrome uses handwritten `ow-*` classes in globals.css (`ow-card`, `ow-grid`/`ow-s5..s12`, `ow-nav-item`, `ow-drawer`/`ow-drawer-scrim`, `ow-modal`, `ow-tab-*`, `ow-search`, `ow-cap`…), ported from the design handoff.
- **Type**: self-hosted Lato via `next/font/local` (the exact `.ttf` files iOS bundles — no Google Fonts CDN), exposed as `--font-lato`. iOS weight model: weight follows size (display = Light 300, body = Regular 400, **no bold**; `font-synthesis: none`).
- Calm-design rules (from the constitution / `ortho-web` skill): hairlines over borders, no saturated status colors, loss is never red; `:focus-visible` gets a 1.5px accent outline; `.ortho-interactive` provides hover/active surface lift; `prefers-reduced-motion` collapses all transitions; long transaction lists use `.cv-row` (`content-visibility: auto`) for scroll performance.

## 5. Key files (read these first)

1. `web/lib/store.tsx` — the entire client data layer: bootstrap, loadAll, optimistic CRUD with rollback, atomic tx+shares writes, FX, owner resolution.
2. `web/proxy.ts` — auth gate + Supabase cookie session refresh (Next 16 middleware).
3. `web/app/layout.tsx` — root layout: Lato font, pre-paint appearance boot script.
4. `web/app/globals.css` — every design token (light/dark) + the `ow-*` desktop chrome.
5. `web/app/(app)/layout.tsx` — the app shell (provider + Sidebar + TabBar + loading/error states).
6. `web/lib/types.ts` — domain types (Transaction/Person/Property…) mirroring the Supabase schema; doc-comments explain `paid_by`, `transfer`, `owner_ids`, `shares`; `PICKABLE_CATEGORIES` → `TransactionCategory`.
7. `web/lib/useMediaQuery.ts` — `useIsExpanded()` (≥1024px), the responsive branch point.
8. `web/app/(app)/dashboard/page.tsx` — the canonical mobile-vs-desktop branching pattern.
9. `web/components/web/TransactionsDesktop.tsx` — the biggest desktop composition (ledger table + drawer).
10. `web/components/web/Drawer.tsx` — the shared right-side slide-out master–detail panel.
11. `web/components/web/TxForm.tsx` — add/edit transaction form incl. splits and transfers (637 lines, the most complex form).
12. `web/lib/splits.ts` — split math + `orderedOwnerIds` (parity-critical).
13. `web/lib/finance/insights.ts` and `web/lib/finance/mortgage.ts` — the vectored engines.
14. `web/lib/useDashboardRange.ts` + `web/components/dashboard/range.ts` — dashboard scope (persisted range + transient month).
15. `web/components/ui.tsx` and `web/components/web/kit.tsx` — shared primitives (mobile) and desktop chrome components.
16. `web/scripts/gen-vectors.ts` — how golden vectors are produced.
17. `web/vitest.config.ts` — test envs, coverage scope + thresholds.
18. `web/scripts/import/README.md` — the CLI's full contract (flags, exit codes, adding a bank).
19. `web/components/settings/appearance.ts` — `THEME_VARS`, single source for boot + live theme toggle.
20. `web/lib/api/aggregates.ts` — the not-yet-wired RPC layer and its cut-over plan.

## 6. Build / run / test

All commands run from `web/` (works on Linux dev sandboxes — nothing here is macOS-only; only the iOS app needs Xcode):

```bash
cd web
npm install
npm run dev              # http://localhost:3000
npm run build            # next build
npm start                # next start (after build)
npm test                 # vitest run — 63 files / 705 tests (verified green, 2026-07-02 / spec 013)
npm run test:coverage    # v8 coverage, thresholds enforced (see vitest.config.ts)
npm run gen:vectors      # regenerate shared/test-vectors/ from the TS engines
npx tsc --noEmit         # typecheck
```

**Environment** (`web/.env.local`, not committed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required by app + proxy + CLI); `SUPABASE_SERVICE_ROLE_KEY` (only for the CLI's `ADMIN=1` mode); `IMPORT_EMAIL` (optional, CLI OTP sign-in). The live Supabase project is `brujhxmtzfgowimprueo.supabase.co` (also whitelisted in `next.config.ts` image remotePatterns).

**CLI** (from the **repo root**, via the Makefile — see [./makefile.md](./makefile.md)):
```bash
make ingest FILE=<statement.pdf|csv> [BANK=td|apple|amex|chase] [DRY_RUN=1] [YES=1] [ADMIN=1]
make tx-list / tx-add / tx-edit / tx-rm     # transaction CRUD; make ingest-help for flags
make repair-dates [APPLY=1] [ADMIN=1]       # scripts/maintenance/repair-legacy-dates.ts (dry-run by default)
```

Since spec 013 the CLI is parity-aligned with the apps: `tx list` runs the shared
`filterTransactions` engine in-process (only the date window is pushed into SQL), is
household-wide in scope, supports `QUERY`/`OWNER` and multi-select flags, and prints an explicit
truncation notice when results are cut off; transaction writes compensate on failure (parent
rollback on create, prior-shares restore on update), and `validateCustomSplit` delegates to the
shared `validateSplit`.

## 7. Conventions & patterns

- Every page/component that touches state is `'use client'`; there are no server components beyond the root layout and no API routes — data access is direct Supabase from the browser (RLS enforces access).
- **State**: one context (`useApp()`), no Redux/query lib. Mutations are optimistic-with-rollback; errors surface via the store's `error` banner in the shell, never thrown.
- **Money**: integer USD cents in and out of every pure function; conversion/formatting only at render via `formatMoney` (U+2212 for negatives, per parity rules).
- **Responsive branching**, not CSS-only: pages return an entirely different desktop composition from `components/web/` at ≥1024px; shared scope hooks keep state across the breakpoint.
- **Styling**: Tailwind utilities bound to semantic tokens for shared components; handwritten `ow-*` classes (plus some inline `style` for exact handoff metrics) for desktop chrome. Never hardcode colors — always tokens; loss/cost is never red; no bold text.
- **Naming**: mobile-shared feature components in `components/<feature>/`; desktop-only in `components/web/`; pure logic in `lib/` (hooks prefixed `use*`); parity-vectored logic carries doc-comments naming its Swift mirror and vector file.
- **Tests**: pure logic in node env; component suites opt into jsdom with a `// @vitest-environment jsdom` first line; parity suites are named `*.parity.test.ts`; Supabase is mocked via `test/helpers/supabase-mock.ts`. New money/date behavior is developed test-first (constitution Principle VI).
- **i18n locks** (`web/test/i18n/`, spec 013): `catalog-parity.test.ts` enforces catalog coverage, shared-key identity with the iOS string catalog, digit rules, and call-site validity — every literal `t()`/`tr()` key in the codebase must resolve in all five catalogs; `render-locale.test.tsx` renders key screens under jsdom in Español and 日本語 and asserts no English fallback leaks. Keep the catalog layout invariant (iOS-seeded block, `— web-only keys —` marker, web-only block) when adding keys.

## 8. Gotchas

- **Native binaries vs. Linux sandboxes (the big one).** `web/node_modules` is typically installed on macOS-arm64, so Linux-arm64 sandboxes fail with `Cannot find module '@rolldown/binding-linux-arm64-gnu'` (vitest) or missing `lightningcss`/oxide/swc bindings (next build). Fix without touching the lockfile: `npm install @rolldown/binding-linux-arm64-gnu lightningcss-linux-arm64-gnu @tailwindcss/oxide-linux-arm64-gnu @next/swc-linux-arm64-gnu --no-save`. (Verified: after installing the rolldown binding, the full suite passes.)
- **This is Next 16** — `proxy.ts` replaces `middleware.ts`; other conventions may differ from memory. Per `web/AGENTS.md`, read `web/node_modules/next/dist/docs/` before writing Next-specific code.
- **Node >= 20.19 required** (vitest 4 uses `require(ESM)`); `package.json` engines enforce it.
- **Vitest runs files sequentially** (`fileParallelism: false`) because parallel jsdom worker startup races in sandboxes; don't "optimize" this away.
- **Coverage is scoped**, not global: only the pure `lib/` business logic and `scripts/import/**` are measured, with thresholds (90/90/80/90 overall; slightly lower for `scripts/import/**`). View components are behaviorally tested, not line-covered.
- **`lib/api/aggregates.ts` is not wired** — widgets still aggregate client-side; the RPCs exist in `supabase/migrations/20260611120000_aggregates.sql`.
- **If you change any parity engine**, regenerate vectors (`npm run gen:vectors`) and expect the iOS suite to need the same change — golden vectors are the contract (see `PARITY.md` at the repo root).
- **localStorage keys** the app depends on: `currency`, `language`, `appearance`, `dashboardRange`, `fxRates`/`fxRatesFetchedAt`, legacy `localUsers` (folded into `household_people` on first boot, then removed).
- **FX needs network** (`floatrates.com`); offline it reuses the last cached live rates (with a staleness caption in Settings), and only a never-fetched install sees `FALLBACK_RATE_FROM_USD`.
- **Stale references to a "platform lock"**: the single-active-platform session lock was removed in feature 010; `proxy.ts` documents this. Concurrent iOS + web sessions are expected.
- **Appearance is applied by an inline boot script** in `app/layout.tsx` that embeds `THEME_VARS` — if you change theme tokens, update `app/globals.css` **and** `components/settings/appearance.ts` (they must mirror each other).
- The generated `web/coverage/` and `tsconfig.tsbuildinfo` are build artifacts; `web/README.md` is the untouched create-next-app boilerplate (the real docs are the root `README.md`, `PARITY.md`, and `web/scripts/import/README.md`).

## 9. Cross-links

- [./supabase.md](./supabase.md) — the shared schema this client reads/writes (`transactions` + `transaction_shares`, `household_people`, properties/mortgage/lease/units, budgets, aggregate RPCs).
- [./ios.md](./ios.md) — the canonical client; Swift mirrors of `lib/splits.ts`, `lib/balances.ts`, `lib/finance/*`, `components/dashboard/range.ts`.
- [./shared.md](./shared.md) — golden test vectors; generated *from* this package by `web/scripts/gen-vectors.ts`.
- [./makefile.md](./makefile.md) — `make ingest` / `tx-*` targets that drive `web/scripts/import/` via `npx tsx`.
- Repo-root `PARITY.md` — the audited web/iOS/CLI parity matrix; `.specify/memory/constitution.md` and the `ortho-web` skill — design-system law for this app.
