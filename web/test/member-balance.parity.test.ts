import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { balanceBetween, allPairBalances, simplifyDebts } from '@/lib/balances'
import type { Transaction } from '@/lib/types'
import type { Person } from '@/lib/types'

const here = dirname(fileURLToPath(import.meta.url))
const { cases } = JSON.parse(
  readFileSync(resolve(here, '../../shared/test-vectors/member-balance.json'), 'utf8')
) as {
  cases: Array<{
    name: string
    viewer: string
    other: string
    transactions: Transaction[]
    expected: number
  }>
}

describe('member balance parity vs golden vectors', () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(balanceBetween(c.viewer, c.other, c.transactions)).toBe(c.expected)
    })
  }
})

const A = '00000000-0000-0000-0000-000000000101'
const B = '00000000-0000-0000-0000-000000000102'
const C = '00000000-0000-0000-0000-000000000103'

function makePerson(id: string): Person {
  return { id, household_id: 'h', name: id, initial: id[0], color_key: 'sage', linked_user_id: null, sort_order: 0, removed_at: null, created_at: '' }
}

function makeExpense(payer: string, owners: string[], shares: Record<string, number>, amount: number): Transaction {
  return { id: '', household_id: 'h', merchant: '', category: 'groceries', kind: 'expense', amount_cents: amount, source: '', date: '2026-06-15T12:00:00.000Z', created_by: 'u', created_at: '', updated_at: '', paid_by: payer, owner_ids: owners, shares }
}

describe('allPairBalances — 3-person household', () => {
  // A pays $150 split evenly (A:50, B:50, C:50)
  // B pays $90 split evenly (A:30, B:30, C:30)
  // Net: A owed by B: 50-30=20, A owed by C: 50-0=50 (C owes A $50), B owed by C: 30
  const txns: Transaction[] = [
    makeExpense(A, [A, B, C], { [A]: 5000, [B]: 5000, [C]: 5000 }, 15000),
    makeExpense(B, [A, B, C], { [A]: 3000, [B]: 3000, [C]: 3000 }, 9000),
  ]
  const people = [makePerson(A), makePerson(B), makePerson(C)]

  it('returns 3 non-zero pairs', () => {
    const pairs = allPairBalances(people, txns)
    expect(pairs.length).toBe(3)
  })

  it('A < B pair: B owes A $20 (net 2000 cents)', () => {
    const pairs = allPairBalances(people, txns)
    const ab = pairs.find((p) => p.a === A && p.b === B)
    expect(ab?.netCents).toBe(2000)
  })

  it('A < C pair: C owes A $50 (net 5000 cents)', () => {
    const pairs = allPairBalances(people, txns)
    const ac = pairs.find((p) => p.a === A && p.b === C)
    expect(ac?.netCents).toBe(5000)
  })

  it('B < C pair: C owes B $30 (net 3000 cents)', () => {
    const pairs = allPairBalances(people, txns)
    const bc = pairs.find((p) => p.a === B && p.b === C)
    expect(bc?.netCents).toBe(3000)
  })

  it('returns empty array when all settled', () => {
    expect(allPairBalances([makePerson(A), makePerson(B)], [])).toEqual([])
  })

  it('returns empty array for solo household', () => {
    expect(allPairBalances([makePerson(A)], txns)).toEqual([])
  })

  it('antisymmetry: balanceBetween(a,b) === -balanceBetween(b,a)', () => {
    expect(balanceBetween(A, B, txns)).toBe(-balanceBetween(B, A, txns))
    expect(balanceBetween(A, C, txns)).toBe(-balanceBetween(C, A, txns))
  })
})

describe('simplifyDebts', () => {
  const people = [makePerson(A), makePerson(B), makePerson(C)]

  it('returns empty for no debts', () => {
    expect(simplifyDebts([], people)).toEqual([])
  })

  it('simplifies 3-person multi-hop: A owes B $30, B owes C $20', () => {
    // Net: A = -3000, B = +1000, C = +2000
    const pairs = [
      { a: A, b: B, netCents: -3000 }, // A owes B $30 (a < b, negative means a owes b)
      { a: B, b: C, netCents: -2000 }, // B owes C $20
    ]
    const result = simplifyDebts(pairs, people)
    // Total owed by A = 3000; C should receive 2000, B should receive 1000
    const totalFrom = result.reduce((s, r) => (r.from === A ? s + r.amountCents : s), 0)
    expect(totalFrom).toBe(3000)
    expect(result.every((r) => r.amountCents > 0)).toBe(true)
  })

  it('two-person debt passes through unchanged', () => {
    const pairs = [{ a: A, b: B, netCents: 5000 }]
    const result = simplifyDebts(pairs, [makePerson(A), makePerson(B)])
    expect(result.length).toBe(1)
    expect(result[0].amountCents).toBe(5000)
  })
})
