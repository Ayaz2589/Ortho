# Contract: Location consent, foreground capture, and merchant geocoding

Covers User Story 4 (FR-011–FR-015). Two independent, additive pieces — a household can use either,
neither, or both. Both are strictly opt-in and off by default (`user_location_consent.level = 'off'`
until the user acts).

## Consent levels

| level | what it enables | permission requested | new device data collected |
|---|---|---|---|
| `off` (default) | nothing | none | none |
| `geocoding` | `merchant_geocodes` may be populated/read for this household | none — device location is never touched at this level | none |
| `foreground_capture` | `geocoding` plus `user_routine_visits` opportunistic capture | iOS "When In Use" (via `@capacitor/geolocation`'s `requestPermissions`) | one-shot coordinate, only at natural app-foreground moments (research.md §1) |

Setting `level` is a single settings action (`web/app/(app)/settings/location/page.tsx`,
new). Moving **to** a non-`off` level sets `granted_at = now()`. Moving **to** `off` sets
`revoked_at = now()` and the client immediately: (a) stops any pending capture calls, (b) deletes all
of that user's `user_routine_visits` rows via a store call (FR-015 — "remove... within one app
session", SC-006). `merchant_geocodes` rows are a household-level cache and are **not** deleted on
one member's revoke (they're not that member's personal data and another member may still have
consent on).

## Foreground capture (`foreground_capture` level only)

`web/lib/location/captureVisit.ts` (new, thin — not a pure `lib/finance/` engine since it touches a
device API): on a qualifying app-foreground event (app open; entering the Routines view), if
`level === 'foreground_capture'` and the last capture was `>= captureMinIntervalMinutes` ago (default
30 — avoid capturing every re-focus), call `Geolocation.getCurrentPosition({ enableHighAccuracy: false })`
once and insert one `user_routine_visits` row. Silently no-ops on permission denial or API
unavailability (web browsers without geolocation, or a denied prompt) — never blocks or nags; a
denied/unavailable capture is functionally identical to the user never having opted in past
`geocoding` (US4 AC1's "zero location-related prompts... " spirit — after the *first* explicit
opt-in prompt, no further nagging).

## Merchant geocoding (`geocoding` level or above)

Server-side, credential-gated — follows the Plaid/SimpleFin pattern (research.md §7) exactly:

- New edge function `supabase/functions/geocode-merchant/index.ts`. Reads a
  `MAPS_GEOCODING_API_KEY`-shaped secret via the existing `requiredEnv()` helper
  (`supabase/functions/_shared/http.ts`); returns `not_configured` (mapped to HTTP 503, same as
  Plaid) when absent.
- A `probe` mode (mirroring `plaid-link-token`'s `mode === 'probe'`) lets the client ask "is
  geocoding configured?" without spending a real provider call —
  `web/lib/location/geocoding.ts`'s `checkGeocodingAvailable()`, same shape as
  `web/lib/aggregation.ts`'s `checkLinkingAvailable()`.
- Client-side `Availability = 'checking' | 'available' | 'unconfigured' | 'no-household'` state
  (identical enum shape to `LinkedBanks.tsx`), rendered as a calm "Location enrichment isn't
  available yet" message — never a broken/dead button — when `unconfigured`.
- When `available`: resolving a merchant name to a place is opportunistic and lazy — triggered when
  the Routines view renders a `recurring_charge` or `behavioral_habit` routine whose `merchantKey`
  has no `merchant_geocodes` row yet (or `resolved_at` is null), fire-and-forget, cached thereafter.
  Never blocks routine detection/display (geocoding is additive decoration, per FR-011's "all routine
  detection... MUST function fully" without it).
- No specific geocoding provider is contracted here — the edge function is written against a small
  internal interface (`geocode(merchantLabel: string): Promise<{ lat, lng, label } | null>`) so the
  actual provider (Apple Maps Server API per the grounding doc, or any equivalent) is swappable by
  implementing that interface once a real credential exists. **In this environment, no credential is
  available — the feature ships fully wired but reports `unconfigured`, which is the correct,
  honest, and tested state (research.md §7).**

## What this explicitly does NOT build (research.md §1)

True passive/background dwell detection (`CLVisit`-equivalent, "Always" location permission,
background suggestion of a routine before any transaction or app-open) is descoped for this spec.
`foreground_capture` is the full extent of location's "before/without a logged transaction" signal —
it can still surface a repeating-place pattern (US4 AC3) because captures accumulate across multiple
app-open sessions, just not in the background between them.

## Invariants

1. No row is ever written to `user_routine_visits` while `level !== 'foreground_capture'`.
2. No network call to the geocoding edge function happens while every household member's `level` is
   `'off'` (FR-011 — zero collection/use without opt-in).
3. Revoking (`level` → `'off'`) leaves zero `user_routine_visits` rows for that user afterward (test:
   insert rows, revoke, assert `select` returns empty).
4. Every location-derived UI surface (visit-pattern suggestion, geocoded pin) reads only from already
   -committed DB state — nothing renders directly off a live, uncommitted device API result — so a
   revoke mid-session can't leave a stale suggestion on screen after the deletion above runs.
