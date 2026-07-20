import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tdBankCsv } from '../../scripts/import/profiles/td-bank-csv'
import { tdBank } from '../../scripts/import/profiles/td-bank'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('TD Bank CSV golden parse', () => {
  const pages: string[] = load('td-bank-csv-2026-06.pages.json')
  const expected = load('td-bank-csv-2026-06.expected.json')
  const parsed = JSON.parse(JSON.stringify(tdBankCsv.parse(pages)))

  it('parses the CSV exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('detects TD Bank CSV from its header', () => {
    expect(tdBankCsv.detect(pages.join('\n'))).toBe(true)
  })

  it('does NOT clash with the TD Bank PDF profile detect (separate IDs)', () => {
    expect(tdBankCsv.id).not.toBe(tdBank.id)
    // PDF profile should not match CSV text
    expect(tdBank.detect(pages.join('\n'))).toBe(false)
  })

  it('maps Debit column to expense, Credit column to income', () => {
    const rows = tdBankCsv.parse(pages).sections[0].rows
    const expenses = rows.filter((r) => r.kind === 'expense')
    const income = rows.filter((r) => r.kind === 'income')
    expect(expenses).toHaveLength(3)
    expect(income).toHaveLength(1)
    expect(income[0]).toMatchObject({ amountCents: 250000, excluded: false })
  })

  it('ignores the Balance column', () => {
    // Parsing should succeed without treating Balance as an amount
    expect(() => tdBankCsv.parse(pages)).not.toThrow()
    const rows = tdBankCsv.parse(pages).sections[0].rows
    expect(rows[0].amountCents).toBe(575)
  })

  it('does not claim reconcilability', () => {
    expect(tdBankCsv.parse(pages).reconcilable).toBe(false)
  })
})
