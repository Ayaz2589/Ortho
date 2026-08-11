# Quickstart & Validation: Financial Routines

Automated tests are the source of truth (Constitution VI); manual steps confirm calm cross-canvas
presentation and the device-permission paths a headless suite can't fully exercise.

## Prerequisites

- `cd web && npm install` (installs the new `@capacitor/geolocation` dependency).
- Supabase migration `20260811120000_financial_routines.sql` applied locally
  (`supabase db reset` or the CLI's migrate-up, per `docs/supabase.md`).
- A household with ≥ 3 months of transaction history including: one same-merchant/same-amount
  monthly charge (recurring_charge candidate), a few weekday same-time entries at one merchant
  (behavioral_habit candidate — must be manual/receipt entries, not imported), and at least one
  imported (no-time-of-day) transaction.

## Automated validation

```bash
cd web && npx tsc --noEmit   # run UNPIPED — must be clean
cd web && npm test           # full suite green
```

Feature-focused runs while iterating:

```bash
cd web && npx vitest run test/finance/routines.test.ts
cd web && npx vitest run test/finance/routines-thresholds.test.ts
cd web && npx vitest run test/financial-health.test.ts        # extended for routine_awareness
cd web && npx vitest run test/store/routines.test.tsx
cd web && npx vitest run test/widgets/routines.test.tsx
cd web && npx vitest run test/widgets/financial-health.test.tsx
cd web && npx vitest run test/web/tx-form-auto-categorize.test.tsx
cd web && npx vitest run test/location                        # consent + capture + geocoding probe
cd web && npx vitest run test/i18n
```

Regenerated regression vectors are NOT expected — `routines.ts` and `financialHealth.ts`'s new
dimension are unit/property-pinned only (research.md §3); `npm run gen:vectors` should produce no
diff.

## Manual validation (in-browser)

> No browser in a Linux sandbox — do these on a real device/desktop before merge.

**Story 1 — recurring-charge routines:**
1. Open the Routines view (new) with the seeded 3-month recurring charge → confirm it's listed with
   its cadence and typical amount.
2. Confirm a household with only 1–2 occurrences of a similar-looking charge shows nothing for it.
3. Dismiss a routine → reload → confirm it stays gone.
4. Rename a routine → confirm the custom label persists and displays instead of the merchant name.
5. Seed a subscription that stops recurring for 2+ expected cycles → confirm it now reads as lapsed,
   not active.

**Story 2 — behavioral habits:**
6. With several weeks of consistent weekday-morning manual entries at one merchant, confirm a
   "habit" routine appears distinct from Story 1's recurring charges.
7. Confirm bank-imported transactions never produce a behavioral routine, but still count toward
   recurring-charge detection.

**Story 3 — financial-health integration:**
8. Open the financial-health breakdown → confirm a sixth "Routine awareness" dimension appears
   alongside the existing five, and that it cites the specific routines contributing to it.
9. Dismiss a contributing routine → reload the health view → confirm that dimension's score and
   cited-routines list both update.
10. On a brand-new household with zero transaction history, confirm the dimension shows a calm
    "not enough history yet" state — not a low/red score — and the other five dimensions are
    unchanged from their spec 041 behavior.
11. In Settings → Financial profile, confirm a 6th weight control for "Routine awareness" appears
    alongside the existing five and changing it moves the composite score.

**Story 4 — location (device-dependent, best done in the Capacitor iOS shell + a desktop browser):**
12. Settings → Location: confirm the default is "Off" and no permission prompt has fired yet anywhere
    in the app.
13. Turn on "Geocoding" → confirm no device permission prompt appears (this tier needs none).
14. Turn on the deeper "Foreground capture" tier → confirm exactly one permission prompt (iOS "When
    In Use", or the browser's geolocation prompt on web) appears, with plain-language copy explaining
    what's collected.
15. Deny the prompt → confirm the app degrades calmly (no nagging, no broken state) — behaves like
    the `geocoding` tier.
16. Turn location back to "Off" → confirm any previously-captured visits are gone (check via a
    fresh load of the location settings page) within the same session.
17. Without a configured geocoding credential (the default in every environment except a
    fully-provisioned production deploy), confirm the location settings page shows a calm "Location
    enrichment isn't available yet" message rather than a broken toggle — this is the expected,
    tested state in this sandbox and in CI.

## Adding to the household later (reference)

- `routines.ts`'s `detectRoutines`/`applyRoutineStates` are pure and reusable — a future Purchase
  Advisor or anomaly-detection feature can call them directly, same precedent as `personSummary.ts`.
- The geocoding edge function is written against a swappable provider interface (see
  `contracts/location-and-geocoding.md`) — lighting up real geocoding later is an operator secret,
  not a code change.
