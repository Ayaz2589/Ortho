import { describe, it, expect } from 'vitest'
import { generateInsights } from '@/lib/finance/insights'
import { generateCorpus } from './generate'

// A2 reproduction (spec 026, FR-006 / SC-004). RUN ONLY under vitest.tz.config.ts
// (TZ=America/New_York) — see the *.tz.test.ts exclusion in vitest.config.ts.
//
// insights.ts builds month windows with LOCAL boundaries (new Date(y, m, 1)) but
// compares them against new Date(t.date).getTime() (an absolute instant). A row
// dated 2027-02-01T00:15:00Z is 2027-01-31T19:15 in New York, so under NY it
// falls into JANUARY's window even though its calendar date is Feb 1 — it drops
// out of February's current-month insights. Under UTC (the default suite, and the
// control below) it buckets correctly. The app masks this by storing rows at
// noon-UTC; the corpus deliberately carries non-noon boundary rows to expose it.
//
// This test PINS the current (buggy) behavior so the §9.4 fix has a clear
// before/after. When A2 is fixed, flip the expectations to assert correct
// bucketing.

const corpus = generateCorpus()

/** The Feb-1 00:15Z boundary grocery row from the tz-boundary scenario. */
function boundaryTx() {
  const scenario = corpus.scenarios.find((s) => s.label === 'tz-boundary-a2')!
  const gt = scenario.transactions.find(
    (t) => t.transaction.date === '2027-02-01T00:15:00.000Z'
  )!
  return gt.transaction
}

describe('A2 — timezone insight-bucketing (TZ=America/New_York)', () => {
  it('runs under a non-UTC zone', () => {
    expect(process.env.TZ).toBe('America/New_York')
  })

  it('misbuckets a Feb-1 boundary row OUT of February under New York', () => {
    const tx = boundaryTx()
    expect(tx.category).toBe('groceries')
    expect(tx.amount_cents).toBe(50000)

    // "now" = Feb 15 2027 (still February in NY). The Feb-1 row SHOULD be in this
    // month, but the engine buckets it into January under NY.
    const now = new Date(Date.UTC(2027, 1, 15, 12, 0, 0))
    const insights = generateInsights([tx], [], [], now)

    const inCurrentMonth = insights.some(
      (i) => i.id.startsWith('top-category-groceries') && i.magnitude_cents === 50000
    )
    // BUG (A2): the Feb-1 expense is misbucketed to January, so it is absent from
    // February's current-month insights under New York.
    expect(inCurrentMonth).toBe(false)
  })
})
