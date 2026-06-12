# Quickstart: Running the Web Test Suite

All commands run from `web/`. No build, no dev server, no network required.

## Run everything

```bash
cd web
npm test            # vitest run — all node + jsdom suites, one shot
```

Expected: all suites pass (existing mortgage/insights parity + the new logic, store, and
component suites), completing in well under ~30s.

## Watch mode (local TDD loop)

```bash
npm test -- --watch          # re-run on change
npm test -- format.test.ts   # focus a single suite
```

## Coverage

```bash
npm run test:coverage        # vitest run --coverage (v8)
```

Expected: a coverage table; `lib/` business-logic modules
(`finance/**`, `format.ts`, `categories.ts`, `api/**`) meet the configured threshold
(~90%). The run fails if those drop below threshold.

## Typecheck (always pair with tests)

```bash
npx tsc --noEmit
```

## What proves the spec is satisfied

- **SC-001/SC-005**: `npm test` finishes fast with no network (Supabase is mocked).
- **SC-002**: `npm run test:coverage` shows `lib/` at/above threshold.
- **SC-003**: revert any covered behavior (e.g. flip a sign in `formatMoney`, change the
  accordion default-open rule) → a named test fails.
- **SC-004**: re-run `npm test` repeatedly / on a machine in another timezone → identical
  results (reference dates are pinned; no real-clock assertions).
- **SC-006**: `DatePicker.test.tsx`, `transactions-accordion.test.tsx`, `nav.test.tsx`,
  `tx-form-validation.test.tsx` each exercise core interaction via accessible queries.
- **SC-007**: `mortgage.parity.test.ts` + `insights.parity.test.ts` remain green.

## Guardrails

- Do **not** run `next build` / `next dev` or delete `web/.next` (a shared dev server may
  be running). Validation is `tsc --noEmit` + `npm test` only.
