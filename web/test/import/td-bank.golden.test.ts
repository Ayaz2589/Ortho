import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tdBank } from '../../scripts/import/profiles/td-bank'
import { reconcile } from '../../scripts/import/engine/reconcile'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('TD Bank golden parse', () => {
  const pages: string[] = load('td-bank-2026-05.pages.json')
  const expected = load('td-bank-2026-05.expected.json')
  // Normalize Date → ISO string the same way persistence/JSON would.
  const parsed = JSON.parse(JSON.stringify(tdBank.parse(pages)))

  it('parses the statement exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('reconciles every section to its printed subtotal', () => {
    const result = reconcile(tdBank.parse(pages).sections)
    expect(result.ok).toBe(true)
  })

  it('detects TD Bank from the fixture text', () => {
    expect(tdBank.detect(pages.join('\n'))).toBe(true)
  })

  it('extracts the expected 29 activity rows across 7 sections', () => {
    const stmt = tdBank.parse(pages)
    expect(stmt.sections).toHaveLength(7)
    expect(stmt.sections.reduce((n, s) => n + s.rows.length, 0)).toBe(29)
  })
})
