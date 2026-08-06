# Contracts: Feature-Announcement Popup

This feature exposes no network/API surface. Its contracts are the internal module APIs and the UI/behavior
contract of the popup. These are the observable behaviors the tests assert (Constitution VI).

## Module: `web/components/announcements/announcementsSeen.ts`

| Function | Signature | Contract |
| --- | --- | --- |
| `readSeenAnnouncements` | `() => string[]` | Returns the seen ids. Missing key ⇒ `[]`. Malformed JSON or unavailable storage ⇒ `[]`. Never throws. |
| `hasSeenAnnouncement` | `(id: string) => boolean` | `true` iff `id` ∈ `readSeenAnnouncements()`. |
| `markAnnouncementSeen` | `(id: string) => void` | Appends `id` to the ledger (idempotent — no duplicates). Best-effort: a throwing/absent store is swallowed. |
| `nextUnseenAnnouncement` | `(list: Announcement[], ctx: AnnouncementContext) => Announcement \| null` | The first entry in `list` that is unseen **and** (`isRelevant` absent or `isRelevant(ctx) === true`). `null` if none. |

**Invariants**: pure w.r.t. its inputs + `localStorage`; deterministic given storage state; never mutates
`list`; order-preserving (returns the earliest qualifying entry).

## Module: `web/components/announcements/registry.ts`

- Exports the `Announcement` and `AnnouncementContext` types and the `ANNOUNCEMENTS` array.
- **Contract**: ids are unique; every copy key resolves in all catalogs; the `financial-health` entry routes
  to `/welcome/financial-profile` and is relevant only when `userFinancialProfile == null`.

## Component: `web/components/announcements/AnnouncementHost.tsx`

Mounted once in the app Shell. Renders nothing except when an announcement should show.

**Behavior contract** (asserted by `AnnouncementHost.test.tsx`):

1. **Hidden while not ready**: renders nothing when `loading` is true or `currentUserId` is falsy.
2. **Hidden when nothing to show**: renders nothing when `nextUnseenAnnouncement(...)` is `null` (all seen,
   or none relevant).
3. **Shows next unseen+relevant**: when one exists, renders a `role="dialog"` (via `Drawer`) containing the
   generic `What's new` header, the announcement's translated title + description, and a CTA button labelled
   from `cta.labelKey`.
4. **CTA**: clicking the CTA calls `markAnnouncementSeen(id)` then `router.push(cta.route)`. After this the
   announcement is seen (would not re-show).
5. **Dismiss**: the close chip, scrim click, or Escape calls `markAnnouncementSeen(id)` and closes **without**
   navigating.
6. **Once per device**: after a CTA or dismiss, re-rendering the host (fresh mount) shows nothing for that id.
7. **Relevance**: given the `financial-health` entry, the host shows it when `userFinancialProfile == null`
   and hides it when a profile is present (even if unseen).

## UI contract: `welcome/financial-profile/page.tsx` (Skip change)

Asserted by the updated `financial-health-onboarding.test.tsx`:

1. **Skip is dismiss-only**: clicking `Skip` does **not** call `saveFinancialHealth` (no profile written) and
   navigates to `/dashboard`.
2. **Skip writes no dismissal key**: `localStorage` gains no `ortho.fhOnboardingDismissed` entry (that key is
   retired with the gate).
3. **Completion unchanged**: the primary "See my score" path still requires a valid income and still calls
   `saveFinancialHealth` once with the real profile + a band.

## Shell contract: `app/(app)/layout.tsx`

- `FinancialHealthOnboardingGate` is removed (import + mount); `AnnouncementHost` is mounted in its place.
- **No auto-redirect**: mounting the Shell for a signed-in, profile-less user does not call
  `router.replace('/welcome/financial-profile')` (the forced redirect is gone — FR-011).

## i18n contract: `test/i18n/announcements-i18n.test.ts`

- Every new key (`What's new`, the FH title/description/CTA-label keys) is present in all five catalogs
  (bn/es/ja/zh/ko) with matching `{n}` placeholder arity. English is the identity key.
</content>
