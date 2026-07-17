# Implementation Plan: Mobile new/edit flows as dedicated pages

**Branch**: `025-mobile-form-pages` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/025-mobile-form-pages/spec.md`

## Summary

On viewports `< 1024px` the new/edit **transaction** and new/edit **property** forms move from
floating overlays (a centered `WebModal` for transactions; a right-side `Drawer` for housing) to
**dedicated full-screen pages** the app soft-navigates to. On `≥ 1024px` nothing changes — the
existing in-place tray (`TransactionsDesktop`'s `ow-drawer`) and housing `Drawer` (via
`AddPropertyModal`) are untouched. The pages reuse the exact same form logic (transactions:
`useTxForm` + `TxFormBody`; housing: a newly-extracted `PropertyForm` body shared by both the
desktop `Drawer` and the mobile page), inherit the ambient `useApp()` store (the provider is
mounted once in `app/(app)/layout.tsx`), and encode transient intent (edit id, copy source,
settle-up prefill, chosen kind) in **query params on static routes** because `output: 'export'`
forbids `[id]` dynamic routes and intercepting/parallel routes. Entry points branch on
`useIsExpanded()`: desktop keeps today's `setState` (tray), mobile does `router.push`.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2, Next.js 16.2 (App Router, `output: 'export'` static export)

**Primary Dependencies**: Next.js App Router (`next/navigation`), the existing `useApp()` store
(`web/lib/store.tsx`), `useIsExpanded()` (`web/lib/useMediaQuery.ts`), the transaction form engine
(`web/components/web/TxForm.tsx`), the housing form (`web/components/housing/AddPropertyModal.tsx`).

**Storage**: N/A for this feature — no schema/migration/store change. Data is the existing Supabase-backed
in-memory store; money stays USD cents, converted at render (unchanged).

**Testing**: vitest 4 + @testing-library/react (jsdom opted-in per file via `// @vitest-environment jsdom`),
`test/setup.ts` stubs `window.matchMedia`. Router mocked via `vi.mock('next/navigation')`; breakpoint
mocked via `vi.mock('@/lib/useMediaQuery')`. Run: `npm test` in `web/`; typecheck `npx tsc --noEmit`.

**Target Platform**: Static-exported web bundle served on desktop/mobile browsers and wrapped by Capacitor
for iOS (extensionless deep-links fall back to the app root → pages are soft-nav destinations only).

**Project Type**: Web application (single Next.js app under `web/`).

**Performance Goals**: No regression. Mobile bundles MUST NOT gain the desktop tray code (bundle-split
guard `test/web/form-factor-split.test.ts` stays green); pages are code-split by route automatically.

**Constraints**:
- `output: 'export'` ⇒ **no** `[id]` dynamic routes for runtime UUIDs, **no** intercepting/parallel
  routes. Use static routes + query params resolved client-side.
- Query params are read via `new URLSearchParams(window.location.search)` in a mount `useEffect`
  (state starts `undefined` until read), following the `plaid-oauth` precedent — **not** `useSearchParams()`.
  This avoids the static-export `<Suspense>`/"deopted into client-side rendering" requirement entirely and
  matches the codebase (which has zero `useSearchParams()` usages). See research D2.
- Three breakpoints (compact 0–639, medium 640–1023, expanded 1024+). "Mobile page" applies to `< 1024px`
  (`!useIsExpanded()`), matching the current content split; desktop `≥ 1024px` stays on the tray.
- Desktop code paths (`TransactionsDesktop.tsx`, `HousingDesktop.tsx`, `WebModal`, `Drawer` desktop behavior)
  are not modified.

**Scale/Scope**: 4 new route pages, 1 extracted housing form component, 1 form-factor nav helper, ~6 entry-point
call-site edits, and their tests. No backend, no store, no data-model change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. One Design System, Tokens Only** — PASS. New page chrome uses existing tokens/components
  (`PageHeader`-style header, `text-accent`, hairlines, `var(--chip-bg)`); no new colors/sizes/shadows.
- **II. Calm Over Dense** — PASS. Full-screen mobile form is *more* room to breathe, not denser; no
  gradients/emoji/status colors added.
- **III. Right Form Factor Per Canvas** — PASS and directly advanced. Full-screen push pages are the
  native-appropriate compact/iOS affordance; desktop keeps its right drawer/tray. Safe-area/keyboard
  behavior inherited from the existing Shell and form fields.
- **IV. Plainspoken Voice & Money Formatting** — PASS. Reuses existing copy and money formatting via the
  shared form bodies; no new strings beyond a page title/back label routed through `t()`.
- **V. Accessible & Interaction-Complete** — PASS. Pages use semantic `<header>`/`<button>`, keyboard-order
  back + Save, visible focus ring; hit targets ≥44px (reuse existing controls). No focus-trap needed (a real
  page, not a modal) — back/Save are normal in-flow controls.
- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — PASS by construction. Every new page/behavior is
  written test-first; money/split/date logic is untouched (still locked by existing `useTxForm`/property
  tests); no store mutation changes. `npm test` gates.

**Result**: No violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/025-mobile-form-pages/
├── plan.md              # This file
├── research.md          # Phase 0 output — routing/searchParams/Suspense/nav decisions
├── data-model.md        # Phase 1 output — no new entities; URL-intent contracts
├── quickstart.md        # Phase 1 output — how to validate (tests + manual)
├── contracts/
│   └── routes.md        # URL/route + query-param contract for the 4 pages
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
web/
├── app/(app)/
│   ├── transactions/
│   │   ├── page.tsx                    # MODIFY: entry points branch on useIsExpanded()
│   │   ├── new/page.tsx                # NEW: mobile add-transaction page (Suspense → client form)
│   │   └── edit/page.tsx               # NEW: mobile edit-transaction page (?id=)
│   └── housing/
│       ├── page.tsx                    # MODIFY: add/edit triggers branch on useIsExpanded()
│       ├── new/page.tsx                # NEW: mobile add-property page (kind step in-page)
│       └── edit/page.tsx               # NEW: mobile edit-property page (?id=)
├── components/
│   ├── web/
│   │   ├── TxForm.tsx                  # UNCHANGED logic; reused by pages (useTxForm/TxFormBody)
│   │   ├── TxModalWeb.tsx              # UNCHANGED (desktop-adjacent mobile modal stays for ≥? — see note)
│   │   ├── TransactionsDesktop.tsx     # DO NOT TOUCH
│   │   ├── TxFormPageClient.tsx        # NEW: mobile page chrome around useTxForm + TxFormBody
│   │   └── FormPageHeader.tsx          # NEW (optional): shared mobile page header (back + title + Save)
│   ├── transactions/
│   │   └── TransactionDetailModal.tsx  # MODIFY: Edit button navigates on mobile
│   └── housing/
│       ├── AddPropertyModal.tsx        # MODIFY: keep Drawer, render extracted <PropertyForm> inside
│       ├── PropertyForm.tsx            # NEW: extracted form body (state/seed/submit moved verbatim)
│       ├── PropertyFormPageClient.tsx  # NEW: mobile page chrome (kind step + <PropertyForm>)
│       └── HousingDesktop.tsx          # DO NOT TOUCH
└── lib/
    └── useFormFactorNav.ts             # NEW: helper — isExpanded ? inPlace() : router.push(url)
```

**Structure Decision**: Single Next.js web app under `web/`. New leaf routes are added as siblings under
the existing `(app)/transactions` and `(app)/housing` segments so they inherit `AppStateProvider` +
auth/paywall/lock Shell from `app/(app)/layout.tsx` with zero extra wiring. Presentation is chosen by the
existing `useIsExpanded()` gate — the page components self-guard (redirect on desktop), and the entry
points branch push-vs-setState — so desktop trees stay entirely unmodified.

> Note on `TxModalWeb`: today the *mobile* new/edit transaction is `TxModalWeb`→`WebModal`. Once the mobile
> path routes to a page, `TxModalWeb` is only reached from the desktop-adjacent detail edit path; keep it as
> the desktop/detail modal (unchanged) to avoid touching desktop behavior. The mobile entry points stop
> mounting it and navigate instead. (Confirm in Phase 1 that no desktop path regresses.)

## Complexity Tracking

*No constitution violations — section intentionally empty.*
