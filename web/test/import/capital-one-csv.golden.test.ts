import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { capitalOneCsv } from '../../scripts/import/profiles/capital-one-csv'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('Capital One CSV golden parse', () => {
  const pages: string[] = load('capital-one-2026-06.pages.json')
  const expected = load('capital-one-2026-06.expected.json')
  const parsed = JSON.parse(JSON.stringify(capitalOneCsv.parse(pages)))

  it('parses the CSV exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('detects Capital One CSV from its header', () => {
    expect(capitalOneCsv.detect(pages.join('\n'))).toBe(true)
  })

  it('does not detect Capital One from Chase or Citi headers', () => {
    expect(capitalOneCsv.detect('Transaction Date,Post Date,Description,Category,Type,Amount,Memo')).toBe(false)
    expect(capitalOneCsv.detect('Date,Description,Debit,Credit')).toBe(false)
  })

  it('parses ISO dates (YYYY-MM-DD) from Transaction Date column', () => {
    const rows = capitalOneCsv.parse(pages).sections[0].rows
    expect(rows[0].dateISO).toBe('2026-06-01T12:00:00.000Z')
  })

  it('excludes the payment row via Description containing PAYMENT', () => {
    const rows = capitalOneCsv.parse(pages).sections[0].rows
    const payment = rows.find((r) => r.excluded)
    expect(payment).toMatchObject({ excludeReason: 'card-payment', kind: 'income' })
    expect(payment?.rawDescription).toMatch(/PAYMENT/i)
  })

  it('does not claim reconcilability', () => {
    expect(capitalOneCsv.parse(pages).reconcilable).toBe(false)
  })
})
