# Quickstart — Validating Spec 023

How to prove each story works. All web commands run from `web/` (Linux OK — nothing here is
macOS-only except the iOS build, which runs in CI). Test-first per Principle VI: for each bug, the
repro test is written and seen to FAIL before the fix.

## Prerequisites
```bash
cd web
npm install                       # + Linux-arm64 bindings if needed (see docs/web.md gotchas)
npm run build && npm run measure:bundle -- --json ../specs/023-perf-correctness-hardening/baseline.json
#   ^ record the pre-change 023 baseline BEFORE any code change (for SC-002)
```

## Per-story validation

### US1 — Money correct in any currency (B1)  [P1]
```bash
npx vitest run test/**/tx-form*split*        # repro first (fails), then passes after the fix
```
Manual: set display currency to GBP, open a 2-owner value-split transaction, tap Save unchanged →
saves, shares still sum to the total, no false "amounts must add up". Settle up → balance hits £0.00.

### US2 — Faster load & smooth scroll (P1/P2/P3)  [P1]
```bash
npm run build
npm run measure:bundle -- --baseline ../specs/023-perf-correctness-hardening/baseline.json
#   expect initial-load gzip DOWN by ≈ the catalog weight; default-language user fetches no catalog
npm test                                     # formatter/aggregation output byte-identical (vectors green, no regen)
```
Manual (optional): profile a long ledger render before/after; per-row `Intl` construction and
whole-list re-render on an unrelated add are gone.

### US3 — Month-scoped insights (B2)  [P2]
```bash
npx vitest run test/**/insights*             # repro (past month shows ~14 days left / no under-budget) → fixed
npm run gen:vectors && git diff --stat shared/test-vectors    # review: ONLY month-select fields change
npm test
```

### US4 — iOS native feel (B3/B4/B5/B10/B9)  [P2]  — iOS verified in CI + on device
```bash
npx vitest run test/**/store*liveness* test/**/scan*         # B5 getUser + B3 JS wiring (mocked plugin)
git push && GH_TOKEN=placeholder gh run watch --exit-status  # Capacitor iOS CI build-verifies Swift
```
Manual device/simulator: scan → camera dismisses into review, multi-page kept; background → Face ID
→ no reload, scroll/modal/input preserved; force dark theme → status bar readable from launch on
every tab; revoke session server-side → foreground signs out.

### US5 — Web copy & selection (B6/B8)  [P2]
```bash
npx vitest run test/**/*sign-in* test/**/*select*   # 8-digit copy; user-select native-gated
```
Manual (browser): select and copy an amount and a merchant name → works.

### US6 — Responsive at scale (P4/P5)  [P3]
```bash
npx vitest run test/**/store* test/**/*row-render*  # unrelated mutation doesn't re-render unrelated rows
npm test                                            # loadAll projection: identical in-app data
```

### US7 — Safe to change (FR-018..022)  [P3]
```bash
npx tsc --noEmit                                    # typed Supabase boundary; a scratch column rename now fails
npx vitest run test/i18n/catalog-reachability*      # dead-key guard passes; a stray key fails it
grep -rn "kind === 'transfer'" components lib | grep -v transaction.ts   # centralized via accessor
grep -rn "relativeTime" web/lib web/app             # orphan removed
```

## Final gate (all stories)
```bash
cd web
npx tsc --noEmit          # clean
npm test                  # all green incl. regression-vector parity suites
npm run build             # static export succeeds, out/ produced
npm run measure:bundle -- --baseline ../specs/023-perf-correctness-hardening/baseline.json   # record cumulative delta
git push && GH_TOKEN=placeholder gh run watch --exit-status   # web CI + Capacitor iOS CI green (SC-005/007)
```
**Pass = every existing test still green (vectors byte-identical except the reviewed B2 month-select
diff), `tsc` clean, static export works, both CIs green, and the measured initial-load is below the
023 baseline.**
