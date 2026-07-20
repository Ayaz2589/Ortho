import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { citiCsv } from '../../scripts/import/profiles/citi-csv'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('Citi CSV golden parse', () => {
  const pages: string[] = load('citi-2026-06.pages.json')
  const expected = load('citi-2026-06.expected.json')
  const parsed = JSON.parse(JSON.stringify(citiCsv.parse(pages)))

  it('parses the CSV exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('detects Citi CSV from its header', () => {
    expect(citiCsv.detect(pages.join('\n'))).toBe(true)
  })

  it('does not detect Citi from Chase or Amex headers', () => {
    expect(citiCsv.detect('Transaction Date,Post Date,Description,Category,Type,Amount,Memo')).toBe(false)
    expect(citiCsv.detect('Date,Description,Card Member,Account #,Amount')).toBe(false)
  })

  it('maps Debit column to expense rows', () => {
    const rows = citiCsv.parse(pages).sections[0].rows
    const expenses = rows.filter((r) => r.kind === 'expense')
    expect(expenses).toHaveLength(3)
    expect(expenses[0]).toMatchObject({ merchant: 'Starbucks #1234', amountCents: 575, category: 'coffee' })
  })

  it('maps Credit column to income rows and excludes payment rows', () => {
    const rows = citiCsv.parse(pages).sections[0].rows
    const payment = rows.find((r) => r.excluded)
    expect(payment).toBeDefined()
    expect(payment).toMatchObject({ kind: 'income', excludeReason: 'card-payment', amountCents: 15000 })
  })

  it('does not claim reconcilability', () => {
    expect(citiCsv.parse(pages).reconcilable).toBe(false)
  })
})
