# Phase 0 Research: Mobile new/edit flows as dedicated pages

All items below were resolved against the actual repo (Next.js 16.2 App Router, `output: 'export'`,
Capacitor-wrapped) and its bundled docs (`web/node_modules/next/dist/docs/`), per `web/AGENTS.md`.

## D1 — Route shape: static routes + query-param intent (NOT `[id]`, NOT route interception)

**Decision**: Add four static leaf routes under the existing `(app)` segment:
`transactions/new`, `transactions/edit`, `housing/new`, `housing/edit`. Transient intent rides as
query params: `?id=<uuid>` (edit), `?copyFrom=<uuid>` and `?from=&to=&amount=<cents>` (add-transaction
variants), `?kind=<propertyKind>` (optional; add-property otherwise selects kind in-page).

**Rationale**: `output: 'export'` is a hard project constraint (`next.config.ts`). Under it:
- Dynamic `[id]` segments require `generateStaticParams()` with build-time-known ids — runtime
  household UUIDs are unknowable at build → `[id]` routes cannot be generated.
- **Intercepting** (`(.)`) and **parallel** (`@slot`) routes — the framework's canonical
  "modal on soft-nav / page on refresh" pattern — are explicitly **unsupported** with static export
  (bundled `static-exports.md`).
Static routes export cleanly to flat HTML (`out/transactions/new.html`, …) and the id/intent is
resolved client-side from the already-loaded store.

**Alternatives rejected**: `[id]` dynamic routes (can't prerender runtime UUIDs); intercepting/parallel
routes (banned by static export); hash-based state (non-idiomatic, breaks Link semantics).

## D2 — Reading query params: `window.location` in a mount effect, NOT `useSearchParams()`

**Decision**: Read the query params client-side with `new URLSearchParams(window.location.search)`
inside a `useEffect(() => …, [])`, holding the parsed intent in state that starts `undefined` (= "not
read yet") until the effect runs — mirroring `app/(app)/plaid-oauth/page.tsx` exactly.

**Rationale**: The codebase contains **zero** uses of `useSearchParams()` — the one query-param-ish
page (`plaid-oauth`) reads `window.location.href` directly and gates client-only reads behind an
`undefined`-until-mounted state because the static export prerenders the component at build time where
`window` does not exist. Following this precedent (a) avoids the `useSearchParams()` static-export
requirement to wrap the page in a `<Suspense>` boundary (and the "deopted into client-side rendering"
build warning/failure), and (b) keeps one consistent pattern across the app. The `(app)` subtree is
already fully client-rendered behind the auth/loading gate, so reading `window.location` after mount is
correct and hydration-safe.

**Alternatives rejected**: `useSearchParams()` + `<Suspense>` boundary (adds a boundary the repo has
deliberately never needed, and risks the export deopt); passing objects via router state (not supported
across a static export navigation / hard reload).

## D3 — Form-factor branch lives at the entry points AND is self-guarded on the page

**Decision**: Two layers.
1. **Entry points** branch on `useIsExpanded()`: `isExpanded ? openInPlace() : router.push(url)`.
   Encapsulate in a small helper `useFormFactorNav()` returning `{ isExpanded, go(url) }` (or the
   trigger calls both today's `setState` and, on mobile, `router.push`).
2. **Each page self-guards**: on mount, if `useIsExpanded()` is true (desktop width — reached only by
   resize/reload/manual URL), `router.replace()` back to the list. This guarantees "desktop unchanged"
   even if a page URL is somehow loaded wide.

**Rationale**: Desktop call sites must keep doing *exactly* what they do today (open the in-place
tray/drawer via local state, no navigation). The page self-guard is the guardrail from spec FR-012 / US3.
`useIsExpanded()` resolves synchronously on the client (no flash) and is already the app's single content
breakpoint (1024px).

**Alternatives rejected**: rendering the desktop tray inside the page at ≥1024px (would duplicate/relocate
desktop code and violate "desktop untouched"); a global route guard (heavier than a per-page effect).

## D4 — Edit target + not-found: resolve from the store by id, redirect if absent

**Decision**: Edit pages read `?id=` then resolve the entity from `useApp()` (`transactions.find` /
`properties.find`), exactly as `TransactionDetailModal` and `housing/page.tsx` do today. If the id is
missing or resolves to nothing (stale link, deleted, wrong household), `router.replace()` to the list.

**Rationale**: The store is ambient and already the source of truth for both surfaces; passing the full
entity across a URL is impossible and unnecessary. Redirect-on-missing mirrors today's
auto-dismiss-on-delete effects and satisfies the edge cases in the spec.

**Timing nuance**: while the store is still loading (`loading` true) the page shows the Shell's normal
loading state; the not-found redirect only fires once data is present and the id truly has no match.

## D5 — Housing refactor: extract `<PropertyForm>` body from `AddPropertyModal`

**Decision**: Move `AddPropertyModal`'s form body (all field state, the `[open, editing?.id]` seed
effect, `handleSubmit`, kind-conditional sections) into a new `<PropertyForm kind editing? onDone>` that
takes no `Drawer`. `AddPropertyModal` keeps its `Drawer` wrapper and renders `<PropertyForm>` inside
(desktop unchanged). The mobile page renders `<PropertyForm>` bare inside page chrome.

**Rationale**: Transactions already separate logic (`useTxForm` + `TxFormBody`) from chrome, so the
transaction pages reuse them directly. Housing bakes the `Drawer` into `AddPropertyModal`, so a bare-body
extraction is required to avoid duplicating the property form logic (spec FR-014). The
`[open, editing?.id]` seed effect must keep firing correctly when the body mounts fresh on a page (it
will — `open` is effectively always true on a page; seeding runs on mount).

**Alternatives rejected**: duplicating the form on the page (violates no-duplication); making
`AddPropertyModal` render either a Drawer or nothing based on breakpoint (mixes chrome concerns into the
modal and risks touching desktop).

## D6 — Navigation after Save/Cancel; sub-flows stay in-page

**Decision**: After Save or Cancel, `router.push('/transactions')` / `router.push('/housing')` (push, so
the list is a normal history entry; the page itself was pushed onto history by the entry point, so back
also works). "Save and add another" calls the existing `resetForAnother` and stays on the page.
"Copy from recent" and the property kind step remain in-page sub-views (local state), not sub-routes.

**Rationale**: Simple, predictable return to the list (spec FR-010/FR-011). Keeping batch-entry and
copy-picker in-page preserves today's UX without extra routes.

**Alternatives rejected**: `router.back()` (fragile if the page was reached by reload/deep-link with no
prior history entry — `push` to the explicit list route is robust); separate routes for copy/kind
sub-views (unnecessary complexity).

## D7 — Bundle split preserved

**Decision**: Do not statically import any `*Desktop` composition from the new pages or the mobile
branches. Desktop trees remain `next/dynamic({ ssr: false })`. The new page routes are naturally
code-split by the router. Keep `test/web/form-factor-split.test.ts` green (extend it if it should also
assert the new pages don't pull desktop code).

**Rationale**: Constitution/perf constraint and existing guard (spec FR-015). Route-level code splitting
plus the existing dynamic-import discipline keeps desktop tray code out of mobile page bundles.

## D8 — `TxModalWeb` disposition

**Decision**: Leave `TxModalWeb` in place for the desktop-adjacent paths that still use a modal (it is
also what the mobile detail sheet's Edit currently mounts). Mobile entry points stop mounting it and
navigate to the page instead; confirm during implementation that no *desktop* path depended on the mobile
entry mounting it. `ScanFlow` keeps using `useTxForm` directly (unaffected).

**Rationale**: Minimizes desktop-surface churn; the shared form logic (`useTxForm`) is what matters and is
reused by the page. Avoids a risky rewrite of the detail→edit modal chain on desktop.

## Cross-cutting confirmations

- **Store inheritance**: `AppStateProvider` is mounted once in `app/(app)/layout.tsx`; sibling routes
  under `(app)` inherit `useApp()` with no wiring, and the layout is not remounted on soft navigation
  (bundled `layouts-and-pages.md`). ✅
- **Gates**: new pages sit under the same Shell → inherit auth + paywall + biometric-lock. ✅
- **Router import**: `useRouter`, `usePathname` from `next/navigation` (not `next/router`); precedent in
  `plaid-oauth`, `sign-in`, `PlaidHandBack`, root `page.tsx`. ✅
- **iOS reachability**: extensionless deep-links fall back to app root (`lib/nav.ts`); these pages are
  soft-nav destinations only — accepted per spec Assumptions. ✅
