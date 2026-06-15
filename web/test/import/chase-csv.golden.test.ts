import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chaseCsv } from '../../scripts/import/profiles/chase-csv'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('Chase CSV golden parse', () => {
  const pages: string[] = load('chase-2026-06.pages.json')
  const expected = load('chase-2026-06.expected.json')
  const parsed = JSON.parse(JSON.stringify(chaseCsv.parse(pages)))

  it('parses the CSV exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('detects Chase from the CSV header', () => {
    expect(chaseCsv.detect(pages.join('\n'))).toBe(true)
  })

  it('does not claim reconcilability (CSV has no control total)', () => {
    expect(chaseCsv.parse(pages).reconcilable).toBe(false)
  })

  it('excludes the card payment and keeps the 5 charges', () => {
    const rows = chaseCsv.parse(pages).sections[0].rows
    expect(rows).toHaveLength(6)
    const excluded = rows.filter((r) => r.excluded)
    expect(excluded).toHaveLength(1)
    expect(excluded[0]).toMatchObject({ excludeReason: 'card-payment', kind: 'income' })
  })

  it('maps Chase categories and signs amounts (charge=expense)', () => {
    const rows = chaseCsv.parse(pages).sections[0].rows
    expect(rows.find((r) => r.merchant === 'Amazon Prime')).toMatchObject({
      category: 'utilities',
      kind: 'expense',
      amountCents: 1632,
    })
    expect(rows.find((r) => r.rawDescription.includes('MKTPL'))?.category).toBe('entertainment')
  })
})
