# Quickstart / Validation: Financial Health (spec 041)

How to prove the feature works end-to-end. All commands run from `web/`.

## Prerequisites

```bash
cd web
npm install
# Linux sandbox only, if native bindings are missing:
npm install @rolldown/binding-linux-arm64-gnu lightningcss-linux-arm64-gnu \
  @tailwindcss/oxide-linux-arm64-gnu @next/swc-linux-arm64-gnu --no-save
```

## Automated validation (the source of truth — TDD)

```bash
npx tsc --noEmit          # must be clean — run UNPIPED (never | head/grep)
npm test                  # full vitest suite, TZ=UTC — all green
```

Feature-scoped suites:

```bash
npm test financial-health              # engine unit + property tests
npm test financial-health-store        # fail-open + save sequence + snapshot
npm test financial-health-onboarding   # first-run stepper, skip-writes-defaults
npm test financial-health-settings     # edit + save + new snapshot
npm test financial-health-widget       # scored / profile-null / baseline delta / never-red
npm test financial-health-i18n         # new keys exist in all 5 catalogs
```

**Definition of done:** every suite green, `tsc` clean, `lib/` coverage ≥ threshold (90/90/80).

## Manual validation scenarios

Run `npm run dev` (offline in-memory mode: enable Settings → Developer → *Use test data*, or start
signed out — the memory client serves a seeded household).

1. **Day-one score (US1 / SC-001)**
   - Fresh profile-less user → the app routes to the first-run questionnaire.
   - Complete Income → Housing → Commitments (add a *remittance* row) → Safety net → Weights.
   - Land on the dashboard: the **Financial Health** widget shows a 0–100 score, a band label, and
     one next-step line. Confirm **no red** anywhere and a non-clinical band label. (SC-003.)

2. **Rent-burdened stays supportive (SC-004)**
   - Re-take from Settings → Financial Profile: income low, housing ~55% of income, "None yet"
     emergency fund. Save.
   - Confirm the score is **non-zero** and the next step is encouraging (not a "failing"/red state).

3. **Variable income uses the low estimate (US1 #2)**
   - Set income variable with a lower slow-month figure; confirm ratio-driven dimensions reflect the
     cautious number (compare against the same profile marked non-variable).

4. **Live improvement + baseline delta (US2 / SC-005)**
   - With a completed profile, add a budget and fund a goal (or use the seeded household), reload.
   - Confirm the score rises **without** re-taking the questionnaire and the widget shows movement
     from the first baseline (e.g. "Building → Steady").

5. **Weights personalize the score (SC-007)**
   - In Settings, raise one dimension's importance slider to 5 and lower another to 1; save.
   - Confirm the composite shifts toward the high-weighted dimension.

6. **Skip is non-blocking (FR-012)**
   - As a profile-less user, choose "Skip — use neutral defaults" → land on the dashboard; the widget
     works (neutral) and shows a "Set up your profile" CTA; the flow does **not** auto-prompt again.

7. **Widget toggle (FR-011)**
   - Settings → Widgets: toggle Financial Health off/on; confirm it leaves/returns to the board.

8. **Graceful degradation (SC-008)**
   - Simulate the tables missing (fail-open path is unit-tested); the app still loads, feature absent.

## References

- Scoring math: [contracts/health-scoring.md](./contracts/health-scoring.md)
- Schema + store wiring: [data-model.md](./data-model.md)
- Task breakdown: `tasks.md` (from `/speckit-tasks`)
