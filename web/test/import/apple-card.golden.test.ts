import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { appleCard } from '../../scripts/import/profiles/apple-card'
import { reconcile } from '../../scripts/import/engine/reconcile'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('Apple Card golden parse', () => {
  const pages: string[] = load('apple-card-2026-05.pages.json')
  const expected = load('apple-card-2026-05.expected.json')
  const parsed = JSON.parse(JSON.stringify(appleCard.parse(pages)))

  it('parses the statement exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('reconciles both sections against the printed totals', () => {
    expect(reconcile(appleCard.parse(pages).sections).ok).toBe(true)
  })

  it('detects Apple Card from the Goldman Sachs footer', () => {
    expect(appleCard.detect(pages.join('\n'))).toBe(true)
  })

  it('imports 12 charges and excludes the 2 card payments', () => {
    const stmt = appleCard.parse(pages)
    const [pay, txn] = stmt.sections
    expect(pay.rows).toHaveLength(2)
    expect(pay.rows.every((r) => r.excluded && r.excludeReason === 'card-payment')).toBe(true)
    expect(txn.rows).toHaveLength(12)
    expect(txn.rows.every((r) => !r.excluded)).toBe(true)
  })

  it('cleans glued merchant/address and categorizes subscriptions', () => {
    const txn = appleCard.parse(pages).sections[1].rows
    expect(txn.find((r) => r.rawDescription.startsWith('OPENAI'))).toMatchObject({ merchant: 'OpenAI', category: 'subs' })
    expect(txn.find((r) => r.rawDescription.includes('RETRO FITNESS'))).toMatchObject({ merchant: 'Retro Fitness', category: 'health' })
    expect(txn.find((r) => r.rawDescription.includes('CLAUDE.AI'))?.merchant).toBe('Claude.ai')
  })

  it('falls back to strip processor/address for unknown merchants and handles a return as income', () => {
    const synthetic = [
      'Apple Card is issued by Goldman Sachs Bank USA',
      'Transactions',
      'Date Description Daily Cash Amount',
      '05/10/2026 SQ*BLUE BOTTLE 123 Main St BROOKLYN 11201 NY USA 1% $0.05 $5.00',
      '05/11/2026 SOME SHOP 456 Oak Ave AUSTIN 78701 TX USA 1% $0.00 -$3.00',
      'Total charges, credits and returns $2.00',
    ].join('\n')
    const rows = appleCard.parse([synthetic]).sections[1].rows
    expect(rows[0].merchant).toBe('Blue Bottle')
    expect(rows[1]).toMatchObject({ merchant: 'Some Shop', kind: 'income', amountCents: 300, category: 'income' })
  })
})
