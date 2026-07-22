import { describe, it, expect } from 'vitest'
import { generateCorpus, toTables, DEFAULT_SEED } from './generate'
import { serializeCorpus, serializeManifest, readSnapshot } from './serialize'
import { DIMENSIONS, coverageOf, missingDimensions } from './coverage'
import { EPOCH, addMonths } from './clock'
import { toDisplayAmount } from '@/lib/finance/money'
import { FALLBACK_RATE_FROM_USD } from '@/lib/finance/currency'
import { generateInsights } from '@/lib/finance/insights'
import { goalOffTrackInsight, goalProgress } from '@/lib/finance/goals'
import { GOALS_NOW_ISO } from './scenarios'

const corpus = generateCorpus(DEFAULT_SEED)
const tables = toTables(corpus)

describe('coverage corpus — determinism (SC-001)', () => {
  it('same seed → byte-identical serialization', () => {
    expect(serializeCorpus(generateCorpus(DEFAULT_SEED))).toBe(
      serializeCorpus(generateCorpus(DEFAULT_SEED))
    )
  })
  it('a different seed changes the corpus', () => {
    expect(serializeCorpus(generateCorpus(1))).not.toBe(serializeCorpus(generateCorpus(2)))
  })
})

describe('coverage corpus — reconciliation (SC-003)', () => {
  it('every transaction’s shares sum to its amount', () => {
    for (const s of corpus.scenarios) {
      for (const gt of s.transactions) {
        const sum = gt.shares.reduce((n, sh) => n + sh.amount_cents, 0)
        expect(sum, `${gt.transaction.id} shares must reconcile`).toBe(gt.transaction.amount_cents)
        // shares map (stored on the row) must agree with the share rows
        const mapSum = Object.values(gt.transaction.shares).reduce((n, c) => n + c, 0)
        expect(mapSum).toBe(gt.transaction.amount_cents)
      }
    }
  })
})

describe('coverage corpus — completeness (SC-002)', () => {
  it('every coverage dimension is represented by ≥1 labelled scenario', () => {
    const missing = missingDimensions(corpus)
    expect(missing, `uncovered dimensions: ${missing.join(', ')}`).toEqual([])
  })
  it('coverageOf maps every dimension to concrete labels', () => {
    const cov = coverageOf(corpus)
    for (const d of DIMENSIONS) expect(cov[d].length).toBeGreaterThan(0)
  })
})

describe('coverage corpus — referential integrity (data-model rule 2/2b)', () => {
  const userIds = new Set(tables.users.map((u) => u.id))
  const hhIds = new Set(tables.households.map((h) => h.id))
  const personIds = new Set(tables.household_people.map((p) => p.id))
  const txIds = new Set(tables.transactions.map((t) => t.id))
  const propIds = new Set(tables.properties.map((p) => p.id))
  const personToHh = new Map(tables.household_people.map((p) => [p.id, p.household_id]))

  it('members reference known users + households', () => {
    for (const m of tables.household_members) {
      expect(userIds.has(m.user_id)).toBe(true)
      expect(hhIds.has(m.household_id)).toBe(true)
    }
  })
  it('people belong to known households', () => {
    for (const p of tables.household_people) expect(hhIds.has(p.household_id)).toBe(true)
  })
  it('transactions + shares + owners + payers resolve', () => {
    for (const t of tables.transactions) {
      expect(hhIds.has(t.household_id)).toBe(true)
      for (const oid of t.owner_ids) {
        expect(personIds.has(oid)).toBe(true)
        expect(personToHh.get(oid)).toBe(t.household_id)
      }
      if (t.paid_by) expect(personIds.has(t.paid_by)).toBe(true)
      if (t.kind === 'transfer') expect(t.owner_ids.length).toBe(1)
    }
    for (const sh of tables.transaction_shares) {
      expect(txIds.has(sh.transaction_id)).toBe(true)
      expect(personIds.has(sh.person_id)).toBe(true)
    }
  })
  it('housing rows reference known properties', () => {
    for (const m of tables.mortgage_info) expect(propIds.has(m.property_id)).toBe(true)
    for (const l of tables.lease_info) expect(propIds.has(l.property_id)).toBe(true)
    for (const u of tables.units) expect(propIds.has(u.property_id)).toBe(true)
    for (const rp of tables.rental_payments) expect(propIds.has(rp.property_id)).toBe(true)
  })
  it('budgets reference known households', () => {
    for (const b of tables.budgets) expect(hhIds.has(b.household_id)).toBe(true)
  })
})

describe('coverage corpus — size band (SC-007) & currency storage (research D3)', () => {
  it('holds a few hundred households (coverage over volume, not thousands)', () => {
    expect(corpus.scenarios.length).toBeGreaterThanOrEqual(100)
    expect(corpus.scenarios.length).toBeLessThanOrEqual(500)
  })
  it('JPY-lens amounts stay USD cents and display-round to whole yen', () => {
    const jpy = corpus.scenarios.find((s) => s.displayCurrency === 'jpy')
    expect(jpy).toBeDefined()
    for (const gt of jpy!.transactions) {
      // stored amount is an integer number of USD cents
      expect(Number.isInteger(gt.transaction.amount_cents)).toBe(true)
      // display conversion to JPY has no fractional yen
      const display = toDisplayAmount(gt.transaction.amount_cents, 'jpy', FALLBACK_RATE_FROM_USD.jpy)
      expect(Number.isInteger(display)).toBe(true)
    }
  })
})

describe('coverage corpus — A2 UTC control (spec US2 acceptance #2)', () => {
  // Under the default TZ=UTC run, the SAME A2 boundary row buckets CORRECTLY into
  // February — proving the defect is timezone-gated (and why UTC-pinned CI never
  // caught it). The misbucketing appears only under a non-UTC zone (see
  // insights-timezone.tz.test.ts).
  it('runs under UTC in the default suite', () => {
    expect(process.env.TZ).toBe('UTC')
  })

  it('correctly buckets the Feb-1 boundary row INTO February under UTC', () => {
    const scenario = corpus.scenarios.find((s) => s.label === 'tz-boundary-a2')!
    const tx = scenario.transactions.find(
      (t) => t.transaction.date === '2027-02-01T00:15:00.000Z'
    )!.transaction
    const now = new Date(Date.UTC(2027, 1, 15, 12, 0, 0)) // Feb 15 2027
    const insights = generateInsights([tx], [], [], now)
    const inCurrentMonth = insights.some(
      (i) => i.id.startsWith('top-category-groceries') && i.magnitude_cents === 50000
    )
    expect(inCurrentMonth).toBe(true)
  })
})

describe('coverage corpus — split-method tags are realized, not just declared', () => {
  // Guards the §9.1 wiring where the parameterized family computed a percent/value
  // split but never passed it to the builder, so ~150 scenarios were tagged
  // split-percent/split-value while every transaction silently collapsed to even.
  // The coverage tag is now derived from t.splitMethod, so a tag with no matching
  // realized transaction is a bug this test catches.
  const pairs = [
    ['even', 'split-even'],
    ['percent', 'split-percent'],
    ['value', 'split-value'],
  ] as const

  it('every scenario tagged split-* contains a transaction actually using that method', () => {
    for (const s of corpus.scenarios) {
      const methods = new Set(s.transactions.map((t) => t.splitMethod))
      for (const [method, dim] of pairs) {
        if (s.dimensions.includes(dim)) {
          expect(
            methods.has(method),
            `${s.label} tags ${dim} but realizes [${[...methods].join(', ')}]`
          ).toBe(true)
        }
      }
    }
  })

  it('percent and value splits appear at volume, not just in the one hand-authored scenario', () => {
    let percent = 0
    let value = 0
    for (const s of corpus.scenarios)
      for (const t of s.transactions) {
        if (t.splitMethod === 'percent') percent++
        if (t.splitMethod === 'value') value++
      }
    expect(percent).toBeGreaterThan(10)
    expect(value).toBeGreaterThan(10)
  })
})

describe('coverage corpus — budget-band tags are realized by real spend (SC-002 non-vacuous)', () => {
  // "now" late in the corpus current month so the under-band progress gate
  // (monthProgress >= 0.7) is satisfied; the default suite runs under UTC, where
  // the engine's local month boundaries coincide with the corpus's noon-UTC dates.
  const cur = addMonths(EPOCH.year, EPOCH.month, 0)
  const now = new Date(Date.UTC(cur.year, cur.month1 - 1, 28, 12, 0, 0))
  const bands = [
    ['budget-under', 'budget-under-'],
    ['budget-near', 'budget-near-'],
    ['budget-over', 'budget-over-'],
  ] as const

  for (const [dim, idPrefix] of bands) {
    it(`every scenario tagged ${dim} actually emits a ${dim} insight`, () => {
      const carriers = corpus.scenarios.filter((s) => s.dimensions.includes(dim))
      expect(carriers.length, `no scenario carries ${dim}`).toBeGreaterThan(0)
      for (const s of carriers) {
        const txs = s.transactions.map((t) => t.transaction)
        const insights = generateInsights(txs, s.budgets, [], now, 100)
        expect(
          insights.some((i) => i.id.startsWith(idPrefix)),
          `${s.label} tags ${dim} but no ${dim} insight was emitted`
        ).toBe(true)
      }
    })
  }
})

describe('coverage corpus — spec 030 holistic tables (referential integrity + non-empty)', () => {
  const userIds = new Set(tables.users.map((u) => u.id))
  const hhIds = new Set(tables.households.map((h) => h.id))
  const txIds = new Set(tables.transactions.map((t) => t.id))
  const goalIds = new Set(tables.goals.map((g) => g.id))
  const tagIds = new Set(tables.tags.map((t) => t.id))
  const instIds = new Set(tables.linked_institutions.map((i) => i.id))
  const acctIds = new Set(tables.linked_accounts.map((a) => a.id))

  it('every previously-missing table is populated (no empty screen)', () => {
    expect(tables.tags.length).toBeGreaterThan(0)
    expect(tables.transaction_tags.length).toBeGreaterThan(0)
    expect(tables.goals.length).toBeGreaterThan(0)
    expect(tables.goal_contributions.length).toBeGreaterThan(0)
    expect(tables.linked_institutions.length).toBeGreaterThan(0)
    expect(tables.linked_accounts.length).toBeGreaterThan(0)
    expect(tables.entitlements.length).toBeGreaterThan(0)
  })

  it('tags + transaction_tags resolve', () => {
    for (const tg of tables.tags) expect(hhIds.has(tg.household_id)).toBe(true)
    for (const tt of tables.transaction_tags) {
      expect(txIds.has(tt.transaction_id)).toBe(true)
      expect(tagIds.has(tt.tag_id)).toBe(true)
    }
  })

  it('goals + contributions resolve; goal associations are mutually exclusive (spec 027 v1)', () => {
    for (const g of tables.goals) {
      expect(hhIds.has(g.household_id)).toBe(true)
      expect(userIds.has(g.created_by)).toBe(true)
      expect(g.linked_account_id === null || g.linked_category === null).toBe(true)
      if (g.linked_account_id) expect(acctIds.has(g.linked_account_id)).toBe(true)
      expect(g.target_cents).toBeGreaterThan(0)
    }
    for (const c of tables.goal_contributions) {
      expect(goalIds.has(c.goal_id)).toBe(true)
      expect(c.amount_cents).toBeGreaterThan(0)
    }
  })

  it('linked accounts belong to known institutions; institutions to households + users', () => {
    for (const inst of tables.linked_institutions) {
      expect(hhIds.has(inst.household_id)).toBe(true)
      expect(userIds.has(inst.created_by)).toBe(true)
    }
    for (const a of tables.linked_accounts) expect(instIds.has(a.institution_id)).toBe(true)
  })

  it('entitlements reference known users', () => {
    for (const e of tables.entitlements) expect(userIds.has(e.user_id)).toBe(true)
  })

  it('goal-off-track coverage is non-vacuous: emits the off-track insight, and reached is reached', () => {
    const now = new Date(GOALS_NOW_ISO)
    const offTrack = tables.goals.find((g) => g.id === 'goals-lifecycle-g-a')!
    const offContribs = tables.goal_contributions.filter((c) => c.goal_id === offTrack.id)
    expect(goalOffTrackInsight(offTrack, offContribs, now)).not.toBeNull()

    const reached = tables.goals.find((g) => g.id === 'goals-lifecycle-g-b')!
    const reachedContribs = tables.goal_contributions.filter((c) => c.goal_id === reached.id)
    expect(goalProgress(reached.target_cents, reachedContribs).reached).toBe(true)
  })
})

describe('coverage corpus — snapshot (FR-002)', () => {
  it('manifest matches the committed snapshot', () => {
    // If this fails after an intentional generator change, run `npm run gen:corpus`.
    expect(serializeManifest(corpus)).toBe(readSnapshot())
  })
})
