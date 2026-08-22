# Quickstart & Validation: Feature-Announcement Popup

How to validate the feature end-to-end. Automated tests are the source of truth (Constitution VI); the
manual steps confirm the calm cross-canvas presentation a headless suite can't screenshot.

## Prerequisites

- `cd web && npm install` (already installed in this repo).
- A signed-in session (any user). For the Financial Health announcement to appear, the user must have **no**
  financial profile yet (`userFinancialProfile == null`).

## Automated validation

Run the whole suite (the constitution gate):

```bash
cd web && npx tsc --noEmit   # run UNPIPED — must be clean
cd web && npm test           # full suite green
```

Feature-focused runs while iterating:

```bash
cd web && npx vitest run test/announcements/announcementsSeen.test.ts
cd web && npx vitest run test/announcements/registry.test.ts
cd web && npx vitest run test/announcements/AnnouncementHost.test.tsx
cd web && npx vitest run test/financial-health-onboarding.test.tsx
cd web && npx vitest run test/i18n/announcements-i18n.test.ts
```

Expected: all green. The onboarding test now asserts Skip is **dismiss-only** (no `saveFinancialHealth`
call, no dismissal key) and the host tests assert show/hide/CTA/dismiss + once-per-device persistence.

## Manual validation (in-browser — calm/cross-canvas confirm)

> No browser exists in a Linux sandbox; do these on a real device/desktop before merge.

1. **Existing user, no redirect**: sign in as a user with no financial profile who has never seen the
   announcement. **Expect**: you land on the dashboard normally — you are NOT auto-navigated to the
   questionnaire. The "what's new" popup appears.
2. **Desktop surface**: at a desktop width the popup is the right slide-out drawer with a dimmed scrim;
   Escape and a scrim click both close it.
3. **Mobile surface**: at a phone width the popup is a full-page takeover with a visible close (X) control.
4. **CTA**: click "Set up financial health" → you arrive at `/welcome/financial-profile`. Reload the app →
   the popup does NOT reappear.
5. **Dismiss path**: reset (clear `localStorage` key `ortho.announcementsSeen`), reopen, and dismiss instead
   of taking the CTA → popup closes, no navigation, and it does NOT reappear on reload.
6. **Skip is honest**: from the questionnaire choose "Skip" → you return to the dashboard and the Financial
   Health widget shows "Set up your financial profile" (no score computed from a zero-income profile).
7. **Already-set-up user**: as a user who already has a profile, confirm the FH announcement does NOT appear
   (relevance predicate), even if the ledger is cleared.

## Reset for repeat testing

```js
// In the browser console:
localStorage.removeItem('ortho.announcementsSeen')
```

Clearing the key returns every announcement to "unseen" on the next load.

## Adding a future announcement (proves reusability — SC-005)

1. Append one entry to `ANNOUNCEMENTS` in `web/components/announcements/registry.ts` with a fresh `id`,
   `titleKey`, `descriptionKey`, and `cta`.
2. Add the three/four new copy keys to `lib/i18n/index.ts` + all five catalogs.
3. No changes to `AnnouncementHost` or `announcementsSeen` are needed.
</content>
