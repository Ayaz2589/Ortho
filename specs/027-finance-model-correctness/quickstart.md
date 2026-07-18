# Quickstart Validation Guide: Finance Model Correctness (027)

## Prerequisites

```bash
cd /Users/ayazuddin/Development/personal/Ortho
# Sandbox is already bootstrapped (web/.env.local written, npm ci done)
# Local Supabase is running (for CLI path — not needed for pure logic tests)
```

## 1. Baseline — all existing tests green

```bash
cd web && npm test
# Expected: 145 test files, 1375 tests, all pass
```

## 2. A2 — Timezone bug verified and fixed

```bash
# After writing the test (should be RED before fix):
TZ=America/Los_Angeles npx vitest run test/insights-timezone.test.ts
# Expected pre-fix: FAIL (boundary transaction miscounted into wrong month)
# Expected post-fix: PASS

# Full suite still green post-fix:
npm test
# Expected: all 145+ files pass, no regressions
```

**Key assertion to verify**: With `now = new Date(2026, 5, 15)` (June 15 local) and
a transaction dated `"2026-06-01"`, the returned insights should include June spend
(rule 1 top-category or rule 4 cashflow fires on June expenses) — not zero-spend
for June with the transaction in May.

## 3. A4 — CLI ordering contract verified

```bash
# Run the new toTransaction test:
npx vitest run test/import/toTransaction.test.ts
# Expected: PASS (confirms orderedOwnerIds is used in the CLI path)
```

**Key assertion**: With members `{id: "zz…", sort_order: 0}` and `{id: "aa…", sort_order: 1}`,
an even split of 101¢ gives `shares["aa…"] = 51, shares["zz…"] = 50`.

## 4. A3 — Oracle extended

```bash
# Run the extended oracle files:
npx vitest run test/finance-goldens.test.ts test/finance-properties.test.ts
# Expected: all existing + new cases pass
```

**New cases to verify**:
- Amortization month-1: `principalCents = 29865, interestCents = 150000` (±1¢) for $300k/6%/30y
- Insights rule-3: 12,000¢ spend vs 10,000¢ budget → `severity:'critical', magnitude_cents: 2000`
- Insights rule-5: 3 charges averaging 3116¢ (truncated) → recurring fires at 3116¢
- `monthBounds("2026-06")` → `dateFrom: "2026-06-01T00:00:00.000Z"`, `dateTo: "2026-07-01T00:00:00.000Z"`
- `daysUntilNextRent` with due-day 31, asOf Feb 14 2026 → 14 days

## 5. B3 — Honest labels visible

```bash
# Type-check only (UI visual test requires a browser):
npx tsc --noEmit
# Expected: no type errors
```

Manual visual check: start the dev server (requires a connected Supabase):
- Open a property with a mortgage → "Equity" section should now read "Principal paid down"
- Open a multifamily property → "Net rental" should have "P&I only" qualifier
- Simulate a near-zero balance (or hardcode in tests) → "paid off" display when ≤ $5

## 6. B4 — Policy comment readable

```bash
grep -A 5 "leftover cents go" web/lib/splits.ts
# Expected: the documented policy comment appears above the leftover distribution loop
grep "leftover-cent" PARITY.md
# Expected: the canonical-leftover-cent row references the policy and the verification test
```

## 7. Full suite + type check

```bash
cd web && npx tsc --noEmit && npm test
# Expected: 0 type errors, all tests pass (previous 1375 + new tests)
```

## 8. Push and check CI

```bash
git push -u origin feat/finance-model-correctness
# Then watch CI:
GH_TOKEN=placeholder gh run watch --exit-status
# Expected: web-ci.yml green (tsc + vitest + vector-drift); capacitor-ios-ci.yml green
```
