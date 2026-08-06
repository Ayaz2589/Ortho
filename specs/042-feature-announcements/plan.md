# Implementation Plan: Feature-Announcement Popup

**Branch**: `feat/042-feature-announcements` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/042-feature-announcements/spec.md`

## Summary

A reusable "what's new" popup notifies signed-in users of newly shipped features on their next visit. A
code-level **announcement registry** declares each feature's `id`, title, description, and CTA (label +
route). A small **seen-ledger** helper (localStorage per-device, mirroring `textSize.ts`) records which
announcements a device has seen. A single **AnnouncementHost** component, mounted once in the app Shell,
picks the next unseen (and still-relevant) announcement and renders it through the existing shared
`Drawer` — a right slide-out on desktop, a full-page takeover on mobile. Taking the CTA marks it seen and
navigates; dismissing marks it seen without navigating.

The first adopter is spec 041 Financial Health: its announcement CTA opens `/welcome/financial-profile`.
This **replaces** `FinancialHealthOnboardingGate`'s hard `router.replace` — profile-less users are no
longer force-redirected. The questionnaire's **Skip becomes dismiss-only** (no more misleading zero-income
neutral-defaults write); the dashboard widget already shows its neutral "Set up your financial profile"
prompt when the profile is null, so an honest empty state falls out for free.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Next.js (App Router, vendored — see `web/AGENTS.md`)

**Primary Dependencies**: Existing shared `Drawer`/`DrawerHeader` (`web/components/web/Drawer.tsx`), the app
store `useApp()` (`web/lib/store.tsx`), `next/navigation` router, the i18n catalogs (`web/lib/i18n/`).

**Storage**: Browser `localStorage` only (per-device seen ledger). No database, no migration, no new tables.

**Testing**: Vitest + Testing Library (`web/test/`), jsdom for component tests. TDD (Constitution VI).

**Target Platform**: Web (compact → expanded) + the Capacitor-wrapped iOS shell (same bundle).

**Project Type**: Web application (single `web/` codebase).

**Performance Goals**: No measurable impact — the host renders nothing until an unseen+relevant announcement
exists; one synchronous localStorage read on mount.

**Constraints**: Calm design (Constitution I/II/IV): token-only, never red, no shimmer, plainspoken copy.
Fail-safe when storage is unavailable (never throw, never block the app). i18n across all 5 catalogs.

**Scale/Scope**: One reusable component + one helper + one registry + one seeded announcement; edits to the
Shell, the welcome page (Skip), and removal of the onboarding gate. ~1 new i18n key group (3–4 strings).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. One Design System, Tokens Only** — PASS. Reuses `Drawer`/`DrawerHeader` and existing tokens
  (`--accent`, `--text`, `--hairline`); no new colors, no red. CTA uses the existing `PrimaryButton`.
- **II. Calm Over Dense (NON-NEGOTIABLE)** — PASS. A single, dismissible, hairline-framed panel; no
  gradients/emoji/shimmer. Shows one announcement at a time; dismiss persists and never re-nags.
- **III. Right Form Factor Per Canvas** — PASS. Desktop = right drawer + scrim; mobile = full-page takeover
  (`Drawer fullBleedOnMobile`). Focus-trapped, Escape-closable, scroll-locked (already in `Drawer`).
- **IV. Plainspoken Voice & Money Formatting** — PASS. Second-person "what's new" copy; no money figures in
  the popup itself, so no formatting concerns. Copy is calm and non-alarmist.
- **V. Accessible & Interaction-Complete** — PASS. `Drawer` renders `role="dialog" aria-modal`; CTA and
  close are real `<button>`s with labels and the sand focus ring; hit targets ≥ 40px.
- **VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE)** — PASS. Pure ledger + registry helpers are unit
  tested first; the host and the Skip change are behavior-tested (rendering, seen-persistence, navigation,
  no-write); an i18n test guards the new keys across 5 catalogs. No money/date math introduced.

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/042-feature-announcements/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 — decisions
├── data-model.md        # Phase 1 — entities (Announcement, seen ledger)
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   └── announcements.md # Phase 1 — module/UI contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
web/
├── components/
│   └── announcements/
│       ├── registry.ts              # NEW — Announcement type + ANNOUNCEMENTS list (seeded with FH)
│       ├── announcementsSeen.ts      # NEW — localStorage seen-ledger helper (mirrors textSize.ts)
│       └── AnnouncementHost.tsx      # NEW — picks next unseen+relevant, renders via Drawer
│   ├── financial-health/
│   │   └── onboardingGate.tsx        # REMOVED — replaced by AnnouncementHost
│   └── web/Drawer.tsx                # reused (no change)
├── app/(app)/
│   ├── layout.tsx                    # EDIT — mount <AnnouncementHost/> in place of the gate
│   └── welcome/financial-profile/
│       └── page.tsx                  # EDIT — Skip becomes dismiss-only (no submit / no dismiss key)
└── lib/i18n/{index,bn,es,ja,zh,ko}.ts # EDIT — add announcement strings (English key + 5 translations)

web/test/
├── announcements/
│   ├── announcementsSeen.test.ts      # NEW — ledger read/write/fail-safe/next-unseen
│   ├── registry.test.ts               # NEW — FH entry shape + isRelevant predicate
│   └── AnnouncementHost.test.tsx      # NEW — show/hide/CTA/dismiss behavior
├── financial-health-onboarding.test.tsx # EDIT — Skip no longer writes; is dismiss-only
└── i18n/announcements-i18n.test.ts    # NEW — new keys present across 5 catalogs
```

**Structure Decision**: A new `web/components/announcements/` module holds the reusable pieces (registry,
seen-ledger, host), keeping the pattern feature-agnostic and discoverable for the next feature that adopts
it. Financial-health-specific coupling is confined to a single registry entry (with an optional
`isRelevant` predicate) — the host and ledger know nothing about financial profiles.

## Complexity Tracking

No constitution violations — section intentionally empty.
</content>
