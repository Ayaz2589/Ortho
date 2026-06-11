# Implementation Plan: Desktop Layout

**Branch**: `001-desktop-layout` | **Date**: 2026-06-11 | **Spec**: ./spec.md

**Input**: Feature specification from `specs/001-desktop-layout/spec.md`

## Summary

Add a responsive desktop shell to the existing Ortho web app without changing the
visual language or data layer. A single responsive frame swaps the bottom tab bar
for a left sidebar at ≥640px, caps and centers content at every width, and turns
Transactions and Housing into master–detail layouts at ≥1024px. Below 640px the
current mobile view is untouched. All styling uses existing tokens; the change is
layout + navigation + interaction states only.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16 (App Router, Turbopack)

**Primary Dependencies**: Tailwind v4, lucide-react, recharts, @supabase/ssr

**Storage**: Supabase (unchanged); client store in `lib/store.tsx`

**Testing**: `tsc --noEmit` typecheck + manual responsive review (no unit suite in repo)

**Target Platform**: Modern browsers, 360px → 3440px+ viewports

**Project Type**: Web app (single Next.js app at `Ortho-web/`)

**Performance Goals**: 60fps layout; no layout thrash on resize; CSS-driven breakpoints (no JS reflow) except a single media-query hook for master–detail behavior

**Constraints**: Tokens only; no new colors; borders ≤0.5px; no inset-card shadows; body ≥14px; light+dark correct; mobile <640px unchanged

**Scale/Scope**: 4 screens + sub-routes, ~12 existing component groups reused

## Constitution Check

*GATE: must pass before and after design.*

- **I. Tokens only** — PASS. New CSS uses `var(--*)` tokens + existing Tailwind
  color utilities; no hardcoded hex. Interaction states use `rgba(text,…)` and
  `var(--accent)` per the constitution.
- **II. Calm over dense** — PASS. Content is capped/centered; empty margins kept;
  no new charts; hero type may grow but body never shrinks. Sidebar uses a
  hairline divider, no shadow (it isn't floating).
- **III. Right form factor** — PASS. Bottom bar <640, sidebar ≥640, modals for
  create/edit, master–detail to avoid full-page nav.
- **IV. Voice & money** — PASS. No copy changes beyond a quiet "Select a
  transaction/property" prompt; tabular figures preserved.
- **V. Accessible & interaction-complete** — PASS. Semantic `<nav>`, `aria-current`,
  focus-visible ring, hover/active, reduced-motion, ≥40px targets.

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-desktop-layout/
├── spec.md        # complete
├── plan.md        # this file
└── tasks.md       # /speckit-tasks output
```

### Source Code (repository root: `Ortho-web/`)

```text
Ortho-web/
├── app/
│   ├── globals.css                 # + focus-visible ring, reduced-motion, hover helpers
│   └── (app)/
│       ├── layout.tsx              # REWRITE: responsive frame (sidebar + scroll main)
│       ├── dashboard/page.tsx      # wrap in capped grid
│       ├── transactions/page.tsx   # master–detail at lg
│       ├── housing/page.tsx        # master–detail at lg
│       ├── budgets/page.tsx        # reading column
│       └── settings/…              # reading column
├── components/
│   ├── Sidebar.tsx                 # NEW: responsive left nav (rail/full)
│   ├── TabBar.tsx                  # show only <640 (sm:hidden)
│   ├── layout.tsx                  # NEW: ReadingColumn, DashboardGrid, MasterDetail, DetailEmpty
│   ├── transactions/
│   │   ├── TransactionDetail.tsx   # NEW: detail content extracted from the modal
│   │   └── TransactionDetailModal.tsx  # reuse TransactionDetail inside the Modal
│   └── housing/ (PropertyContent reused as the detail pane)
└── lib/
    └── useMediaQuery.ts            # NEW: tiny breakpoint hook (SSR-safe)
```

**Structure Decision**: Single Next.js app; additive layout layer. The frame is
CSS-responsive; one `useMediaQuery('(min-width:1024px)')` hook decides whether
Transactions/Housing open detail in a pane (desktop) or a modal (mobile). Detail
content is extracted from the existing modals so both paths share one component.

## Phasing

- **Phase A (P1 — MVP)**: responsive frame + Sidebar + TabBar gating + width caps
  (reading/dashboard grid) + global interaction states. Delivers Stories 1, 2, 4.
- **Phase B (P2)**: master–detail for Transactions and Housing (Story 3), reusing
  extracted detail components and the media-query hook.

## Risks & Mitigations

- **Master–detail refactor touching modals** → extract a pure `TransactionDetail`
  used by both the modal and the pane; no behavior change on mobile.
- **SSR/hydration of the media-query hook** → default to `false` (mobile) on the
  server, update on mount; panes are progressive enhancement, never required.
- **Shared `.next` cache corruption** (prior incident) → verify with `tsc` only;
  do not run `next build`/`dev` or delete `.next` while the user's dev server runs.
- **Mobile regression** → all desktop rules are behind `sm:`/`lg:` prefixes; base
  styles (the mobile view) are left intact.

## Complexity Tracking

No constitution violations — none.
