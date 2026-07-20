import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CSV_PROFILES } from '../../scripts/import/profiles/csv-index'
import { detectBank } from '../../scripts/import/engine/detectBank'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

const PDF_IDS = ['amex', 'apple', 'td']

describe('CSV_PROFILES registry', () => {
  it('contains Chase, Amex CSV, Citi, Capital One, BofA, Wells Fargo, TD Bank CSV', () => {
    const ids = CSV_PROFILES.map((p) => p.id)
    expect(ids).toContain('chase')
    expect(ids).toContain('amex-csv')
    expect(ids).toContain('citi')
    expect(ids).toContain('capital-one')
    expect(ids).toContain('bofa')
    expect(ids).toContain('wells-fargo')
    expect(ids).toContain('td-bank-csv')
  })

  it('does NOT contain PDF-only profiles', () => {
    const ids = CSV_PROFILES.map((p) => p.id)
    for (const pdfId of PDF_IDS) {
      expect(ids).not.toContain(pdfId)
    }
  })

  it('detects Amex CSV from header when passed CSV_PROFILES', () => {
    const pages: string[] = load('amex-csv-2026-06.pages.json')
    const result = detectBank(pages.join('\n'), null, CSV_PROFILES)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.profile.id).toBe('amex-csv')
  })

  it('detects Chase CSV when passed CSV_PROFILES', () => {
    const pages: string[] = load('chase-2026-06.pages.json')
    const result = detectBank(pages.join('\n'), null, CSV_PROFILES)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.profile.id).toBe('chase')
  })

  it('returns ok:false for PDF text (no CSV profile matches)', () => {
    const pdfText = 'American Express® Gold Card — Pay Over Time Limit $15,000'
    const result = detectBank(pdfText, null, CSV_PROFILES)
    expect(result.ok).toBe(false)
  })

  it('has no ambiguous overlaps — each fixture matches exactly one profile', () => {
    const fixtures = [
      { file: 'amex-csv-2026-06.pages.json', expectedId: 'amex-csv' },
      { file: 'citi-2026-06.pages.json', expectedId: 'citi' },
      { file: 'capital-one-2026-06.pages.json', expectedId: 'capital-one' },
      { file: 'bofa-2026-06.pages.json', expectedId: 'bofa' },
      { file: 'wellsfargo-2026-06.pages.json', expectedId: 'wells-fargo' },
      { file: 'td-bank-csv-2026-06.pages.json', expectedId: 'td-bank-csv' },
    ]
    for (const { file, expectedId } of fixtures) {
      const pages: string[] = load(file)
      const result = detectBank(pages.join('\n'), null, CSV_PROFILES)
      expect(result.ok, `${file} should match exactly one profile`).toBe(true)
      if (result.ok) expect(result.profile.id, `${file} should match ${expectedId}`).toBe(expectedId)
    }
  })
})
