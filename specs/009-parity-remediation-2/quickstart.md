# Quickstart — Validating Part 2

## Build / test commands

```bash
# Web (use Node >= 20.19 || >= 22.12 — after US5, `nvm use` picks it up from .nvmrc)
cd web && npm test                 # Vitest — all suites incl. currency.parity + ownerOrdering
cd web && npm run gen:vectors      # regenerate shared/test-vectors/*.json after a logic change
cd web && npx tsc --noEmit         # typecheck

# iOS
cd iOS && xcodebuild test -scheme Ortho-iOS \
  -destination 'platform=iOS Simulator,id=C71B4B53-7775-48F4-A016-D0B051D6B937'
```

After any pure-logic change: `npm run gen:vectors`, then run **both** suites so a TS↔Swift divergence
surfaces.

## Per-story manual validation

**US1 — same money on both clients**
- *Owner ordering*: both suites pass the `ownerOrdering` vectors; `computeShares(amount,
  orderedOwnerIds(scrambled), even)` is identical on web and iOS. Manually: create a 3-owner even split of
  an odd amount on each client — the leftover cent lands on the same person.
- *Currency*: both suites pass `currency.json` across all 7 currencies; convert a foreign amount on each
  client → identical stored cents and display amount.
- *Atomic write*: `store.test.tsx` forces a shares-insert failure → the parent transaction does not survive
  locally and an error is surfaced (no "creator owns all").

**US2 — money locale + zero-decimal**
- Switch language (e.g. → `Español`/`日本語`) in web Settings → all money re-formats for that locale; reload
  → choice persists.
- Set display currency to JPY → amounts show correct yen magnitude (not ~100× too large), matching iOS.

**US3 — insight + mortgage**
- `insights.json` recurring scenario magnitude reflects the truncated average; the outlier scenario emits
  `outlier-<uuid>`; both suites pass.
- `mortgage.json` day-29–31 boundary cases: a loan closed Jan 31 viewed Feb 28 counts 1 month elapsed on
  both clients (web no longer undercounts to 0); balance/equity match.

**US4 — desktop capability**
- Web window ≥1024px with budgets set → dashboard shows the Budget Progress widget.
- Web window ≥1024px, a property whose lease renews soon → housing shows the lease-renewal banner.
- `desktop-parity.test.tsx` asserts both.

**US5 — sign-in copy + Node**
- Web sign-in screen states the 8-digit code length.
- `npm test` starts under the default/pinned Node with no `ERR_REQUIRE_ESM`.

## Definition of done

- `npm run gen:vectors` is a no-op diff (vectors committed in sync).
- Web `npm test` green under the pinned Node; iOS `xcodebuild test` green (incl. new
  `CurrencyParityTests` and the extended split/mortgage/insight assertions).
- A deliberate divergence introduced into `orderedOwnerIds`, `toDisplayAmount`, the recurring average, or
  `monthsElapsed` fails **both** suites (FR-013 drift check).
