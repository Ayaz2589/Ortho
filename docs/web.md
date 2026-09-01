# Ortho Web (`web/`)

Read this when working anywhere in `web/` — it is THE canonical implementation (Next.js), shipping
both delivery targets: responsive web (Vercel) and the iOS app (Capacitor shell at `web/ios/App/`).
Finance-engine math lives in [./finance.md](./finance.md); schema/RLS in
[./supabase.md](./supabase.md); vectors in [./shared.md](./shared.md); import CLI in
[./makefile.md](./makefile.md); native plugin internals + TestFlight deploy in [./ios.md](./ios.md).

## 1. Posture

- Next.js **16.2.9**, React **19.2.4**, TypeScript, Tailwind v4. Fully client-side:
  `next.config.ts` sets `output: 'export'` + `images.unoptimized: true` (spec 021). No Next server
  at runtime, no middleware/`proxy.ts`, no API routes, no server components beyond the root layout.
  Data access is direct Supabase from the browser; RLS enforces access.
- **Next 16 has breaking changes vs training data** — per `web/AGENTS.md`, read
  `web/node_modules/next/dist/docs/` before writing Next-specific code.
- Node pinned by `.nvmrc` (22); engines `>=20.19.0 || >=22.12.0` (Vitest 4 needs `require(ESM)`).
- Scripts: `dev`, `build`, `test`, `test:coverage`, `test:tz`, `gen:vectors`, `gen:corpus`,
  `seed:corpus`, `measure:bundle`. `npm start` does not exist — serve `web/out/` statically.
- Key deps: `@supabase/supabase-js` + `@supabase/ssr`, `recharts`, `react-plaid-link`,
  `lucide-react`, Capacitor 8.4.1 + plugins (`app/haptics/keyboard/share/splash-screen/status-bar`,
  `@aparajita/capacitor-{biometric-auth,secure-storage}`, `@capawesome/capacitor-file-picker`),
  `unpdf` (dev, web PDF fallback), `tsx` (CLI + generators).
- The package also hosts the deterministic bank-statement import + tx CRUD CLI
  (`web/scripts/import/`), driven by the root Makefile — internals in [./makefile.md](./makefile.md).

## 2. Route tree (all `'use client'` except the landing and tour routes — see below)

```
web/app/
  layout.tsx            fonts (self-hosted Lato ×4 via next/font/local), viewport-fit=cover,
                        inline pre-paint APPEARANCE_BOOT (theme + html.native) + TEXT_SIZE_BOOT
                        (whole-UI zoom scale, spec 040) scripts — both no-flash;
                        metadataBase from lib/siteUrl.ts (spec 045)
  page.tsx              SMART ROUTER (spec 045): native → /dashboard (FIRST, synchronous);
                        signed-in web → /dashboard; signed-out web → /landing/{detected}
  landing/page.tsx      bare /landing → forwards to the detected locale
  landing/[locale]/     SERVER component — generateStaticParams from the registry,
                        dynamicParams:false, per-locale metadata + hreflang;
                        renders components/landing/LandingView.tsx (spec 046)
  tour/[locale]/        SERVER component (spec 047) — the ≤5-screen learn-more tour;
                        same static-params shape, metadata is noindex (funnel step, not
                        a search destination); screens are CLIENT STATE, so six
                        documents, not thirty
  not-found.tsx         calm 404; redirects ONLY paths under /landing/ (spec 045)
  robots.ts, sitemap.ts static Route Handlers — the app's first SEO surface
  sign-in/page.tsx      8-digit email OTP (signInWithOtp → verifyOtp(type:'email')); bounces
                        signed-in users to /dashboard on mount; builds its own t()
  (app)/layout.tsx      AppStateProvider + Shell + biometric lock overlay + paywall gate
                        (the paywall is inert while SUBSCRIPTION_ENABLED is false)
  (app)/dashboard, transactions{,/new,/edit}, planning, housing{,/new,/edit}, budgets, goals,
        settings{,/household,/cards,/deposit-accounts,/subscription,/currency,
                 /language,/appearance,/text-size,/widgets,/data,/account,/linked-banks}, plaid-oauth
        (settings/planning is a legacy client-redirect → /planning)
```

- **Settings › Data (spec 032)** — download household data (transactions + housing) as a dual-layer
  PDF and re-import it. Logic is the self-contained `web/lib/dataFile/` module: a versioned
  section-registry envelope (`envelope.ts`/`registry.ts`), per-section serialize/read/dedupe/apply/
  render (`sections/{transactions,housing}.ts`), PDF generation via `pdf-lib` + `@pdf-lib/fontkit`
  with a per-language font seam (`pdf/*`), and read-back of the embedded `ortho-export.json`
  attachment via `unpdf` `getAttachments()` (`readPdf.ts`). Export/import orchestration in
  `export.ts`/`import.ts`; UI in `components/settings/Data{Export,Import}Panel.tsx`. Amounts in the
  payload are always canonical USD cents (display currency is visible-layer only); import is additive
  + idempotent with two-tier dedup (canonical id, then the CSV fuzzy matcher). Payload round-trip +
  dedup are headlessly tested (`test/dataFile/*`); glyph rendering is on-device QA.

- **Five destinations** (Dashboard/Transactions/Planning/Housing/Settings) — identical TABS arrays
  duplicated in `components/Sidebar.tsx` and `components/TabBar.tsx`. **Planning (spec 038)** is a
  top-level month-scoped hub (`app/(app)/planning/page.tsx`): a "Left to plan" health hero, a
  pace-aware budget summary, a **Savings & Debts** section (behind-first), and a non-monthly
  sinking-funds panel, all derived by the pure `lib/planning/planSummary.ts` engine (reuses
  `budgetStatusForMonth` + `goalPacing`; no new data). `/budgets` and `/goals` are the detail pages the hub links to (the old
  Settings › Planning route now client-redirects to `/planning`). `/plaid-oauth` is the web
  bank-OAuth return route.
- **Savings & Debts (spec 059)** — what used to be the "Goals" section. The stored model was
  already right: `Goal.kind` has been `'savings' | 'debt_payoff'` since spec 027, and the old UI
  simply rendered both identically. So this was a derivation + presentation change with **no
  migration**. Four things to know before touching it:
  1. **`lib/finance/goalProjection.ts` is a SIBLING of `lib/finance/goals.ts`, not a replacement.**
     `goals.ts` is pinned by `shared/test-vectors/goals.json` and models pace against the *target
     date* a member set; `goalProjection.ts` models pace against the *cadence* they have actually
     been paying (modal amount + modal day, inferred from contributions). Both ship. Do not merge
     them — editing `goals.ts` is vector drift on a contract three other surfaces consume. Money
     arithmetic in the new engine still comes from `goalProgress`, so the two cannot disagree about
     how much is left (property-pinned in `test/finance/goalProjection.test.ts`).
  2. **The refusal to project is a returned value, not a caller's rule.** `goalProjection` returns
     `{ available: false, unavailableReason }` with every date-shaped field `null` when there are
     fewer than three contributions, when the derived pace is zero, or when the target is reached.
     Four surfaces read it (Planning card, detail page, dashboard widget body, detail panel) and
     **none of them may compute a fallback date** — that single enforcement point is what makes
     "no projected date anywhere" checkable rather than conventional.
  3. **Direction of travel carries the kind, not colour.** Savings fills from the left and grows;
     debt is anchored right and depletes toward zero with the paid share behind it at 22% opacity.
     One hue (`--positive`) throughout; nothing is ever red, including a missed month (drawn as an
     absence with a dashed outline) and a later projection (plain `--text-3`, never marked).
  4. **The widget registry `id` is still `'goals'`** even though its title now reads
     "Savings & Debts". The id is the localStorage key for per-browser widget enablement, so
     renaming it would silently reset every existing user's dashboard layout. Pinned by a test in
     `test/widgets/panels/goals-panel.test.tsx`.

  Deleted with this change: `GoalCard.tsx` (its always-visible three-row ledger is now a
  collapsible in-place disclosure), `charts/GoalCumulativeChart.tsx` and `charts/GoalMonthlyChart.tsx`
  (a flat line with no target, and a picket fence of equal bars — neither carried information), and
  `lib/finance/goalSeries.ts`, which had no consumer left once both charts went.

- **Onboarding funnel foundation (spec 045)** — the app's first *pre-auth* surface, and the first
  thing here that is not a signed-in screen. Four things are easy to get wrong:
  1. **`/` is also the installed iOS app's entry point** (Capacitor wraps this same bundle). The
     root router's native branch is therefore first and synchronous — a marketing page must never
     paint inside the App Store build. The guard test asserts `getUser()` is never *called* on
     native, because destination alone would still pass with the race present.
  2. **`landing/[locale]/page.tsx` and `tour/[locale]/page.tsx` are the codebase's only server
     components.** Next permits a `metadata` export from nothing else, and per-locale
     titles/hreflang are the point. One dynamic route each, not six folders, so adding a language
     is a single edit to `LANDING_LOCALES`.
  3. **The funnel has its OWN catalogs** (`lib/i18n/landing/*.ts`). The app catalogs are 32–55 KB
     and `useTranslate` resolves them *after* mount — fine for the app, but it would flash English
     on a locale-fixed marketing page. Never add funnel copy to `lib/i18n/{bn,es,ja,zh,ko}.ts`.
  4. **`not-found.tsx` redirects only under `/landing/`.** A blanket redirect-to-marketing would
     eject a signed-in user who mistyped an in-app URL.
  Pure modules live in `lib/onboarding/`: `locales.ts` (the registry — the single source of truth
  for the six slugs), `adoptLanguage.ts` (writes the existing `language` key on an explicit
  continue), `funnel.ts` (per-device marker, defined here but set by 047 and read by 048).
- **Landing page content (spec 046)** — `components/landing/LandingView.tsx` replaced 045's inert
  `LandingPlaceholder`: a hero (wordmark, `<h1>` proposition, subhead), a **variable-length** list of
  supporting points, one prominent action to `/tour/{slug}` and one quieter link to `/sign-in`. Four
  things here are load-bearing:
  1. **Both actions are plain `<a href>` — deliberately not `next/link`.** A crawlable link from a
     landing page to its tour is the whole SEO point of a per-language funnel, and `Link` would
     prefetch `/tour/*`. Don't "upgrade" this.
  2. **Both call `adoptLandingLanguage(slug)` in `onClick`**, so the language carries into sign-in
     and the app. It is a synchronous `localStorage` write, so no `preventDefault` is needed.
     **Viewing a page must never adopt** — that view/act split is what lets a Spanish speaker open a
     shared Japanese link without losing their preference, and it is pinned in both directions.
  3. **Copy lives in the `spec 046` marker region** of each `lib/i18n/landing/*.ts` as a nested
     `landing: LandingCopy`. (The `spec 047` region beside it now holds the tour copy — the two
     features were built in parallel sandboxes and merged with one conflict, in a shared *test*,
     never in the catalog data. The markers did their job.)
  4. **`points` is an array, not `point1`/`point2`/`point3`.** That is the entire mechanism by which
     a market can carry a different number of supporting ideas with no per-locale branch in the
     component; a test renders 1/2/4/5-point catalogs to keep it that way.
- **Learn-more tour (spec 047)** — `/tour/{locale}`, five screens between the landing page and
  sign-in, built on 045's contracts. Three things are easy to get wrong:
  1. **Skip must ALSO call `markFunnelEntry()`.** The intuitive reading ("they opted out") is
     wrong: a visitor who skips is still a funnel visitor, and dropping the marker silently costs
     them the guided hand-off 048 provides. Both exits therefore route through one
     `leaveForSignIn()` — adopt language → mark funnel → `push('/sign-in')` — so Skip has no path
     of its own to forget.
  2. **Screens are client state, and position is NOT in the URL.** `useSearchParams` fails a
     production build without a Suspense boundary, and a pushed history entry per screen would
     mean pressing Back five times to leave. Back leaves the tour in one press.
  3. **No `components/ui`.** That module imports `lib/store`, so `PrimaryButton` would drag
     Supabase and the household data layer onto a signed-out page. The tour reproduces its recipe
     in tokens instead. Copy lives only inside the `spec 047` markers in `lib/i18n/landing/*.ts`,
     as a sibling named export typed at `lib/i18n/landing/tour.ts` — `index.ts` is untouched.
  Edge-case logic (`clampScreen`/`swipeIntent`/`formatPosition`) is pure, in `lib/onboarding/tour.ts`.
- **New-user hand-off (spec 048)** — closes the funnel: `lib/onboarding/handoff.ts`
  (`resolvePostSignInRoute()`) is `funnel.ts`'s reader. `app/sign-in/page.tsx` calls it in `verify()`
  instead of hardcoding `/dashboard`; a marker means "clear it, mark the `financial-health`
  announcement seen, go to `/welcome/financial-profile`", and no marker means `/dashboard` having
  written *nothing*. Three things to keep straight:
  1. **It is a SCOPED reversal of spec 042.** 041 hard-redirected every profile-less user, 042
     deleted that on purpose. The hard hand-off is back for funnel-walkers *only* — which is why the
     decision reads the marker and never profile absence. The spec 041/042 test files are the
     regression lock: if a change needs one of them edited, the reversal has leaked.
  2. **The profile check is at the destination, not at sign-in.** `app/sign-in/page.tsx` renders
     outside `AppStateProvider` and cannot read `userFinancialProfile`, so
     `app/(app)/welcome/financial-profile/page.tsx` carries the entry guard (renders `null` while
     redirecting — no stepper flash). This split is the design, not an oversight.
  3. **Only the successful-`verifyOtp` path is wired.** The already-signed-in mount bounce stays a
     literal `/dashboard`; routing it through the hand-off would let a stale per-device marker greet
     a returning user with a questionnaire.
  Keeping the logic in `lib/onboarding/` also keeps 045's FR-019 guard test green — it asserts that
  nothing outside `lib/onboarding/` imports `onboarding/funnel`, so inlining the read into the
  sign-in page would have broken it.
- **Reports mode was removed (spec 036)** — the Overview/Reports toggle (`ModeSwitch`) and the
  fetched `ReportsView`/`useReportsData` UI are gone; the savings-rate view now lives on the board as
  the local-compute `savings-trends` widget. The Dashboard is a single view. (The pure aggregate/
  reports helpers under `lib/api/aggregates.ts` + `lib/reports/*` are retained + still tested.)

## 3. Data layer — `web/lib/store.tsx` (~1500 lines, the whole client data layer)

Single `AppStateProvider`; two contexts (spec 023): `DataCtx` (changing data) + `ServicesCtx`
(stable: `rate, formatMoney, t, resolveUser, ownersDisplay`). `useApp()` merges both;
`useAppServices()` lets `React.memo`'d ledger rows skip re-renders on unrelated mutations.

**Bootstrap** (`runBootstrap`): `auth.getUser()` → signed-out ⇒ `window.location.assign(signInHref())`
(client-side auth gate — no server gate under static export; test builds with `bypassAuth` skip) →
ensure `users` profile row (insert-if-absent, never upsert) → find-or-create household + membership
(fail-loud via `orThrow` — a swallowed read error would create a duplicate household) → ensure
account-holder Person row + one-time fold of legacy localStorage `localUsers` → `ensure_entitlement`
RPC kicked off eagerly in parallel → `loadAll`.

**`loadAll`**: one `Promise.all` of **18 reads** (users, household_people, transactions,
transaction_shares, cards, properties, mortgage_info, lease_info, units, rental_payments, budgets,
goals, goal_contributions, linked_institutions, linked_accounts, tags, transaction_tags,
deposit_accounts).
- Column projection on the 3 high-volume reads (users/transactions/shares) — never `select('*')`
  there. The test memory client ignores column lists, so a missing column only surfaces at runtime.
- **Fail-loud vs fail-open**: the 11 core reads throw (error banner + `bootstrapFailed` ⇒ Retry);
  the 7 newer reads (goals, goal_contributions, linked_*, tags, transaction_tags, deposit_accounts)
  treat
  missing-table errors (`PGRST205`/`42P01`) as empty — the deploy-before-migrate window (Vercel
  ships `main` before migrations apply). `ensure_entitlement` similarly fails OPEN on `PGRST202`
  (missing RPC) with a null entitlement. **New additive tables must join the fail-open list** or
  they take bootstrap down.
- **Typed seam**: every read is asserted to a hand-written `*Row` type in `lib/supabase/rows.ts`
  (18 row types; `supabase gen types` not runnable in sandboxes) then assigned to domain types
  (`lib/types.ts`). Keep `rows.ts`, the projection lists, and `types.ts` in lockstep.
- **Rehydration**: shares → `owner_ids` + per-person `shares` map. A shareless transfer gets EMPTY
  owners (directional, never creator-owns-all); shareless non-transfer falls back to the creator at
  full amount. Unknown kind/category rows are silently dropped (`isKnownTransactionRow`).

**Writes** — all mutations: optimistic state update → async write → on error restore previous state
+ `setError` banner. Specifics:
- **Transactions (spec 027 ledger-atomic, PR #26)**: `addTransaction`/`updateTransaction` call
  `supabase.rpc('upsert_transaction', { p_tx, p_shares })` — parent + shares atomic server-side
  (migration `20260718120002`). The old two-step client write is gone for transactions. Failure
  rolls back the optimistic state.
- **Tags are written after, non-atomically** (`writeTags`: delete-all-then-insert on
  `transaction_tags`); a tag failure surfaces an error but never rolls back the saved transaction
  (no sum invariant; next `loadAll` reconciles). `addTag` reuses case-insensitive-trimmed matches
  and returns the tag synchronously for immediate attach.
- **Properties remain two-step, non-atomic** (`writePropertySubtables`: delete mortgage/lease/units
  then re-insert, each `orThrow`'d; caller rolls back optimistic state).
- Budgets upsert on `(household_id, category)`; people soft-delete via `removed_at`;
  `hapticConfirm`/`hapticDestructive` fire on tap, before server ack (by design, spec 021 FR-012).
- **Deposit accounts (spec 033)**: `depositAccounts` state + `addDepositAccount`/`deleteDepositAccount`
  writes to the household-scoped `deposit_accounts` table (mirrors `cards`) in `store.tsx`. The income
  **"Deposit to" dropdown** on the transaction form reads the configured account names
  (`components/web/TxForm.tsx`, `incomeSources = depositAccounts.map(a => a.name)`); accounts are
  managed in Settings › Deposit Accounts (`AddDepositAccountModal`). The old hardcoded
  `INCOME_SOURCES` constant is gone; `transactions.source` still stores the chosen name (no tx schema
  change).

**Session lifecycle**: `onAuthStateChange` reacts only to `SIGNED_OUT` (clears all state incl.
pending Plaid session, hard-navigates via `signInHref()`). On Capacitor, an `appStateChange`
foreground listener re-validates with server-side `auth.getUser()` — signs out only on 401/403 or
confirmed-missing user, never a transient network error — and quietly `refreshEntitlement()`s.

**FX**: floatrates.com daily USD json → localStorage cache (`fxRates`/`fxRatesFetchedAt`, 24h TTL);
stale cache beats hardcoded `FALLBACK_RATE_FROM_USD`; failure keeps stale rates + `ratesError`. All
amounts stored as **integer USD cents**; conversion is display-only.

**Timezone invariant**: transactions are stored at noon UTC; `monthlySpentBy` builds month windows
on UTC midnights. But date-only strings (housing/insights) parse as LOCAL midnight
(`parseLocalDate`) — mixing the two shifts boundary rows for UTC+12..+14 viewers. The `test:tz`
suite (`*.tz.test.ts`, `TZ=America/New_York`) exists for this and is NOT run by any CI workflow.

## 4. Auth gate & Supabase clients — `web/lib/supabase/client.ts`

Three-way `createClient()`:
1. Test build + `useTestData`/`bypassAuth` → `createMemoryClient()` (DCE'd from prod bundles).
2. `Capacitor.isNativePlatform()` → **raw `@supabase/supabase-js`** with `keychainStorageAdapter`
   (`lib/auth/keychainStorage.ts` over `@aparajita/capacitor-secure-storage`; accessibility
   `whenUnlockedThisDeviceOnly` on every write so delete+reinstall starts fresh; all failures
   swallowed, never thrown into supabase-js). `flowType: 'pkce'`; `storageKey` deliberately
   defaulted so the session key never diverges between targets. **Why raw**: `@supabase/ssr`
   silently discards caller-provided `auth.storage` (verified in 0.12.0), and WKWebView cookies
   evict — never route the native client through `@supabase/ssr`.
3. Web → `@supabase/ssr` `createBrowserClient` cookie path.

Missing `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` fall back to placeholders, never throw (static-export
prerender constructs the client at build time). `lib/nav.ts` `signInHref()` returns
`/sign-in.html` on native (`/sign-in` on web) — Capacitor's SPA fallback serves root `index.html`
for extensionless paths, which infinite-loops signed-out native launches.

## 5. Shell composition — `(app)/layout.tsx`

- **Biometric lock** (`lib/biometricGate.ts`): opaque overlay at `z-[200]` above a *kept-mounted*
  provider (unlock never re-bootstraps); subtree gets `inert` while locked. No enrollment ⇒ never
  gated; plugin failure fails OPEN; re-locks on background; `inFlightRef` guards double Face ID
  prompts. Z-order (guarded by `test/store/biometric-lock-zorder.test.ts`): mobile Modal 50,
  `.ow-drawer-scrim` 70, `.ow-drawer` 80, `.ow-scrim`/`.ow-modal` 100, lock 200 — keep new portals
  below 200.
- **Paywall gate**: `gateState === 'lapsed'` replaces children shell-wide — no route bypasses it; a
  **null gate never blocks** (fail open). `gateState` derives from the entitlement row via
  `lib/entitlements.ts` `deriveGateState` — a deliberate hand-mirror of
  `services/billing/src/derive.ts`, locked by literal vectors V01–V19 + sha256 digest
  (`test/entitlements.test.ts` ↔ `specs/018-subscription-system/contracts/entitlement-state.md`).
  Do NOT "deduplicate" it into a cross-package import; amend the contract before touching
  semantics. Constants: `TRIAL_DAYS=31`, `LEEWAY_HOURS=48`, `DUNNING_GRACE_DAYS=14`.
- `components/Paywall.tsx`: plans via `billing-plans` edge function only; consumes
  `?checkout=success|cancelled` one-shot; clears busy BEFORE navigating to checkout (the Capacitor
  webview never unloads — a stuck busy would brick recovery). `lib/billing.ts` wraps
  `functions.invoke` and parses the `{error:{code}}` envelope; plan prices render raw USD
  (exactly what Stripe charges — not the display-currency converter).
- Splash (`launchAutoHide:false`) hidden by three coordinated owners: Shell on first `loading`
  resolution, lock screen when 'locked', sign-in on mount.
- One sticky error banner in Shell; `bootstrapFailed` adds Retry (`retryBootstrap`).
- **Loading skeletons (spec 032):** while `loading` is true the Shell renders
  `components/skeletons/RouteSkeleton.tsx` — a `usePathname()`-keyed dispatcher that shows a
  route-shaped, **motionless** placeholder (dashboard cards / ledger rows / housing cards / budgets
  / goals / settings; generic fallback otherwise) instead of the old centered "Loading…" string.
  The primitive is `components/ui/Skeleton.tsx` (a static `var(--chip-bg)` block — **no shimmer/
  pulse/gradient**, per constitution IV) wrapped in a `role="status"` busy region. Paywall/lock/
  error precedence is unchanged — a skeleton never masks a lapsed/locked/failed state. List/table
  surfaces are sized from the previous successful load's item count via `lib/skeletonCounts.ts`
  (`readSkeletonCount`/`writeSkeletonCount`, validated + capped at 24); the store records
  `transactions`/`goals`/`housing`/`tags` after `loadAll`.

## 6. Responsive vs desktop composition

- Tailwind `sm` flips TabBar→Sidebar; **≥1024px = "expanded"** via `useIsExpanded()`
  (`lib/useMediaQuery.ts`, resolved synchronously on first render — no wrong-layout flash).
- Transactions/Housing pages branch: `if (isExpanded) return <XDesktop/>` where the
  desktop compositions (`components/web/{Transactions,Housing}Desktop.tsx`) are
  `next/dynamic` `{ssr:false, loading:()=>null}` so mobile/iOS never downloads the desktop chunk.
- **Dashboard is the exception (spec 034)**: its Overview is a single responsive `WidgetBoard`
  (`components/widgets/WidgetBoard.tsx`) — one composition for phone → desktop, so there is no
  `DashboardDesktop` chunk and no `useIsExpanded` branch. Responsiveness is pure CSS: `.ow-board` is a
  **uniform grid** (spec 037) — equal columns (1→2→3 by breakpoint) and a single `grid-auto-rows`
  height, so **every widget is the same height** and any toggled subset tiles with no interior hole.
  There is no per-widget `size` (the old sm/md/lg/wide tiers are gone). A widget whose content
  exceeds the fixed height **scrolls** its body (`overflow-y-auto`) rather than clipping. `.ow-card`
  carries a soft drop shadow in light mode (dropped in dark, where the hairline border does the work).
  Guard: `test/widgets/board-packing.test.ts`.
- **Widgets are data-wired with a shared time scope (specs 035–036)**: the registry
  (`lib/widgets/registry.tsx`) is the single source of truth; each widget has a **propless** body
  under `components/widgets/bodies/<Name>Body.tsx` that reads household data from `useApp()` and the
  active window from `useDashboardScopeContext()` (`lib/widgets/DashboardScopeContext.tsx` wraps the
  overview and calls `useDashboardScope()` ONCE, so the `MonthPicker` + `RangePicker` and every widget
  share one month/range — no desync). **`financial-health` (spec 041)** — the baseline financial-health
  score/band + next step from the pure `financialHealth.ts` engine (calm sand ramp, never red; a
  profile-null CTA and a baseline-vs-now progress line); its questionnaire is a first-run flow at
  `welcome/financial-profile` (shell-gated in `(app)/layout.tsx` on a null profile + a localStorage
  dismissal) and re-takeable at `settings/financial-profile`, both built from the shared
  `components/financial-health/` sections. Shipped widgets: `savings-trends` (savings rate/month, reuses
  `savingsRate` + the `SavingsRateChart` leaf), `spending-pace` (the one recharts area leaf,
  `components/widgets/charts/SpendingPaceChart.tsx` via `next/dynamic`), `budgets`, `goals`,
  `top-merchants`, and `activity` (a most-recent-6 live feed that ignores the scope window). Bodies
  reuse named money helpers (`budgetStatusForMonth`, `goalProgress`/`goalPacing`, `savingsRate`)
  rather than re-implementing math; loss is never red. Every widget card is a **click target** (spec
  037): a full-bleed overlay `<button>` opens a detail panel — the drill-down spec 037 left as a
  placeholder, made real by spec 057 (below).
- **Every data widget can declare a detail panel (spec 057)**: `WidgetDefinition` gains an optional,
  propless `Panel?: ComponentType` alongside `Body` — the same "no props, ever" argument spec 056
  already made for `Body`, so adding a panel never touches the board, Settings, or any other widget.
  Absent ⇒ the original `"Details coming soon."` placeholder; present ⇒ it renders inside the shared
  `WidgetPanel` frame (`components/widgets/WidgetPanel.tsx`), which now owns the `Drawer` `WidgetBoard`
  used to render inline — a right-side drawer over a dimmed board at ≥1024px, `Drawer`'s existing
  `fullBleedOnMobile` full-screen mode below it (unmodified; already proven by `AnnouncementHost` +
  `CsvImportFlow`). `Drawer`'s full-screen mode does **not** apply safe-area insets, so `WidgetPanel`
  itself carries `var(--safe-top)`/`var(--safe-bottom)` padding there — deliberately not added to
  `Drawer`, which would move two unrelated shipped surfaces. A panel is propless like `Body`, so it
  talks to the frame through three hooks `WidgetPanel.tsx` exports rather than props: `usePanelCaption`
  (states which period/subject the figures describe — omitting whichever axis the panel doesn't
  honour, never claiming one it doesn't), `usePanelRouteOut` (an optional footer link to a fuller
  destination), and `usePanelDetail` (an optional second level — `push(title, content)` swaps the
  header's close control for back and steps back on Escape before closing, `Drawer`'s existing
  `onEscape` mechanism from `CsvImportFlow`'s `CsvDrawer`). `components/widgets/panels/` is a
  follow-up panel's own territory — one file there, one test under `test/widgets/panels/`, one
  registry line, and its reserved sub-block in each of the five i18n catalogs (a flat object with no
  reserved regions otherwise, so this branch pre-carved a labelled, non-adjacent block per panel — see
  `specs/057-widget-detail-panels/contracts/`) are the only four touch points, which is what let
  US4–US9 build in six parallel sandboxes without colliding. A small kit
  (`components/widgets/panels/kit/`: `PanelEmpty`, `PanelSectionLabel`, `PanelRow`) was extracted only
  after two structurally dissimilar panels (home equity, budgets) existed, and is **append-only** from
  there — a follow-up may add a primitive in a new file, never modify an existing one. Shipped on the
  base: `home-equity` (the amortization schedule + payoff date, previously computed and discarded on
  every card render) and `budgets` (the rollover ledger `budgetStatusForMonth` already built and kept
  only the last month of — recovered as `budgetLedgerForMonth` — plus the composing transactions and an
  honestly-worded month-end projection) and `activity` (a longer date-grouped feed; ignores the time
  window by design, matching its card). Out of scope: `financial-health` (explicit exclusion) and the
  four navigation-shortcut widgets (they route, never open a panel).
- **The board has TWO scope axes (spec 056)**: time, above, and **people**. The people axis is
  `lib/widgets/MoneyScopeContext.tsx` — a deliberate sibling of `DashboardScopeContext`, so a body
  reads "whose money" exactly as it already reads "which window" and stays **propless** (threading a
  `personId` would have changed `WidgetDefinition.Body`'s type for all fifteen widgets to serve six).
  `app/(app)/dashboard/page.tsx` holds a `MoneyScope` in state — mirroring `planning/page.tsx`'s
  `rawScope` + `resolveScope` pattern — and supplies it via `MoneyScopeProvider`;
  `MemberScopePicker` writes it, and the hero's `personId` is now *derived* from it. Holding the
  scope (rather than a `personId` string) is load-bearing: `personScope()` allocates, so deriving it
  during render would hand a fresh object to every memo on every pass, while `resolveScope` returns
  the same reference. **Reading the context outside a provider returns `HOUSEHOLD_SCOPE` rather than
  throwing** (the one divergence from the time axis): household scope is the *identity* projection —
  `scopeTransactions` returns the same array reference — so the default is not a guess, and it lets
  every pre-existing `test/widgets/*` suite keep passing **unmodified**, which is what proves
  household output did not move. A body joins the axis by calling `useScopedTransactions(transactions)`
  in place of reading `transactions`; the projection memo lives once, in the context module. Scoped:
  `spending-pace`, `top-merchants`, `savings-trends` (**both** its bucket loop and its previous-month
  comparison), `activity`, and `budgets` (limits via `scopeBudgets` AND spend via `scopeTransactions`,
  with **no** fallback to a household limit for a person who set none). `household-balances` takes the
  axis by **filtering rows**, never by consuming projected transactions — projection rewrites
  `owner_ids` to a single owner and so deletes the payer↔co-owner relationship a debt is derived from;
  fed projected rows it would calmly report "All settled up." for a household that owes money (guard
  case in `test/widgets/household-balances.test.tsx`). Not scoped: `housing-costs`/`home-equity` (a
  property is a household asset) and the settings shortcuts (no money). **`financial-health` and
  `goals` are excluded pending their own change** and are pinned as unchanged under person scope; note
  `financial-health` already scopes internally (spec 052) but to the *signed-in* person, never the
  viewer's selection. The dashboard picker's default option reads **"Household"**; the shared
  `Everyone` key is untouched because `PlanScopeBar` and `TxForm` still use it
  (`test/dashboard/scope-copy-isolation.test.tsx`).
- **Net summary is baked into the overview, not a widget** (`components/dashboard/NetSummaryHero.tsx`):
  the most prominent element — income − expenses over the shared window, rendered card-less above the
  board, always shown (not toggleable). To its right sits the **daily-spending heatmap**
  (`components/dashboard/SpendHeatmap.tsx` + the pure `lib/dashboard/spendHeatmap.ts`): a GitHub-style
  calendar of per-day expense intensity (sand `--accent` ramp, never red). Bundle guard
  (`test/bundle/no-eager-recharts.test.ts`) covers `components/widgets`.
- Dialog vocabulary: desktop `components/web/Drawer.tsx` (right slide-out, portal, scrim + Escape +
  focus trap via `lib/useFocusTrap.ts`, scroll lock). Opt-in props: `fullBleedOnMobile` (full-screen
  panel with no scrim below 1024px, for surfaces that mirror the full-page mobile form — e.g. CSV
  import) and `onEscape` (staged back before close). `components/web/WebModal.tsx`; mobile uses
  the `Modal` bottom-sheet in `components/ui.tsx` plus spec-025 full-page forms.
- **Spec 025 mobile form pages**: `/transactions/new|edit`, `/housing/new|edit` are dedicated
  static routes on mobile; at ≥1024px they `router.replace` back to the list (desktop keeps its
  drawer). Plumbing: `lib/useMobileFormPage.ts` — reads `window.location.search` ONCE post-mount,
  **never `useSearchParams`** (Suspense deopt under static export; zero uses codebase-wide). Pure
  intent parsers in `lib/formPageIntent.ts` (`parseTxNewParams`: settle-up `from/to/amount` beats
  `copyFrom`; malformed → blank form). Frame: `components/web/FormPage.tsx`. Guard:
  `test/web/form-factor-split.test.ts`.

## 7. Hooks

| Hook | Role |
|---|---|
| `lib/useDashboardRange.ts` | `useDashboardScope()` — single time-scope source, mobile + desktop; relative range persisted (`dashboardRange`), selected month transient; windows via vectored `monthBounds` |
| `lib/useTransactionFilters.ts` | single filter-state source; pure engine `lib/transactionFilters.ts`; tag options exclude orphan tags |
| `lib/useMonthAccordion.ts` | default-open = current month; any active filter force-expands all months |
| `lib/useMobileFormPage.ts` / `lib/useFocusTrap.ts` / `lib/useMediaQuery.ts` | see §6 |

`lib/api/aggregates.ts`: dashboard widgets deliberately stay local-compute (spec 023 D15 — RPC
wiring is a net perf loss + breaks offline). `fetchOwnerSpend`/`fetchDailyExpense` are unwired;
**known latent bug**: `fetchOwnerSpend` types `person_id` but the RPC returns `user_id` — fix
before wiring (also recorded in `PARITY.md`).

## 8. i18n & preferences

- `lib/i18n/index.ts`: keys ARE the English source strings; positional `{0}` placeholders. 5
  catalogs (bn/es/ja/zh/ko) **dynamically imported per active language** (~30 KB gz never in the
  initial bundle); `useTranslate` returns English identity until the catalog resolves. `'System'`
  resolves via `navigator.language` prefix. `Language` values are native names (`'Español'`…).
- localStorage keys: `currency`, `language`, `appearance`, `textSize` (spec 040 — one of
  `small|medium|large|xlarge`, default `medium`; a whole-UI `zoom` scale on `<html>` from
  `components/settings/textSize.ts`, mirroring appearance), `dashboardRange`, `fxRates`,
  `fxRatesFetchedAt`, `ortho.flags`, `ortho.plaid.pendingLinkSession`, `ortho.skeletonCounts`
  (spec 032 — remembered per-collection sizes for loading skeletons), legacy `localUsers`
  (consumed once at bootstrap).

## 9. Design tokens — `web/app/globals.css`

- Single source of truth for tokens (Tailwind v4 `@config` maps utility names onto the CSS vars):
  core semantic (`--bg --surface --text --text-2 --text-3 --accent --positive --destructive
  --hairline`), 6 household palette pairs, desktop tokens (`--surface-2 --chip-bg --chip-text`),
  brand fixtures NOT theme-swapped (`--owner-* --cat-* --pay-ach`), motion, safe areas
  (`--safe-*` = `env(safe-area-inset-*)`).
- Dark mode: `prefers-color-scheme` media block PLUS static `:root[data-appearance='light'|'dark']`
  overrides targeted by the pre-paint boot script (from `components/settings/appearance.ts`
  `THEME_VARS` — change theme tokens in globals.css AND appearance.ts; the latter also drives the
  native status-bar style).
- Constitution rules: tokens-only closed palette, no bold (`font-synthesis: none`; weight follows
  size), loss/cost never red, hairlines over borders, `prefers-reduced-motion` kills transitions.
- `html.native` disables selection/callout except inputs + `.ortho-selectable`; `touch-action:
  manipulation` on tappables. Desktop chrome = handwritten `ow-*` class family (grid/card/nav/
  drawer/modal/ledger-table); `.cv-row` uses `content-visibility: auto` for long-ledger scroll perf.
- Guard: `test/tokens-only-backgrounds.test.ts`.

## 10. Scan pipeline — `web/lib/scan/` (9 files)

Extraction is native (Vision/PDFKit behind the custom Scan Capacitor plugin); **all
parsing/inference is TypeScript** (ported from the frozen app's Swift). Native plugin internals:
[./ios.md](./ios.md). Contract: `specs/021-capacitor-ios-consolidation/contracts/scan-plugin-api.md`.

- `scanModels.ts` types the boundary (`ScanDocumentText`, frames normalized 0–1 top-left origin;
  `ParsedCandidate` with `amountCents` always > 0 + `direction`; `ScanContext` fully injected — no
  clock/live collections). `scanHeuristics.ts` = pure parsing primitives (statement half mirrors
  the import-CLI conventions — convention mirror per `PARITY.md`, not vectored math).
- `scanParser.ts` `parseScan`: binding 6-tier detection order (multi-row statement → stacked
  app-list rows → labeled grand total → 1-2 rows → forgiving best-effort receipt → none); each tier
  gets a fresh `claimed` Set; per page, tables-vs-lines: whichever yields more rows wins.
- `scanInference.ts` `enrichCandidate`: household merchant history → rule table → form default;
  duplicate claiming = same day + same amountCents, USD only, greedy one-to-one.
- `scanSession.ts`: pure reducer, phases `idle → parsing → receiptPrefilled | interstitial →
  reviewing → summary | failed`; payment rows pre-skipped; `skipDuplicates` survives `reset`;
  `failureReason: 'unreadable' | 'unsupportedOnWeb'`.
- `useScanFlow.ts` orchestrates. Camera: native = plugin `capture()` (live-OCR-gated shutter);
  **web = honest `unsupportedOnWeb` failure** (no browser OCR). PDF: native = file-picker +
  `extractPDF()`; web = `webCapture.pickFile` + `webPdf.extractPdfToDocument` (unpdf) — both feed
  the identical `parseScan`, so candidates match cross-platform. Heavy modules dynamically imported
  inside capture callbacks (spec 022). Multi-page camera: subscribe `pageCaptured` BEFORE
  `capture()`.
- `webCapture.ts`: transient `<input type="file">` — `.click()` MUST fire synchronously inside the
  user gesture, before any `await`. `webPdf.ts`: throws `UnreadablePdfError` for image-only PDFs.
- `scanPlugin.ts` is the ONLY `registerPlugin('Scan')` call site; contains the "empty object means
  null" bridge quirk (Capacitor iOS can't resolve bare `null`). `refineMerchant`/`rescue` are wired
  in the plugin + wrapper but have zero call sites in the app (not yet integrated).
- UI: `components/scan/{ScanInterstitial,ScanSummary}.tsx`, `components/web/ScanFlow.tsx`.
  **No UI entry point wires these in anymore** — the receipt/statement scan button was removed
  from both the mobile and desktop Transactions headers in favour of the CSV import route (the
  camera/scan chips were consolidated away since CSV import supersedes them). The lib + `ScanFlow`
  chrome are retained (not imported by any page); tests still cover them. Tests: `web/test/scan/`
  (9 suites).

CSV import UI (`components/csv/CsvImportFlow.tsx`): the phase dispatcher renders every phase
(list-view / summary / importing / undetected) inside the shared `Drawer` with `fullBleedOnMobile`
— the right-side `ow-drawer` + scrim on desktop, a full-screen portalled panel on mobile — matching
how add/edit transaction renders (desktop drawer vs. full mobile page). Header is the shared
`DrawerHeader`; rows use the shared `FormRow` (kit) — the same one the transaction form uses.
Replaced the earlier bottom-sheet chrome. The preview list (`CsvImportList`) uses the app's
Activity-row vocabulary — category glyph tile (`CatTile`) · merchant + category meta · amount,
hairline rows, sticky uppercase day headers. Clicking a parsed row pushes the per-row editor
(`CsvRowEditModal`) into the **same** pane (master → detail) with a back button — not a
full-screen overlay; Esc steps back to the list. The editor mirrors the new/edit transaction
form (`ow-card`/`Row` groups, owner chips, shared `TagEditor`, note textarea): a reviewer can set
merchant, category, **multiple owners, tags, and a note** — amount + date stay read-only (from the
statement). The Merchant field autocompletes from the household's own merchant names and shows
"you've used" chips (`lib/csv/merchantSuggest.ts`: `rankedMerchants` by frequency + `suggestMerchants`
via the same normalize/similar logic as duplicate detection) so a messy descriptor like
"UBER EATS 8005928996 CA" can be normalized to the "Uber Eats" the household already uses. (Adding
`list=` makes the input a `combobox`, not a `textbox` — query it by label in tests.) The same
primitives — plus a most-common ranking — also power the regular add/edit transaction form via
`lib/txSuggest.ts` (spec 032): `TxForm`'s "Copy from most common" shortcut selects merchants by
frequency (`mostCommonTransactions`, one representative most-recent entry each) then presents them
grouped by category (slug asc) and alphabetically by merchant within each; the form's Merchant/Source
field gets the same kind-aware `<datalist>` suggestions
(`knownNamesForKind` — expense merchants vs income payers). "Skip this
transaction" sets `skipped:true` on the draft, which drops it out of the review list entirely (not
just unchecked). On upload each draft is seeded with the importing user as its default owner
(`parsedTransactionToDraft(tx, dup, defaultOwnerId)`; `defaultOwnerId` threaded through the
`file/parsed` action from `useCsvImport`), so owners are populated before review and `startImport`'s
`buildTransaction` computes an even split.

Duplicate detection (`lib/csv/duplicateMatch.ts`): on upload each parsed row is checked against the
existing ledger — `useCsvImport` passes the household's transactions as `existing` on the
`file/parsed` action; the reducer calls `findDuplicateId` per row. A row is flagged (`duplicateOf`
set, `checked:false` — excluded by default but shown in review with "Include anyway") when it shares
the **same amount + a similar merchant + dates within ±3 days** (the `DEFAULT_DAY_WINDOW` — absorbs
a card's transaction-vs-post-date drift and small manual-date errors, but stays narrow so a monthly
subscription isn't flagged against last month's; the closest-dated candidate wins). Merchant
similarity normalizes both names (lowercase, strip punctuation, drop digit runs) and matches on
containment or a shared significant word, so a hand-typed "Amazon" catches the CSV's "Amazon Prime".
Detection runs when the file is PARSED (`loadFile`), not at commit — covered end-to-end by
`test/csv/useCsvImport.duplicate.test.tsx`. Deliberately does NOT key on
`source` (unlike the CLI's `engine/dedupe.ts`, which is for idempotent statement re-imports) — a
manual entry's source is a card name, not the bank label. Known gap: abbreviated bank descriptors
("AMZN") won't match a spelled-out manual entry without a future alias map. (Note: the CSV components previously used undefined tokens
`--text-secondary`/`--background`; corrected to `--text-2`/`--bg` and `#fff` on accent fills.)

Separate from scan: `make ingest` — the no-LLM statement importer CLI ([./makefile.md](./makefile.md)).

## 11. Plaid client surface (spec 024 — connect-only)

- `lib/aggregation.ts`: wrappers over the `plaid-*` edge functions — `checkLinkingAvailable()`
  (probe; Linked-banks page goes dark on `not_configured`), `createLinkSession`,
  `completeLinkSession` (server-idempotent), `disconnectInstitution` (server revokes first). All
  responses shape-validated; raw provider text never reaches UI.
- `lib/plaidLinkSession.ts`: single pending record in localStorage (link token + ids only — never
  public/access tokens); hosted records get +6h grace past token expiry; injected `now`.
- Two Link modes: web = embedded `react-plaid-link` (`next/dynamic` in
  `components/settings/EmbeddedPlaidLink.tsx`, ×2 sites); native = Hosted Link in the external
  browser, returning via `ortho://plaid-done`. Web OAuth detour returns to `/plaid-oauth`.
- `components/PlaidHandBack.tsx`: mounted once in Shell, renders nothing, native-only. Three
  triggers → one idempotent exchange: mount, `appUrlOpen`, foreground poll. Terminal codes clear
  the pending record; `session_incomplete`/transient keep it.
- Store holds `linkedInstitutions/linkedAccounts` read-only (edge functions do all writes);
  `refreshLinkedBanks()` never renders a false-empty on failure.

## 12. Capacitor iOS shell — `web/capacitor.config.ts` + `web/ios/App/`

- `appId: 'AyazUddin.Ortho-iOS'` — deliberately reuses the frozen app's bundle id (TestFlight/ASC
  listing continuity). `webDir: 'out'`. `ios.contentInset: 'never'` (safe areas are CSS-side).
  **`server.iosScheme: 'https'` is load-bearing**: the default `capacitor://localhost` origin is
  rejected by Supabase CORS; `https://localhost` must be on the Supabase CORS allow-list.
  Plugins: `Keyboard.resize:'body'`, `SplashScreen.launchAutoHide:false`,
  `StatusBar.overlaysWebView:true`.
- `web/ios/App/`: `App/` sources + `App.xcodeproj` (scheme **App**) + `CapApp-SPM/` (Capacitor-CLI
  managed SPM package — do not edit `Package.swift`). Deployment target iOS 15.0; the Scan plugin's
  structured OCR / Foundation Models paths are iOS 26 and degrade at runtime. `Info.plist` carries
  camera + Face ID usage strings and the `ortho://` URL scheme.
- **Do not confuse** `web/ios/App/App.xcodeproj` (scheme `App`, live) with `iOS/Ortho-iOS.xcodeproj`
  (scheme `Ortho-iOS`, frozen) — same bundle id, different projects. The manual `ios-deploy.yml`
  lane currently archives the FROZEN app; see [./ios.md](./ios.md) before any TestFlight deploy.
- Build loop (macOS/Xcode only — **Linux sandboxes cannot build iOS**):

```bash
cd web
npm run build                          # static export → out/
npx cap sync ios                       # copy out/ → ios/App/App/public/ (gitignored), resolve SPM
npx cap open ios                       # or:
xcodebuild build -project ios/App/App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS Simulator'
```

  `npx cap run ios --live-reload` is dev-only — never ship with `server.url` set (App Store 4.2).
- CI: `.github/workflows/capacitor-ios-ci.yml` — push to `main` + PRs touching `web/**`;
  macos-latest; `npm ci` → `npm run build` (placeholder `NEXT_PUBLIC_*` — inlined but never
  fetched) → `cap sync` → `xcodebuild build`. **Build-only smoke check, no tests**; the native Scan
  plugin has no automated test target (tracked gap). Watch runs with
  `GH_TOKEN=placeholder gh run watch --exit-status`.

## 13. Bundle discipline (spec 022)

Deferred via `next/dynamic` so they leave the initial-load bundle: recharts charts (`CategoryPie`,
`SavingsRateChart`, `SpendingPaceChart` (`components/widgets/charts/`, spec 037), `AmortizationChart`
— guard `test/bundle/no-eager-recharts.test.ts`; `DailyTrendChart` was removed in spec 034, and
`CategoryPie` still exists but is no longer imported by any page), the scan pipeline (loads on scan
initiation — guard
`test/scan/scan-deferred.test.ts`), the 3 desktop compositions (guard
`test/web/form-factor-split.test.ts`), i18n catalogs (guard `test/i18n/no-eager-catalog.test.ts`),
and `EmbeddedPlaidLink`. Measure: `npm run build && npm run measure:bundle` (`--json`/`--baseline`
for diffs) — sizes derive from each `out/<route>.html`'s script tags (Turbopack chunk names are
opaque). Contract: `specs/022-web-bundle-optimization/contracts/bundle-measurement.md`.

## 14. Test-data harness, holistic seed & env-gated auth (specs 015 + 026 + 030)

- **Environment signal (spec 030):** `lib/app-env.ts` `appEnv()` → `local | stage | prod` from
  `NEXT_PUBLIC_APP_ENV` → `NEXT_PUBLIC_VERCEL_ENV` → `NODE_ENV`, **deny-by-default to `prod`** for any
  env it cannot prove non-prod. `lib/test-build.ts` `isTestBuild()` = `appEnv() !== 'prod'` (same
  truth table as before). `lib/flags.ts`: `useTestData` + `bypassAuth` in `localStorage['ortho.flags']`,
  forced `false` off test builds; Settings › Developer = `components/settings/flags-section.tsx`.
- **Local/stage auto-login (spec 030):** `lib/auth/autoLogin.ts` `autoLoginEnabled()` is **triple-gated**
  (`appEnv() !== 'prod'` AND `NEXT_PUBLIC_DEV_AUTOLOGIN === '1'` AND `NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL/
  _PASSWORD` set) so it is provably impossible in production (dead-code-eliminated). `store.tsx`
  `runBootstrap()` calls `supabase.auth.signInWithPassword(seed creds)` against the **real** backend
  when there is no session — skipping the OTP screen but exercising real RLS/RPCs/edge functions.
  Distinct from `bypassAuth` (the in-memory stub, no backend).
- `lib/testdata/memory-client.ts`: chainable Supabase stand-in serving `lib/testdata/seed.ts`. Spec 030
  replaced the hand-typed 16-row array with a small deterministic GENERATOR (recurring monthly basket
  + goals + tags + a linked SimpleFIN bank), so the offline in-memory mode also populates the Goals,
  Tags/Notes, and Linked-banks screens. Bundle-safe (reuses only `lib/splits`; never imports
  `test/corpus`). Writes are accepted and dropped; `rpc('ensure_entitlement')` returns null (subscription
  hidden in test-data mode).
- **Coverage corpus** (`web/test/corpus/`, specs 026 + 030): pure deterministic generator
  (`generateCorpus`, `DEFAULT_SEED = 0x02026`, `CORPUS_VERSION = 2`), now covering the previously-missing
  tables (goals, goal_contributions, tags, transaction_tags, linked_institutions, linked_accounts,
  entitlements) across extended coverage dimensions; ~236 scenarios; shares computed only via
  `lib/splits.ts` (guarded — no forked math; guarded against bundle import). Committed snapshot
  `test/corpus/__snapshots__/corpus.snapshot.json`; regenerate with `npm run gen:corpus`.
- **Realism / demo layer (spec 030):** `web/test/corpus/realism.ts` `buildDemoHousehold(now)` — one
  realistic, **now-anchored** household (the auto-login user owns it) that populates every screen.
  A rolling 6-month, ~450-transaction ledger grounded in `docs/research/finance-habits-budgeting-apps.md`
  (§5 cadence, §3 unhappy-path taxonomy) + the NYC market analysis: ~11 subscriptions (creep),
  recurring bills, a discretionary long tail, two-earner variable income, a monthly remittance,
  seasonal spikes, and a car/medical shock with an overdraft. Deterministic given `now` (fixed-seed
  PRNG + per-month substream — no `Date.now`/`Math.random`), NOT part of the snapshot corpus.
- **Holistic seeder:** `npm run seed:corpus` seeds the demo household by default (add `--corpus` for the
  full edge corpus) into a **local/dev** Supabase only (`seed-guard.ts`: remote requires
  `--i-understand-this-is-not-local` AND `SEED_ALLOW_REMOTE=1`). It creates the required `auth.users`
  rows via the Admin API (mapping every user-id column to the real auth id — fixing the latent
  `public.users → auth.users` FK gap), inserts `entitlements` as service-role, and upserts on stable ids
  (idempotent). Operator runbook: `specs/030-holistic-seed-auth/quickstart.md`.

## 15. Vitest suite shape — `web/test/`

- Two configs: `vitest.config.ts` (`TZ='UTC'`, node env default, `fileParallelism:false` — sandbox
  jsdom worker race, don't "optimize" away; excludes `*.tz.test.ts`) and `vitest.tz.config.ts`
  (`TZ='America/New_York'`, only `*.tz.test.ts`, run via `npm run test:tz` — **not run by any CI
  workflow**).
- **13 `*.parity.test.ts` suites**, 1:1 with the 13 vectors in `shared/test-vectors/` (naming
  matches the JSON basename except `transaction-splits.json` ↔ `splits.parity.test.ts`). Vectors
  regenerate via `npm run gen:vectors`; web-ci's drift gate (`gen:vectors` + `git diff --quiet
  ../shared/test-vectors`) fails if an engine changed without committed regenerated JSON. See
  [./shared.md](./shared.md).
- Component suites opt into jsdom per file via first-line `// @vitest-environment jsdom`; pure
  logic stays node. Helpers: `test/helpers/supabase-mock.ts` (`makeSupabaseMock`, `primeFxCache`,
  `stubNoNetwork`), `test/helpers/fixtures.ts`.
- Coverage (`npm run test:coverage`, v8) is **scoped**: pure `lib/` engines +
  `scripts/import/**` only, thresholds 90/90/80 (import slightly lower). View components are
  behaviorally tested, not line-covered.
- CLI import suite: `web/test/import/` (golden statement tests for amex-gold/apple-card/chase-csv/
  td-bank, `toTransaction.test.ts` with the A4 sort-order lock).
- CI: `.github/workflows/web-ci.yml` — job 1 typechecks + tests `services/billing`,
  `services/aggregation` (each incl. the `_shared/` byte-copy drift lock), then web `tsc --noEmit`
  + `npm test` + the vector-drift gate; job 2 runs `deno check` + `deno test` on the 10 edge-function
  entrypoints. Keep `npx tsc --noEmit` clean — a type error fails `next build` and there is no
  other build gate.

## 16. Build / run / deploy

```bash
cd web
npm install
npm run dev              # http://localhost:3000
npm run build            # static export → web/out/
npm test                 # vitest run (UTC)
npx tsc --noEmit         # CI gate
```

- **Linux sandbox native-binary fix** (node_modules usually installed on macOS-arm64):
  `npm install @rolldown/binding-linux-arm64-gnu lightningcss-linux-arm64-gnu
  @tailwindcss/oxide-linux-arm64-gnu @next/swc-linux-arm64-gnu --no-save` — without it vitest and
  `next build` fail on missing platform bindings. Never touch the lockfile for this.
- **Vercel** (project `ortho`, team `ayaz2589s-projects`): **Actions own all deploys — no Vercel Git
  auto-deploy on `main`** (`web/vercel.json` `deploymentEnabled.main:false`). Merging to `main`
  auto-deploys **staging** (`web-deploy-staging.yml`); **prod is a manual promotion**
  (`web-deploy.yml`, `workflow_dispatch`). Both use the Vercel CLI (migrate-then-deploy). Load-bearing
  settings: **Root Directory = `web`** (the #1 first-deploy failure) and the per-environment
  `NEXT_PUBLIC_*` vars (Vercel builds remotely — `.env.local` is not involved; env-less builds
  succeed on placeholders but can't sign in). **Full environment/deploy model: [./environments.md](./environments.md).**
- **Env** (`web/.env.local`, gitignored): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (inlined at build, incl. the Capacitor build);
  `SUPABASE_SERVICE_ROLE_KEY` (CLI `ADMIN=1` only); `IMPORT_EMAIL` (optional CLI OTP). Live
  project: `brujhxmtzfgowimprueo.supabase.co`.
- iOS: §12 above; TestFlight deploy lane and its frozen-app warning: [./ios.md](./ios.md).
- Import CLI: run from the **repo root** via `make ingest` / `tx-list|add|edit|rm` /
  `repair-dates` — full contract in [./makefile.md](./makefile.md) and
  `web/scripts/import/README.md`.

## 17. Gotchas (quick list)

- Transactions write through the `upsert_transaction` RPC — any "two-step parent+shares" mental
  model is stale (only properties and tags remain two-step; tags intentionally un-rolled-back).
- supabase-js resolves `{error}` instead of throwing — must-not-fail-silently results go through
  `orThrow`; missed checks previously caused duplicate households.
- Fail-open codes are load-bearing: `PGRST202` (RPC missing), `PGRST205`/`42P01` (table missing).
- `useSearchParams` is banned (static-export Suspense deopt) — read `window.location.search` in a
  mount effect. No dynamic `[id]` routes; intent travels as query params on static routes.
- Hard navigations must use `signInHref()` (`.html` on native) or native signed-out launch loops.
- `@supabase/ssr` discards `auth.storage` — never route the native client through it.
- Insight engine outputs USD-formatted strings regardless of display currency (currency-agnostic
  core, by contract).
- No single-active-platform lock (feature 010): iOS + web sign-ins coexist; sessions age out at the
  30-day Supabase timebox.
- `web/README.md` is the Ortho web quick-start (scripts, architecture, route map — points here for
  the deep dive); the generated `web/coverage/`, `web/out/`, `tsconfig.tsbuildinfo` are artifacts.

## 18. Cross-links

- [./finance.md](./finance.md) — the pure engines (`lib/finance/*`, splits, balances, filters).
- [./supabase.md](./supabase.md) — schema, RLS, RPCs, edge functions this client calls.
- [./shared.md](./shared.md) — the 13 golden vectors + drift gate.
- [./makefile.md](./makefile.md) — the import CLI (`web/scripts/import/`).
- [./ios.md](./ios.md) — native Scan plugin internals, frozen app, TestFlight deploy lane.
- Root `PARITY.md` — the audited web↔CLI parity contract; `.specify/memory/constitution.md`
  (v2.0.0) + the `ortho-web` skill — design-system law.
