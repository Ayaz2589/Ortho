import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { amexCsv } from '../../scripts/import/profiles/amex-csv'
import { chaseCsv } from '../../scripts/import/profiles/chase-csv'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('Amex CSV golden parse', () => {
  const pages: string[] = load('amex-csv-2026-06.pages.json')
  const expected = load('amex-csv-2026-06.expected.json')
  const parsed = JSON.parse(JSON.stringify(amexCsv.parse(pages)))

  it('parses the CSV exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('detects Amex CSV from its header', () => {
    expect(amexCsv.detect(pages.join('\n'))).toBe(true)
  })

  it('does not detect Amex CSV from Chase header', () => {
    const chasePages: string[] = load('chase-2026-06.pages.json')
    expect(amexCsv.detect(chasePages.join('\n'))).toBe(false)
  })

  it('does not claim reconcilability (CSV has no control total)', () => {
    expect(amexCsv.parse(pages).reconcilable).toBe(false)
  })

  it('excludes the card payment row and keeps the 3 charges', () => {
    const rows = amexCsv.parse(pages).sections[0].rows
    expect(rows).toHaveLength(4)
    const excluded = rows.filter((r) => r.excluded)
    expect(excluded).toHaveLength(1)
    expect(excluded[0]).toMatchObject({ excludeReason: 'card-payment', kind: 'income' })
  })

  it('sets cardMember from the Card Member column', () => {
    const rows = amexCsv.parse(pages).sections[0].rows
    expect(rows[0].cardMember).toBe('AYAZ UDDIN')
  })

  it('does NOT match Chase header (no false positives)', () => {
    expect(amexCsv.detect(chaseCsv['id'] + 'Transaction Date,Post Date,Description,Category,Type,Amount,Memo')).toBe(false)
  })
})
