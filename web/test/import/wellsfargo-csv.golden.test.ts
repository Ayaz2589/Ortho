import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { wellsFargoCsv } from '../../scripts/import/profiles/wellsfargo-csv'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('Wells Fargo CSV golden parse', () => {
  const pages: string[] = load('wellsfargo-2026-06.pages.json')
  const expected = load('wellsfargo-2026-06.expected.json')
  const parsed = JSON.parse(JSON.stringify(wellsFargoCsv.parse(pages)))

  it('parses the CSV exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('detects Wells Fargo from positional no-header CSV shape', () => {
    expect(wellsFargoCsv.detect(pages.join('\n'))).toBe(true)
  })

  it('does not detect Wells Fargo from headered CSVs', () => {
    expect(wellsFargoCsv.detect('Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n')).toBe(false)
    expect(wellsFargoCsv.detect('Date,Description,Debit,Credit\n')).toBe(false)
  })

  it('parses dates from column 0 and amounts from column 1', () => {
    const rows = wellsFargoCsv.parse(pages).sections[0].rows
    expect(rows[0].dateISO).toBe('2026-06-01T12:00:00.000Z')
    expect(rows[0].amountCents).toBe(575)
  })

  it('excludes the payment row when amount is positive and description matches PAYMENT', () => {
    const rows = wellsFargoCsv.parse(pages).sections[0].rows
    const payment = rows.find((r) => r.excluded)
    expect(payment).toMatchObject({ excludeReason: 'card-payment', kind: 'income' })
  })

  it('does not claim reconcilability', () => {
    expect(wellsFargoCsv.parse(pages).reconcilable).toBe(false)
  })
})
