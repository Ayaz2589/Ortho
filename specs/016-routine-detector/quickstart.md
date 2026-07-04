# Quickstart — Routine Detector (validation guide)

Everything runs from `web/` on Node 22 (`.nvmrc`). No network, no Supabase, no
Xcode. This slice is pure TS + Vitest + a `tsx` harness.

## Prerequisites

```bash
cd web
npm install            # if not already; Linux ARM may need @rolldown/binding-linux-arm64-gnu
```

## 1. Run the tests (the real gate — SC-001/002/003/006)

```bash
cd web
npm test                       # full Vitest suite must stay green
npx vitest run test/routines.test.ts   # just this feature's tests
```

Expected: `test/routines.test.ts` passes, covering —
- **US1 (P1)**: weekday-morning merchant routine detected with right cadence,
  bucket, count, median amount; category-level weekly grocery routine detected
  across rotating merchants; a single-occurrence merchant yields no routine;
  income/transfer rows ignored; two runs deep-equal (determinism).
- **US2 (P2)**: over the demo fixture the planted routines all surface (SC-001);
  over an all-one-off input, zero routines (SC-002).
- **US3 (P3)**: monthly roll-up equals the hand-computed sum for mixed cadences;
  empty input → `monthlyRoutineCostCents: 0`.
- Unit rules: `classifyCadence`, `hourBucket` (noon-UTC → `null`),
  `monthlyEquivalentCents`, `confidenceScore`, `normalizeMerchant`.

The whole suite (currently ~720 tests) must remain green — the prototype adds
files and changes nothing existing, so no other suite should move.

## 2. See the routines (the human go/no-go — SC-004)

```bash
cd web
npx tsx scripts/routines-demo.ts               # prints both datasets
npx tsx scripts/routines-demo.ts -- --dataset=demo   # just the planted-routine fixture
npx tsx scripts/routines-demo.ts -- --dataset=seed   # just the sparse spec-015 seed (control)
```

Expected output per dataset: a ranked table — `label · cadence · typical amount
($) · count · confidence` — followed by an `Estimated monthly routine cost: $X`
line. Read it and answer the findings.md question: **does `merchant + cadence`
alone surface routines that feel insightful?**

- **demo** should show weekday coffee, weekday transit, weekly groceries, monthly
  subscription — and NOT the planted one-off noise.
- **seed** should stay mostly quiet (the sparse control), surfacing at most the
  genuinely repeating spend.

## 3. What "done" looks like

- `npm test` green (SC-006: nothing existing changed — no golden vector, no iOS,
  no insight output moved).
- Harness prints legible ranked routines for both datasets (SC-004).
- The go/no-go call can be made from the harness output alone.

## References

- Interface: [contracts/routine-detector.md](./contracts/routine-detector.md)
- Types & flow: [data-model.md](./data-model.md)
- Algorithm decisions (cadence, buckets, confidence, ranking, multipliers):
  [research.md](./research.md)
- Motivation: repo-root `findings.md` (PR #5)
