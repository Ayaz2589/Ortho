# Quickstart / Validation: Dashboard specific-month picker

How to prove the feature works end-to-end. Reference dates are injected in tests (never the real clock).

## Prerequisites

- Node ≥ 20.19 / ≥ 22.12 for web.
- Xcode for iOS.
- Several months of transaction data in the signed-in household (already present in the dev data).

## 1. Shared date logic (golden vectors)

```bash
cd web
npm run gen:vectors        # regenerates shared/test-vectors/*.json
git diff --stat shared/test-vectors/
```

Expected: a **new** `shared/test-vectors/dashboard-month-scope.json`; **no diff** to existing vector files (e.g. `transaction-filters.json` — `monthBounds` is reused, not changed).

## 2. Automated suites (both must be green)

```bash
cd web && npm test                       # Vitest — includes new availableMonths parity test,
                                          # scope-resolution + stepper unit tests
cd ../iOS && xcodebuild test -scheme Ortho-iOS   # XCTest — asserts the same dashboard-month-scope.json
```

Expected:

- Web: prior tests still pass; new tests cover `availableMonths` (against the vector), `monthScopeInterval` (selectedMonth → `monthBounds`; null → relative), `monthReferenceDate` (15th noon UTC), and `stepMonth` clamping.
- iOS: the same `dashboard-month-scope.json` cases pass in `Ortho-iOSTests`, plus mirrored scope/stepper unit tests.

## 3. Manual walkthrough (each surface)

On the **dashboard**, with data spanning several months:

1. **Default** — opens on the persisted relative range (current month); no month selected. ✅ unchanged from today.
2. **Pick a month** — open the month list, choose a past month (e.g. March). Net summary, spend-by-category, per-owner, top-merchants, **budget**, and **insights** all switch to March. Daily-trend (trailing-30) and housing (snapshot) are unchanged. ✅ SC-002.
3. **Step** — `‹`/`›` move to adjacent months; `‹` is disabled at the earliest month with data, `›` at the latest. ✅ FR-003.
4. **Return** — tap a relative chip (Month/3M/6M/1Y) **or** the "Latest" affordance; the month selection clears and the relative window returns. ✅ FR-006/007.
5. **Transient** — select a past month, then relaunch (web: reload; iOS: relaunch). Dashboard returns to the persisted relative range, no month restored. ✅ FR-008.
6. **Web lockstep** — with a month selected, resize across the 1024px breakpoint; mobile and desktop layouts show the same selection. ✅ FR-010.
7. **Parity** — for the same selected month, iOS and web show the same net + category totals. ✅ SC-003.

## 4. Parity doc

- `PARITY.md` has a new **Dashboard month selection** row (iOS ✅ / web ✅ / CLI —) after the Transaction filtering row; the "Apps only" line is amended; the audit header date/test counts are bumped.

## Done when

- New vector file present; existing vectors unchanged.
- `npm test` (web) and `xcodebuild test` (iOS) both green.
- Manual walkthrough steps 1–7 pass on both surfaces.
- PARITY.md updated.
