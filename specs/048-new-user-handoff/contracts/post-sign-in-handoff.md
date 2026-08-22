# Contract: Post-Sign-In Hand-Off

**Module**: `web/lib/onboarding/handoff.ts` (new)

**Consumer**: `web/app/sign-in/page.tsx` — `verify()`, the successful-OTP path only.

**Requirements covered**: FR-001, FR-002, FR-003, FR-006, FR-009.

---

## Surface

```ts
/** Where a user goes when the funnel hand-off does not apply — today's behavior. */
export const DEFAULT_POST_SIGN_IN_ROUTE = '/dashboard'

/** Where a funnel newcomer is handed off to. */
export const HANDOFF_ROUTE = '/welcome/financial-profile'

/**
 * Decide where a just-signed-in user goes, consuming the funnel marker if present.
 * Call exactly once per successful sign-in, before navigating.
 */
export function resolvePostSignInRoute(): string
```

And, from `web/components/announcements/registry.ts` (modified — one added export):

```ts
/** Stable id of the Financial Health announcement; also its seen-ledger key. */
export const FINANCIAL_HEALTH_ANNOUNCEMENT_ID = 'financial-health'
```

The existing registry entry must use this constant for its `id`, so the string has one definition.
`web/test/announcements/registry.test.ts` asserts the id is `'financial-health'` and must keep
passing untouched.

## Behavior

| Precondition | Return | Side effects |
|---|---|---|
| `readFunnelEntry() === true` | `HANDOFF_ROUTE` | `clearFunnelEntry()`; `markAnnouncementSeen(FINANCIAL_HEALTH_ANNOUNCEMENT_ID)` |
| `readFunnelEntry() === false` | `DEFAULT_POST_SIGN_IN_ROUTE` | **none** |
| `localStorage` throws or is absent | `DEFAULT_POST_SIGN_IN_ROUTE` | none (`readFunnelEntry` already returns `false` on throw) |

### Guarantees

1. **Exactly once** — the marker is consumed before the caller navigates, so re-entering `/sign-in`
   (Back button, a second verify) cannot re-fire the hand-off. (FR-002, SC-003)
2. **No side effects on the default path** — when no marker is present, nothing is written. In
   particular the announcement is **not** marked seen, so a non-funnel user's "what's new" popup is
   untouched. (FR-003, FR-005, SC-002)
3. **Never throws** — every storage access is inside the already-guarded helpers. A sign-in must
   never fail because storage is disabled.
4. **Order** — clear-then-mark-then-return. Both writes complete before navigation.

## Caller contract

`verify()` changes from a hardcoded destination to the resolved one. Everything else about the
function — the `verifyOtp` call, its error handling, the `router.refresh()` that follows — is
unchanged:

```ts
// before
router.replace('/dashboard')
router.refresh()

// after
router.replace(resolvePostSignInRoute())
router.refresh()
```

### Explicitly out of scope for this contract

- **The already-signed-in mount bounce** (`sign-in/page.tsx:36–49`) keeps calling
  `router.replace('/dashboard')` literally. It fires for a user who already had a session, who is by
  definition not a newcomer; routing it through the hand-off would let a stale marker greet a
  returning user. (research.md §2, FR-009)
- **Reading the financial profile.** Not possible here — the sign-in page renders outside
  `AppStateProvider`. That check is the entry guard's job; see
  [questionnaire-entry-guard.md](./questionnaire-entry-guard.md).

## Test expectations

`web/test/onboarding/handoff.test.ts`

- marker present → returns `HANDOFF_ROUTE`
- marker present → `readFunnelEntry()` is `false` afterwards
- marker present → `hasSeenAnnouncement('financial-health')` is `true` afterwards
- marker absent → returns `DEFAULT_POST_SIGN_IN_ROUTE`
- marker absent → announcement is **not** marked seen, marker still absent
- called twice with a marker → second call returns `DEFAULT_POST_SIGN_IN_ROUTE`
- storage throwing on read → returns `DEFAULT_POST_SIGN_IN_ROUTE`, does not throw

`web/test/onboarding/sign-in-handoff.test.tsx`

- full OTP flow with the marker set → `router.replace('/welcome/financial-profile')`
- full OTP flow with no marker → `router.replace('/dashboard')` (duplicates the guarantee in
  `test/sign-in.test.tsx` deliberately: that file is the untouched 042-era regression lock, this one
  states the same fact as a *hand-off* requirement)
- the mount bounce with a marker set and a live session → `router.replace('/dashboard')`
