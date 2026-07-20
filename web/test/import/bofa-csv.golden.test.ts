import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bofaCsv } from '../../scripts/import/profiles/bofa-csv'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('Bank of America CSV golden parse', () => {
  const pages: string[] = load('bofa-2026-06.pages.json')
  const expected = load('bofa-2026-06.expected.json')
  const parsed = JSON.parse(JSON.stringify(bofaCsv.parse(pages)))

  it('parses the CSV exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('detects BofA CSV from its header', () => {
    expect(bofaCsv.detect(pages.join('\n'))).toBe(true)
  })

  it('does not detect BofA from Chase or Citi headers', () => {
    expect(bofaCsv.detect('Transaction Date,Post Date,Description,Category,Type,Amount,Memo')).toBe(false)
    expect(bofaCsv.detect('Date,Description,Debit,Credit')).toBe(false)
  })

  it('treats negative Amount as expense', () => {
    const rows = bofaCsv.parse(pages).sections[0].rows
    const expenses = rows.filter((r) => r.kind === 'expense')
    expect(expenses).toHaveLength(3)
    expect(expenses[0]).toMatchObject({ amountCents: 575, kind: 'expense' })
  })

  it('excludes the payment row via Payee containing PAYMENT', () => {
    const rows = bofaCsv.parse(pages).sections[0].rows
    const payment = rows.find((r) => r.excluded)
    expect(payment).toMatchObject({ excludeReason: 'card-payment', kind: 'income' })
  })

  it('does not claim reconcilability', () => {
    expect(bofaCsv.parse(pages).reconcilable).toBe(false)
  })
})
