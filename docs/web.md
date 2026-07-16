# Ortho Web (`web/`)

## 1. Purpose

`web/` is the **single canonical implementation of Ortho** (Next.js + React + TypeScript) — since
spec 021 (2026-07-09), it ships on **two delivery targets from the same codebase**: an ordinary
responsive web app (desktop + mobile browsers), and, statically exported and wrapped natively via
**Capacitor**, the iOS app (`web/ios/App/` — see §4 "Capacitor iOS shell" below). The previously
canonical native SwiftUI app (`iOS/Ortho-iOS/`, see [./ios.md](./ios.md)) is now **frozen** — a
historical reference and rollback path, receiving no new work. There is no longer a second
implementation to keep in lockstep with; the golden-vector system in `shared/test-vectors/` (see
[./shared.md](./shared.md)) is kept as an ordinary single-implementation regression suite, not a
cross-language lock (see root `PARITY.md`).

It is a household-finance app with four destinations on every canvas: **Dashboard**, **Transactions**, **Housing**, **Settings** (Budgets and Insights are surfaced within them). All money is stored as integer **USD cents** and converted to the display currency at render time.

The package also hosts a deterministic (no-LLM) **bank-statement import + transaction CRUD CLI** (`web/scripts/import/`) that writes to the same database, driven by the root Makefile (see [./makefile.md](./makefile.md)).

## 2. Stack & key dependencies

From `web/package.json` (`ortho-web`, requires **Node >= 20.19.0 or >= 22.12.0**):

| Dependency | Version | Role |
|---|---|---|
| `next` | **16.2.9** (pinned) | App Router; `output: 'export'` (static export, spec 021 — no server at runtime) |
| `react` / `react-dom` | **19.2.4** (pinned) | UI |
| `typescript` | ^5 | strict mode, `@/*` path alias to package root |
| `tailwindcss` + `@tailwindcss/postcss` | ^4 | Tailwind v4 (CSS-first, `@config` bridge to `tailwind.config.ts`) |
| `@supabase/supabase-js` | ^2.108.1 | data + auth client |
| `@supabase/ssr` | ^0.12.0 | cookie-based session on desktop/mobile web (native uses Keychain instead — see below) |
| `lucide-react` | ^1.17.0 | outlined monochrome icons (matches the frozen app's SF Symbols) |
| `recharts` | ^3.8.1 | dashboard charts |
| `clsx` + `tailwind-merge` | ^2.1.1 / ^3.6.0 | `cn()` helper in `web/lib/utils.ts` |
| `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` | ^8.4.1 | native iOS shell (spec 021); SPM package manager, not CocoaPods |
| `@capacitor/{app,camera,haptics,keyboard,share,splash-screen,status-bar}` | ^8.x | native-feel plugins — see §4 "Capacitor iOS shell" |
| `@capawesome/capacitor-file-picker` | latest | Files-app PDF picking (statement import) |
| `@aparajita/capacitor-{biometric-auth,secure-storage}` | latest | Face ID/Touch ID gate; Keychain-backed session storage |
| `@capacitor/assets` | ^3.0.5 (dev) | app icon / splash-screen asset generation |
| `vitest` + `@vitest/coverage-v8` | ^4.1.8 | tests (Vitest 4 needs Node >= 20.19 for `require(ESM)`) |
| `@testing-library/react` / `jest-dom` / `user-event`, `jsdom` | — | component tests |
| `tsx` | ^4.22.4 | runs the import CLI and `gen-vectors.ts` |
| `unpdf`, `ws` | dev | PDF text extraction / Supabase realtime shim for the CLI |

Desktop/mobile web is deployed on **Vercel** (project `ortho`), **auto-deployed from GitHub**: every
push/merge to `main` → **production**, every other branch/PR → a **preview** URL. See §6 "Vercel
deployment" for the one non-obvious setting (Root Directory = `web`). The Capacitor iOS shell ships
via TestFlight/App Store from `web/ios/App/` (see `./deploy.md`).

**Heads-up (from `web/AGENTS.md` / `web/CLAUDE.md`):** this Next.js version has breaking changes vs. older training data — consult the bundled guides in `web/node_modules/next/dist/docs/` before writing Next-specific code.

## 3. Directory map

```
web/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # root layout: self-hosted Lato, pre-paint appearance boot script, viewport-fit=cover
│   ├── globals.css             # ALL design tokens (light/dark CSS vars) + ow-* desktop chrome + safe-area/native-feel rules
│   ├── page.tsx                # "/" → 'use client' redirect to /dashboard (spec 021: was a Server Component redirect())
│   ├── sign-in/page.tsx        # email-OTP sign-in (8-digit code, no password) + redirect-away-if-signed-in
│   ├── fonts/                  # Lato-{Light,Regular,Bold,Black}.ttf — same files the frozen app bundled
│   └── (app)/                  # authed route group
│       ├── layout.tsx          # 'use client' shell: AppStateProvider + Sidebar + TabBar + paywall gate (spec 018);
│       │                       #   SplashScreen.hide() after first paint; biometric lock overlay (spec 023)
│       ├── dashboard/page.tsx  # branches mobile stack vs DashboardDesktop at ≥1024px
│       ├── transactions/page.tsx
│       ├── housing/page.tsx
│       ├── budgets/page.tsx
│       └── settings/page.tsx, settings/household/page.tsx
├── capacitor.config.ts         # spec 021: appId (reused native-app bundle id), webDir 'out', ios/plugins config
├── ios/App/                    # spec 021: the Capacitor-generated native iOS project (SPM, not CocoaPods)
│   └── App/Plugins/Scan/       # custom Swift plugin — camera capture + Vision OCR + PDFKit + FoundationModels
│                               #   refiner, ported from the frozen app's Services/Scan/* (see ./ios.md)
├── components/
│   ├── ui.tsx                  # primitives: Card, SectionLabel, Avatar, StackedAvatars, PageHeader, Modal…
│   ├── inputs.tsx              # form inputs
│   ├── layout.tsx              # ReadingColumn (560px centered column)
│   ├── Sidebar.tsx             # desktop nav (icon rail @sm, full @lg) + household footer + sign-out
│   ├── TabBar.tsx              # mobile bottom tab bar (sm:hidden, backdrop-blur, safe-area-inset-bottom padding)
│   ├── dashboard/              # widget cards (MonthSummary, Insights, BudgetProgress, SpendByCategory,
│   │                           #   PerOwnerBreakdown, TopMerchants, HousingSnapshot, DailySpendTrend,
│   │                           #   MonthPicker, RangePicker) + range.ts (pure range math, regression-vector-locked)
│   ├── transactions/           # TransactionRow, TransactionDetailModal/Body, BalanceSummary
│   ├── housing/                # PropertyCard/Content, Mortgage/Rental/Multifamily cards, Add modals + lease.ts/rate.ts/kinds.ts (pure helpers)
│   ├── budgets/BudgetDrawer.tsx
│   ├── Paywall.tsx             # spec 018: blocking gate content (plans, check again, quiet sign-out)
│   ├── settings/               # rows, ChoiceRows, HouseholdDrawer, AddCardModal, appearance.ts (THEME_VARS +
│   │                           #   native status-bar sync), SubscriptionSection.tsx (spec 018)
│   ├── scan/                   # spec 021: React port of the scan review flow (interstitial + summary),
│   │                           #   driven by lib/scan/scanSession.ts
│   └── web/                    # ≥1024px desktop chrome: DashboardDesktop, TransactionsDesktop,
│                               #   HousingDesktop, Drawer (shared slide-out), WebModal, TxForm,
│                               #   TxModalWeb, FilterPanel, ActiveFilterChips, kit.tsx (WebPageHeader, Seg…)
├── lib/
│   ├── store.tsx               # AppStateProvider — the entire client data layer (React context); client-side auth
│   │                           #   gate (spec 021, replaces the deleted proxy.ts) + Capacitor appStateChange listener
│   ├── entitlements.ts         # spec 018: hand-mirrored gate derivation (literal-vector-locked)
│   ├── billing.ts              # spec 018: functions.invoke wrappers for the billing edge functions
│   ├── supabase/client.ts      # createBrowserClient — native-only Keychain storage adapter (spec 021)
│   ├── auth/keychainStorage.ts # spec 021: Keychain-backed supabase-js auth.storage adapter (native only)
│   ├── haptics.ts              # spec 021: native-aware haptic feedback (confirm/destructive), no-op on web
│   ├── share.ts                # spec 021: native share-sheet wrapper (falls back to Web Share API on web)
│   ├── scan/                   # spec 021: ported scan business logic (was iOS-only Swift) — scanModels.ts,
│   │                           #   scanHeuristics.ts, scanParser.ts, scanInference.ts, scanSession.ts
│   ├── api/aggregates.ts       # wrappers over Postgres aggregate RPCs (ADDITIVE — not yet wired)
│   ├── flags.ts, test-build.ts # spec 015 test-build feature flags (localStorage-gated, dead-code-eliminated in prod)
│   ├── testdata/               # spec 015 in-memory seeded Supabase client (test-data mode: seed.ts, memory-client.ts)
│   ├── finance/                # pure engines: money.ts, currency.ts, mortgage.ts, insights.ts, housing.ts
│   ├── splits.ts               # split math + orderedOwnerIds (canonical leftover-cent order)
│   ├── balances.ts             # member settle-up balance
│   ├── transactionFilters.ts   # filter engine + monthBounds
│   ├── format.ts               # date grouping, effectiveShares
│   ├── categories.ts           # category metadata + paletteFor
│   ├── types.ts                # domain types mirroring the Supabase schema; exports PICKABLE_CATEGORIES
│   ├── language.ts             # language → BCP-47 locale (bn pinned to Latin digits)
│   ├── i18n/                   # full-UI translation catalogs (bn/es/ja/zh/ko); store exposes t()
│   ├── useMediaQuery.ts        # useIsExpanded() = (min-width: 1024px)
│   ├── useDashboardRange.ts    # persisted range + transient month scope hook
│   ├── useTransactionFilters.ts
│   └── useFocusTrap.ts         # focus trap + restore for Drawer / WebModal (a11y)
├── scripts/
│   ├── gen-vectors.ts          # regenerates shared/test-vectors/*.json from the TS engines
│   ├── import/                 # bank-statement import + tx CRUD CLI (engine/, profiles/, db/, cli.ts, tx.ts)
│   ├── ops/                    # [OPERATOR-PENDING] live-deploy tools: billing-probe.ts, billing-smoke.ts (spec 018)
│   └── maintenance/repair-legacy-dates.ts  # one-shot date repair (make repair-dates, dry-run by default)
├── test/                       # Vitest files (unit, jsdom component, *.parity.test.ts,
│   │                           #   i18n/ catalog + render-locale locks, import/ golden suites + fixtures/,
│   │                           #   helpers/supabase-mock.ts)
│   └── setup.ts                # jest-dom matchers + conditional RTL cleanup
├── next.config.ts              # output: 'export' (static export, spec 021) + images.unoptimized
├── tailwind.config.ts          # maps semantic color names → CSS variables
├── vitest.config.ts            # node default env, fileParallelism:false, v8 coverage thresholds
├── postcss.config.mjs          # @tailwindcss/postcss
└── .env.local                  # NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
```

## 4. Architecture

### Routing & auth
- `app/page.tsx` is a `'use client'` component that redirects `/` → `/dashboard` on mount. All product pages live in the `(app)` route group; each page is a `'use client'` component.
- **Auth gate (spec 021 — client-side, no server).** `web/proxy.ts` (Next 16's `middleware.ts` replacement) is **deleted**: it's unsupported under `output: 'export'` (Next's own docs mark Proxy `Static export = No`) and would never execute anyway. The same three checks now live client-side, reusing the ordinary browser Supabase client:
  1. Signed-out → `/sign-in`: `lib/store.tsx`'s bootstrap (`runBootstrap()`) redirects on `!authUser`, short-circuited by the test-build `bypassAuth` flag.
  2. Signed-in → `/dashboard` away from `/sign-in`: a mount-time check in `app/sign-in/page.tsx`.
  3. Root `/`: the client-side redirect above.

  There is deliberately **no single-active-platform lock** — the Capacitor iOS shell and desktop/mobile web may be signed in simultaneously (feature 010); the 30-day cap is Supabase's session timebox. On the Capacitor build specifically, an `@capacitor/app` `appStateChange` listener (`lib/store.tsx`) also re-validates the session on foreground, closing a documented liveness gap (`docs/parity-audit-2026-07-02.md`) that the old per-navigation `proxy.ts` check used to paper over.
- Sign-in (`app/sign-in/page.tsx`) is passwordless email OTP: `signInWithOtp` → `verifyOtp(type: 'email')` → `router.replace('/dashboard')`.

### Capacitor iOS shell (spec 021)
- **Scaffold**: `web/capacitor.config.ts` (`appId` reuses the frozen app's bundle id `AyazUddin.Ortho-iOS` so TestFlight/App Store continuity is preserved; `webDir: 'out'`; Swift Package Manager, not CocoaPods) + `web/ios/App/` (Capacitor-generated Xcode project, structurally independent of the frozen `iOS/Ortho-iOS.xcodeproj`).
- **Build loop**: `next build` (static export → `web/out/`) → `npx cap sync ios` (copies `out/` into `ios/App/App/public/`, resolves SPM deps) → `npx cap open ios` / `xcodebuild`. CI: `.github/workflows/capacitor-ios-ci.yml`.
- **Session storage**: `lib/auth/keychainStorage.ts` — a Keychain-backed `supabase-js` `auth.storage` adapter, wired in only on `Capacitor.isNativePlatform()` (`lib/supabase/client.ts`); desktop/mobile web keeps the default `@supabase/ssr` cookie path unchanged.
- **Native-feel plugins**: `@capacitor/status-bar` (text style driven live from `components/settings/appearance.ts`'s theme toggle), `@capacitor/keyboard` (`resize: 'body'`), `@capacitor/splash-screen` (`launchAutoHide: false`, hidden manually after first paint in `app/(app)/layout.tsx`), `@capacitor/haptics` (`lib/haptics.ts`, wired into transaction/property add-delete in `lib/store.tsx`), `@capacitor/share` (`lib/share.ts`), `@aparajita/capacitor-biometric-auth` (Face ID/Touch ID), `@capawesome/capacitor-file-picker` (Files-app PDF import for scanning).
- **Scan plugin**: `web/ios/App/App/Plugins/Scan/` — a custom Swift Capacitor plugin (camera capture + Vision OCR + PDFKit + an optional FoundationModels refiner), the one piece of the scan pipeline with no browser equivalent. Its pure parsing/heuristics/categorization counterpart lives in `web/lib/scan/*` (ported from the frozen app's Swift, now regression-vector-tested like the rest of `web/lib/*`). See `./ios.md` for the original Swift source this plugin ports, and `specs/021-capacitor-ios-consolidation/contracts/scan-plugin-api.md` for the JS↔Swift contract.
- **Native-feel CSS**: `app/globals.css` defines `--safe-top/-bottom/-left/-right` from `env(safe-area-inset-*)` (harmless 0 on desktop/mobile web), applied to the tab bar and app-shell content padding; disables iOS's long-press text-selection callout on the shell (re-enabled on inputs/`.ortho-selectable`); `touch-action: manipulation` on every tappable primitive.

### Test-build feature flags (spec 015)
A **Developer** section on the Settings page (`components/settings/flags-section.tsx`) exposes **Use test data** and **Bypass auth**, letting a tester run the app on a disposable in-memory dataset without touching the live shared backend.
- **Gating:** `lib/test-build.ts` `isTestBuild()` (`NEXT_PUBLIC_VERCEL_ENV`/`NODE_ENV !== 'production'`) gates both the section and every flag-honoring branch, so they **dead-code-eliminate from the production bundle**. Flags persist via `lib/flags.ts` (`localStorage['ortho.flags']`, mirroring `appearance.ts`) and read all-off off a test build (FR-003). **Spec 021:** the `ortho_bypass_auth` cookie mirror is gone — now that the auth gate is client-side (`lib/store.tsx`), it reads `readFlags().bypassAuth` from `localStorage` directly.
- **Isolation (the single seam):** when `isTestBuild() && effectiveUseTestData(readFlags())`, `lib/supabase/client.ts` returns an **in-memory seeded client** (`lib/testdata/memory-client.ts`, a productionized copy of `test/helpers/supabase-mock.ts`, seeded from `lib/testdata/seed.ts`) instead of `createBrowserClient`. Because the store funnels every read/write/auth call through that one handle, no live call is constructed — the store needs no changes; toggling a flag reloads to re-bootstrap from a clean seed.
- **Auth bypass:** `lib/store.tsx`'s bootstrap skips the `/sign-in` redirect when `isTestBuild()` + the flag; the store boots from the seed client (its `getUser` returns a seed user; `onAuthStateChange` never fires `SIGNED_OUT`). The seed is Person-centric (owner_ids + shares + paid_by, budgets, rental, transfers). Tests: `test/{flags,settings,store}/*`. Outside the golden-vector harness (PARITY.md).

### Subscription gate & billing (spec 018)
- **`lib/entitlements.ts`** is the hand-mirrored client copy of the canonical `services/billing/src/derive.ts` : `deriveGateState(row, nowIso)` → `admin | trialing | active | grace | lapsed`, plus `daysRemaining`. Both copies are locked by the **identical literal vectors V01–V19 + sha256 digest** in `specs/018-subscription-system/contracts/entitlement-state.md` (asserted here by `test/entitlements.test.ts`) — amend the contract before touching semantics. Deliberately *not* a golden vector (no money/date engine).
- **Bootstrap** issues the `ensure_entitlement()` RPC in parallel with `loadAll()` — it creates the 31-day trial row exactly once and doubles as the entitlement fetch. A failed entitlement read is a **load failure** (existing recovery path), never the paywall (FR-008). The store exposes `entitlement`, the memoized derived `gateState`, and `refreshEntitlement()` ("Check again" + the `?checkout=success` return path re-read).
- **Shell gate** (`app/(app)/layout.tsx`): `gateState === 'lapsed'` renders `<Paywall/>` *instead of* children — every route, tab, and deep link lands there; a `null` gate (row not loaded) **never blocks** (FR-009, no paywall flash). `grace` keeps full access with a calm Settings notice. `Paywall.tsx` prices plans exclusively from `billing-plans` (calm "plans unavailable" state on failure), offers check-again and a quiet sign-out, and announces async status via `role="status"`/`aria-live`.
- **Settings › Subscription** (`components/settings/SubscriptionSection.tsx`, mounted after Cards): per-state copy (trial days left, renews, ends-on, billing-issue notice, admin "no subscription needed"), Manage → Stripe Customer Portal, inline subscribe.
- **`lib/billing.ts`** wraps `functions.invoke` for `billing-plans`/`billing-checkout`/`billing-portal` and maps failures to the contract's `{ error: { code } }` envelope — callers localize by `code`; checkout is never auto-retried (duplicate sessions). Plan prices render as USD `$X.XX` and deliberately skip the display-currency converter (the paywall shows exactly what Stripe will charge).
- **Test infrastructure**: `test/helpers/supabase-mock.ts` gained a `functions.invoke` fake and RLS-faithful guards (client writes to `entitlements` rejected; `billing_events` invisible even to reads); `lib/testdata/memory-client.ts` resolves `ensure_entitlement` to a null row — null gate, no paywall — so test-data mode never gates and never talks to the live backend.
- **i18n**: +29 keys in all five catalogs (27 initial + 2 from the T042 review pass). **Ops**: `scripts/ops/billing-probe.ts` (read-only deploy probe) and `scripts/ops/billing-smoke.ts` (guided test-mode checkout→webhook→flip) are `[OPERATOR-PENDING]` tools — runbook in `specs/018-subscription-system/quickstart.md`.

### Data layer — one React context, optimistic writes
`lib/store.tsx` (`AppStateProvider` / `useApp()`) is the whole client data layer, mirroring iOS `AppState`:
- **Bootstrap** (once, in the `(app)` layout): `auth.getUser()` → upsert the `users` profile row → find-or-create `households` + `household_members` → ensure the account holder has a `household_people` row (and fold legacy device-only `localUsers` from localStorage) → `loadAll()`.
- **`loadAll()`** issues 11 parallel Supabase selects: `users`, `household_people`, `transactions`, `transaction_shares`, `cards`, `properties`, `mortgage_info`, `lease_info`, `units`, `rental_payments`, `budgets`; it then stitches properties with their mortgage/lease/units and **rehydrates** each transaction's `owner_ids` + per-person `shares` map from `transaction_shares` rows (a `transfer` with no shares gets `owner_ids: []`, never a synthesized owner). The three highest-volume reads (`users`/`transactions`/`transaction_shares`) are **column-projected** — explicit `select(<cols>)`, never `select('*')` (spec 023/US6). Every read is a **typed row → domain boundary**: the client is untyped (no `supabase gen types` in-sandbox), so each select is asserted to a hand-written schema-mirror `*Row` type in `lib/supabase/rows.ts` and assigned to domain-typed state — a renamed/removed column or changed enum then fails `tsc` at the load boundary instead of at runtime (spec 023/FR-018). Keep `rows.ts`, the projection column lists, and `lib/types.ts` in lockstep.
- **Two internal contexts behind `useApp()`** (spec 023/US6/P4): a memoized, stable **services** context (`rate`, `formatMoney`, `t`, `resolveUser`, `ownersDisplay`) and a changing **data** context. `useApp()` re-merges both (unchanged public surface — no consumer import changes); the ledger rows subscribe to only the services surface via `useAppServices()` and are `React.memo`'d, so an unrelated mutation (adding a different transaction, a loading toggle) no longer re-renders every row. `formatMoney` still changes identity on currency/rate/locale, so amounts update on an FX refresh.
- **Mutations are optimistic with rollback**: state updates immediately, the Supabase write runs async, and failure restores the previous state and sets a banner `error`. Transaction writes are **atomic with shares**: if `transaction_shares` fails after the parent insert/update, the parent is deleted/restored so a share-less row never survives (matches iOS's all-or-nothing write; see `writeShares`, `addTransaction`, `updateTransaction`).
- **FX**: `refreshRates()` fetches `https://www.floatrates.com/daily/usd.json` and caches in localStorage (`fxRates` / `fxRatesFetchedAt`, refreshed after 24h). On fetch failure it KEEPS the last cached live rates at any age (mirrors iOS; since 2026-07-02) and surfaces a freshness caption in Settings; the hardcoded `FALLBACK_RATE_FROM_USD` (`lib/finance/currency.ts`) applies only when no cache has ever existed. `formatMoney` converts USD cents → display currency with the active locale.
- **Preferences in localStorage**: `currency`, `language`, `appearance`, `dashboardRange` (+ FX cache). All are adopted *after mount* so SSR and first client paint agree — no hydration mismatch.
- `lib/api/aggregates.ts` wraps the shared Postgres aggregate RPCs (`household_owner_spend` etc., defined in `supabase/migrations/20260611120000_aggregates.sql`). It is **additive and deliberately not wired** — dashboard widgets still compute locally; the file documents the per-widget cut-over plan. Spec 023 re-assessed and **kept it documented-unwired** (wiring it standalone is a net perf loss: it swaps in-memory loops for network round-trips and breaks offline; it only pays off paired with `loadAll` windowing, a future feature).

### Pure finance core (regression-vector-locked)
`lib/finance/{money,currency,mortgage,insights}.ts`, `lib/splits.ts`, `lib/balances.ts`, `lib/transactionFilters.ts`, `lib/scan/*` (spec 021), and `components/dashboard/range.ts` are pure TypeScript pinned by fixtures in `shared/test-vectors/`. `npm run gen:vectors` (`scripts/gen-vectors.ts`) regenerates `shared/test-vectors/*.json` from these TS implementations; the web `*.parity.test.ts` suites assert against the same files — now an ordinary single-implementation regression/snapshot check (spec 021 retired the cross-language lock against the frozen native app; see root `PARITY.md`). Key invariants: integer USD cents everywhere, `orderedOwnerIds` canonicalizes the deterministic leftover cent, half-open `[start, end)` month windows. Since spec 013, `generateInsights` takes a trailing `locale` parameter (threaded from the store's `localeForLanguage` value; vectors stay language-neutral at the default `en-US`), and the recurring insight's 3-merchant preview is vector-locked via `Insight.preview_merchants` — amount descending, case-insensitive name tie-break, casing from the newest transaction. `lib/types.ts` also exports `PICKABLE_CATEGORIES` (transfer is deliberately unpickable) with `TransactionCategory` derived from it.

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

### Bundle code-splitting (spec 022)
The three heaviest, least-frequently-needed code regions are deferred via `next/dynamic` (`{ ssr: false }` — they're browser-only and static export has no runtime SSR) so they leave the **initial-load** bundle (the set of chunks a route's built HTML references in `<script>` tags):
- **Charts** — `recharts` is statically imported ONLY by the leaves under `components/{dashboard,housing}/charts/*` (`CategoryPie`, `DailyTrendChart`, `AmortizationChart`), which their cards dynamic-import; the card's money figures/legend stay eager and the fixed-height wrapper reserves the chart's space (no layout shift). This drops **~95 KB gzip** from `/dashboard` and `/housing` initial-load — the dominant win. A guard test (`test/bundle/no-eager-recharts.test.ts`) fails if any eager module imports `recharts`.
- **Scan pipeline** — `lib/scan/useScanFlow.ts` dynamic-imports `scanParser`/`scanInference`/`scanPlugin`/`FilePicker` *inside* its capture callbacks (not at module top — the reducer stays eager), and `app/(app)/transactions/page.tsx` dynamic-imports the `ScanFlow` UI; both load only when a scan is initiated. Guard: `test/scan/scan-deferred.test.ts`.
- **Desktop compositions** — the three master–detail routes dynamic-import their `components/web/*Desktop`, so a mobile/iOS session never downloads the desktop layer. The synchronous `useIsExpanded()` gate is preserved and the loading fallback is `null` (never the mobile layout), so there is no wrong-layout flash — only a brief blank on desktop while the small composition chunk loads. Guard: `test/web/form-factor-split.test.ts`.
- **i18n catalogs** (spec 023) — `lib/i18n/index.ts` dynamic-`import()`s only the active language's catalog (`useTranslate` returns the English identity until it resolves), so the five non-English catalogs (~30 KB gzip) leave initial-load and a default-English user downloads none. Guard: `test/i18n/no-eager-catalog.test.ts`. Every catalog key must be reachable from the UI — `test/i18n/catalog-reachability.test.ts` (spec 023/FR-021) uses TypeScript's scanner to assert each key's text appears as a source string literal (a `t()`/`tr()` arg, a `label:` data table, an insight string), failing if a dead key is (re)introduced. `Intl.NumberFormat`/`Intl.DateTimeFormat` are cached module-level in `lib/finance/money.ts` / `lib/format.ts` (byte-identical output).

Measure with `npm run measure:bundle` (`scripts/measure-bundle.ts`): it derives each route's initial-load from the built HTML `<script>` tags — Turbopack chunk names are opaque content hashes, so filenames can't be classified — and supports `--json` / `--baseline` for before/after diffs. Full rationale and the recorded baseline/after in `specs/022-web-bundle-optimization/`.

## 5. Key files (read these first)

1. `web/lib/store.tsx` — the entire client data layer: bootstrap (incl. the spec-021 client-side auth gate + Capacitor foreground liveness listener), loadAll, optimistic CRUD with rollback, atomic tx+shares writes, FX, owner resolution.
2. `web/capacitor.config.ts` + `web/ios/App/` — the Capacitor iOS shell (spec 021): scaffold, plugin config, and the native Scan plugin.
3. `web/app/layout.tsx` — root layout: Lato font, pre-paint appearance boot script, `viewport-fit=cover`.
4. `web/app/globals.css` — every design token (light/dark) + the `ow-*` desktop chrome.
5. `web/app/(app)/layout.tsx` — the app shell (provider + Sidebar + TabBar + loading/error states).
6. `web/lib/types.ts` — domain types (Transaction/Person/Property…) mirroring the Supabase schema; doc-comments explain `paid_by`, `transfer`, `owner_ids`, `shares`; `PICKABLE_CATEGORIES` → `TransactionCategory`.
7. `web/lib/useMediaQuery.ts` — `useIsExpanded()` (≥1024px), the responsive branch point.
8. `web/app/(app)/dashboard/page.tsx` — the canonical mobile-vs-desktop branching pattern.
9. `web/components/web/TransactionsDesktop.tsx` — the biggest desktop composition (ledger table + drawer).
10. `web/components/web/Drawer.tsx` — the shared right-side slide-out master–detail panel.
11. `web/components/web/TxForm.tsx` — add/edit transaction form incl. splits and transfers (839 lines, the most complex form).
12. `web/lib/splits.ts` — split math + `orderedOwnerIds` (parity-critical).
13. `web/lib/finance/insights.ts`, `web/lib/finance/mortgage.ts`, and `web/lib/finance/housing.ts` — the vectored engines. `housing.ts` (`occupiedRentCents`/`netRentalCents`) is the single source for the net rental figure shown by both `HousingSnapshotCard`/`DashboardDesktop` and the property-detail `MultifamilyCards` (occupied-only; vacant units contribute zero), vector-locked by `housing-net-rental.json` ↔ iOS `HousingMath` (spec 019). All housing date-only values (lease/payment/closing) parse **local** via `parseLocalDate` in `web/lib/format.ts` — never raw `new Date('YYYY-MM-DD')`, which shifts a day west of UTC.
14. `web/lib/useDashboardRange.ts` + `web/components/dashboard/range.ts` — dashboard scope (persisted range + transient month).
15. `web/components/ui.tsx` and `web/components/web/kit.tsx` — shared primitives (mobile) and desktop chrome components.
16. `web/scripts/gen-vectors.ts` — how golden vectors are produced.
17. `web/vitest.config.ts` — test envs, coverage scope + thresholds.
18. `web/scripts/import/README.md` — the CLI's full contract (flags, exit codes, adding a bank).
19. `web/components/settings/appearance.ts` — `THEME_VARS`, single source for boot + live theme toggle.
20. `web/lib/api/aggregates.ts` — the not-yet-wired RPC layer and its cut-over plan.

## 6. Build / run / test

Desktop/mobile web commands run from `web/` (works on Linux dev sandboxes — nothing here is
macOS-only; only the Capacitor iOS build needs Xcode):

```bash
cd web
npm install
npm run dev              # http://localhost:3000
npm run build            # next build (static export, output: 'export' → web/out/, spec 021)
npm test                 # vitest run
npm run test:coverage    # v8 coverage, thresholds enforced (see vitest.config.ts)
npm run gen:vectors      # regenerate shared/test-vectors/ from the TS engines
npm run measure:bundle   # report per-route initial-load JS sizes (needs a prior `npm run build`)
npx tsc --noEmit         # typecheck (part of the web CI gate)
```

CI: `.github/workflows/web-ci.yml` runs `tsc`, `npm test`, and a vector-drift check on every
`web/**`, `services/**`, `supabase/functions/**`, or `shared/test-vectors/**` change (Linux); since
spec 018 it also typechecks and tests `services/billing` (whose suite includes the `_shared/`
drift lock). Keep `npx tsc --noEmit` clean — under Next's defaults a type error fails
`next build`, and the web app has no other build gate.

`npm run measure:bundle` (spec 022) reads `web/out/` and prints each route's initial-load size; add
`-- --json <path>` to save a baseline and `-- --baseline <path>` to print a before/after diff after a
code-split change. See the *Bundle code-splitting* subsection in §4.

`npm start` (`next start`) is gone — static export ships no Node server; serve `web/out/` with any
static file server if you need to preview the exported bundle directly.

**Capacitor iOS (spec 021) — macOS/Xcode only, same as the frozen app:**

```bash
cd web
npm run build            # static export → out/
npx cap sync ios         # copy out/ into ios/App/App/public/, resolve SPM deps
npx cap open ios         # opens ios/App/App.xcworkspace-equivalent (SPM: App.xcodeproj) in Xcode
# or, for CI-style build verification without opening Xcode:
xcodebuild build -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator'
```

For live-reload development against a device/simulator, `npx cap run ios --live-reload` (dev-only —
never ship a build with `capacitor.config.ts`'s `server.url` pointing at a live dev server; static,
bundled assets are required for release, and pointing at a remote origin is also the single
highest-risk App Store Guideline 4.2 rejection trigger for hybrid apps).

CI: `.github/workflows/web-ci.yml` runs `tsc`, `npm test`, and a vector-drift check on every
`web/**` or `shared/test-vectors/**` change (Linux); `.github/workflows/capacitor-ios-ci.yml`
build-verifies the Capacitor iOS project on a macOS runner (spec 021). Keep `npx tsc --noEmit`
clean — under Next's defaults a type error fails `next build`, and the web app has no other build
gate.

**Vercel deployment (production = `main`).** The GitHub repo `Ayaz2589/Ortho` is connected to the
Vercel project `ortho` via Vercel's **Git integration**, so releases are automatic: a push/merge to
**`main`** ships to **production**; any other branch or PR gets a throwaway **preview** URL (posted
on the PR). No manual step and no `vercel` CLI are needed for normal releases. Two project settings
are load-bearing because the Next app lives in the `web/` subdirectory:
- **Root Directory = `web`** — without it the build runs from the repo root and fails immediately (no
  `package.json` there). This is the #1 first-deploy failure.
- **Environment Variables** — `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` set for
  **Production** (and Preview). Vercel builds *remotely*, so the local `.env.local` is not involved;
  `NEXT_PUBLIC_VERCEL_ENV`/`NODE_ENV` are injected by Vercel — never set them manually.

Vercel serves the static export (`output: 'export'` → `out/`) as a static site (preset auto-detected).
The `web/.vercel/` folder is a local CLI link (gitignored) and is independent of the Git integration.
To gate production on green CI, add branch protection on `main` requiring the **Web CI** check.
(Historical note: a `team_…`-scoped `ortho` project from earlier CLI deploys may still exist alongside
the personal git-connected one — the connected one is authoritative; delete the stray to avoid
confusion.)

**Environment** (`web/.env.local`, not committed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required by the app + CLI — inlined into the client bundle at build time, including the Capacitor build); `SUPABASE_SERVICE_ROLE_KEY` (only for the CLI's `ADMIN=1` mode); `IMPORT_EMAIL` (optional, CLI OTP sign-in). The live Supabase project is `brujhxmtzfgowimprueo.supabase.co`. Supabase's CORS allow-list must include `https://localhost` for the Capacitor build (`capacitor.config.ts`'s `server.iosScheme: 'https'` avoids the default `capacitor://localhost` origin, which Supabase's CORS validator would reject).

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
- **Naming**: mobile-shared feature components in `components/<feature>/`; desktop-only in `components/web/`; pure logic in `lib/` (hooks prefixed `use*`); regression-vectored logic carries doc-comments naming its vector file (no longer a "Swift mirror" reference — spec 021).
- **Tests**: pure logic in node env; component suites opt into jsdom with a `// @vitest-environment jsdom` first line; regression suites are named `*.parity.test.ts` (name kept for continuity, no longer a cross-language check); Supabase is mocked via `test/helpers/supabase-mock.ts`. New money/date behavior is developed test-first (constitution Principle VI).
- **i18n locks** (`web/test/i18n/`, spec 013): `render-locale.test.tsx` renders key screens under jsdom in Español and 日本語 and asserts no English fallback leaks. **Spec 021:** `catalog-parity.test.ts` (which cross-checked against the frozen app's `Localizable.xcstrings`) is **deleted** — with that Swift resource file no longer hand-updated, the lock would have started failing on any new web-only key.

## 8. Gotchas

- **Native binaries vs. Linux sandboxes (the big one).** `web/node_modules` is typically installed on macOS-arm64, so Linux-arm64 sandboxes fail with `Cannot find module '@rolldown/binding-linux-arm64-gnu'` (vitest) or missing `lightningcss`/oxide/swc bindings (next build). Fix without touching the lockfile: `npm install @rolldown/binding-linux-arm64-gnu lightningcss-linux-arm64-gnu @tailwindcss/oxide-linux-arm64-gnu @next/swc-linux-arm64-gnu --no-save`. (Verified: after installing the rolldown binding, the full suite passes.)
- **This is Next 16.** `proxy.ts` (the `middleware.ts` replacement) is **deleted** as of spec 021 — unsupported under `output: 'export'`. Other Next 16 conventions may still differ from memory; per `web/AGENTS.md`, read `web/node_modules/next/dist/docs/` before writing Next-specific code.
- **Static export constraints (spec 021).** `output: 'export'` disallows Route Handlers-with-Request, `cookies()`/`headers()`, Server Actions, Proxy, and the default `next/image` loader. This app has none of the first four; `images.unoptimized: true` covers the last. If you're tempted to add a Route Handler or read `cookies()` in a Server Component, it won't work under this build mode — do it client-side instead.
- **Node >= 20.19 required** (vitest 4 uses `require(ESM)`); `package.json` engines enforce it.
- **Vitest runs files sequentially** (`fileParallelism: false`) because parallel jsdom worker startup races in sandboxes; don't "optimize" this away.
- **Coverage is scoped**, not global: only the pure `lib/` business logic and `scripts/import/**` are measured, with thresholds (90/90/80/90 overall; slightly lower for `scripts/import/**`). View components are behaviorally tested, not line-covered.
- **`lib/api/aggregates.ts` is not wired** — widgets still aggregate client-side; the RPCs exist in `supabase/migrations/20260611120000_aggregates.sql`.
- **If you change any regression-vectored engine**, regenerate vectors (`npm run gen:vectors`) and commit the diff — the web CI drift check fails otherwise. There is no longer a second (Swift) consumer to keep in sync.
- **Dates fed to the finance engines must be built on the LOCAL calendar.** `insights.ts` (and the budget/insight cards) derive the month from *local* getters (`now.getFullYear()/getMonth()/getDate()`), so any reference date must be constructed in local time — `new Date(y, m - 1, d, 12)`, never a `…T12:00:00.000Z` UTC instant. A noon-UTC last-day instant reads as the 1st of the *next* month at UTC+12 and further east (NZ/Fiji), silently re-scoping the whole month (spec 023 fixed this in `monthInsightReference`; the same rule governs housing dates via `parseLocalDate`). The vitest worker pins `TZ=UTC`, so these never surface in CI — test an eastern zone explicitly (see `test/dashboard/insights-month-select.test.ts`).
- **localStorage keys** the app depends on: `currency`, `language`, `appearance`, `dashboardRange`, `fxRates`/`fxRatesFetchedAt`, `ortho.flags`, legacy `localUsers` (folded into `household_people` on first boot, then removed).
- **FX needs network** (`floatrates.com`); offline it reuses the last cached live rates (with a staleness caption in Settings), and only a never-fetched install sees `FALLBACK_RATE_FROM_USD`.
- **No single-active-platform lock**: removed in feature 010. The Capacitor iOS shell and desktop/mobile web may be signed in simultaneously; each independently ages out at the 30-day Supabase session timebox.
- **Appearance is applied by an inline boot script** in `app/layout.tsx` that embeds `THEME_VARS` — if you change theme tokens, update `app/globals.css` **and** `components/settings/appearance.ts` (they must mirror each other; the latter also drives native status-bar style on the Capacitor build).
- **The biometric lock overlay is the top of the z-index stack (`z-[200]`).** Since spec 023 B4 the lock keeps the app subtree *mounted* and covers it with an opaque overlay (instead of unmounting it), so the overlay must out-rank every portaled dialog — drawers `.ow-drawer` (80), scrims `.ow-drawer-scrim`/`.ow-scrim` (70/100), the mobile `Modal` (50) — all of which portal to `<body>` and paint against the root stacking context. A lower overlay lets an open dialog leak household data over the lock screen (FR-011). Keep any new portal below 200; `test/store/biometric-lock-zorder.test.ts` enforces the ceiling.
- **`web/ios/App/` vs. `iOS/Ortho-iOS/` — do not confuse them.** The former is the live Capacitor shell of this codebase; the latter (repo root `iOS/`) is the frozen, unmaintained native app kept only for reference/rollback. They are structurally and namespace-independent.
- The generated `web/coverage/`, `web/out/`, and `tsconfig.tsbuildinfo` are build artifacts; `web/README.md` is the untouched create-next-app boilerplate (the real docs are the root `README.md`, `PARITY.md`, and `web/scripts/import/README.md`).

## 9. Cross-links

- [./supabase.md](./supabase.md) — the shared schema this client reads/writes (`transactions` + `transaction_shares`, `household_people`, properties/mortgage/lease/units, budgets, aggregate RPCs), plus the spec-018 `entitlements` table and billing edge functions that `lib/billing.ts` invokes.
- [./ios.md](./ios.md) — the **frozen** native app; read it only for rollback/archaeology or when porting the original Swift source of the on-device scan pipeline (`Services/Scan/*.swift`) that `web/ios/App/App/Plugins/Scan/` now ports.
- [./shared.md](./shared.md) — the regression-vector fixtures; generated *from* this package by `web/scripts/gen-vectors.ts`.
- [./makefile.md](./makefile.md) — `make ingest` / `tx-*` targets that drive `web/scripts/import/` via `npx tsx`.
- Repo-root `PARITY.md` — the audited web/CLI parity matrix (+ the frozen app's historical role); `.specify/memory/constitution.md` (v2.0.0: web is the single canonical implementation) and the `ortho-web` skill — design-system law for this app.
- `specs/021-capacitor-ios-consolidation/` — the spec/plan/research/contracts for the Capacitor migration.
