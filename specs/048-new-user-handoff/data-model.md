# Phase 1 Data Model: New-User Hand-Off to Financial Health

**Feature**: `specs/048-new-user-handoff/` | **Date**: 2026-08-15

**There is no database change and no migration in this feature** (FR-010). Nothing is created,
altered, or dropped in Supabase; no RLS policy is touched. The only state this feature reads or
writes already exists, and all of it is per-device `localStorage`.

This document therefore describes the three state items the hand-off *consumes*, their existing
owners, and precisely how this feature changes their lifecycle.

---

## State inventory

| Item | Storage | Owner (shipped by) | This feature |
|---|---|---|---|
| Funnel marker | `localStorage` `ortho.onboardingFunnel` | spec 045, `lib/onboarding/funnel.ts` | **First reader.** Reads it, then clears it. |
| Announcement seen-ledger | `localStorage` `ortho.announcementsSeen` | spec 042, `components/announcements/announcementsSeen.ts` | Adds one id (`financial-health`) at hand-off time. |
| Financial profile | Supabase `user_financial_profile`, surfaced as `useApp().userFinancialProfile` | spec 041 | **Read only.** Never written by this feature. |

---

## 1. Funnel marker (existing — `ortho.onboardingFunnel`)

A single presence bit. No identifier, no timestamp, no locale, no path (045 FR-018). Any value other
than exactly `'1'` reads as absent, so a key collision or truncated write can never manufacture a
hand-off.

**Lifecycle across the funnel** — this feature closes it:

```text
  spec 047 (tour)      markFunnelEntry()      ← final slide's CTA and its Skip
        ↓
     sign-in           (no read — the form is unchanged until verify succeeds)
        ↓
  spec 048 (this)      readFunnelEntry()      → true  → hand-off route
                       clearFunnelEntry()     → the marker is consumed, exactly once
```

**Transitions this feature introduces**:

| From | Trigger | To | Consequence |
|---|---|---|---|
| present | successful OTP verify | absent | hand-off fires; route = questionnaire |
| absent | successful OTP verify | absent | no hand-off; route = `/dashboard` (today's behavior) |
| unreadable (storage disabled) | successful OTP verify | unreadable | reads `false`; route = `/dashboard` (FR-003, fail-safe) |

**Clearing is what makes FR-009 hold.** The marker carries no identity, so "did *this* user set it?"
cannot be asked. Consuming it on use means the sign-out → different-user-signs-in case named in the
spec's Edge Cases has no marker left to misfire on. See research.md §5 for the one residual case
(an abandoned funnel on a shared device) and why it is accepted.

## 2. Announcement seen-ledger (existing — `ortho.announcementsSeen`)

A JSON array of announcement ids. This feature appends `'financial-health'` when — and only when —
the hand-off fires, satisfying FR-006 without introducing any new storage concept.

**Invariant preserved**: the ledger stays feature-agnostic. The registry gains a named export for the
id it already contained; it gains no knowledge of the funnel, so 042's SC-005 ("adding a future
announcement requires only a registry entry plus catalog strings") still holds.

**Idempotent and fail-safe** by construction — `markAnnouncementSeen` no-ops on a duplicate id and
swallows storage errors. If storage is unavailable, the marker was unreadable too, so no hand-off
fired and there is nothing to suppress.

## 3. Financial profile (existing — read only)

`useApp().userFinancialProfile` is `FinancialProfile | null`. The questionnaire's entry guard is its
only new consumer.

**Null is unambiguous at the guard's mount.** `app/(app)/layout.tsx:157` renders a skeleton while
`loading` and mounts `children` only after it resolves, so the questionnaire never observes a
"not loaded yet" null. The guard reads `loading` anyway, so it degrades safely if that gate moves.

**FR-007 restated as a data invariant**: declining the questionnaire writes **no row**. The zero-income
neutral-defaults write that spec 041 performed on Skip was deleted by spec 042 and is not coming
back; the widget's `hasProfile === false` branch is the honest surface for that state (FR-008).

---

## Derived value: the post-sign-in route

Not persisted anywhere — computed once per successful verify and consumed immediately by
`router.replace()`.

```text
resolvePostSignInRoute() =
    readFunnelEntry() === true
      → clearFunnelEntry(); markAnnouncementSeen('financial-health'); '/welcome/financial-profile'
      → otherwise                                                     '/dashboard'
```

Side effects run **before** the return value is used to navigate, so a browser Back into `/sign-in`
finds a consumed marker and cannot re-fire the hand-off (FR-002, SC-003).

---

## What this feature does NOT add

Stated explicitly because the spec's scope depends on it:

- No table, column, index, RLS policy, or migration file.
- No new `localStorage` key — both keys already exist and both are already guarded.
- No server state, so no cross-device behavior. A visitor who walks the funnel on a phone and signs
  in on a laptop gets the announcement, not the hand-off — accepted in the spec's Assumptions.
- No new runtime dependency (FR-010).
