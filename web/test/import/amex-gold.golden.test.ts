import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { amexGold } from '../../scripts/import/profiles/amex-gold'
import { reconcile } from '../../scripts/import/engine/reconcile'

const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'))

describe('Amex Gold golden parse', () => {
  const pages: string[] = load('amex-gold-2026-05.pages.json')
  const expected = load('amex-gold-2026-05.expected.json')
  const parsed = JSON.parse(JSON.stringify(amexGold.parse(pages)))

  it('parses the statement exactly as the golden fixture', () => {
    expect(parsed).toEqual(expected)
  })

  it('reconciles both sections against the printed totals', () => {
    expect(reconcile(amexGold.parse(pages).sections).ok).toBe(true)
  })

  it('detects Amex Gold from the statement', () => {
    expect(amexGold.detect(pages.join('\n'))).toBe(true)
  })

  it('imports 125 charges and excludes the 2 payments/credits', () => {
    const [payCred, charges] = amexGold.parse(pages).sections
    expect(charges.rows).toHaveLength(125)
    expect(payCred.rows).toHaveLength(2)
    expect(payCred.rows.every((r) => r.excluded)).toBe(true)
    expect(payCred.rows.map((r) => r.excludeReason).sort()).toEqual(['card-payment', 'credit'])
  })

  it('attributes each charge to its statement card member', () => {
    const charges = amexGold.parse(pages).sections[1].rows
    expect(charges.filter((r) => r.cardMember === 'AYAZ UDDIN')).toHaveLength(86)
    expect(charges.filter((r) => r.cardMember === 'TASNUVA AHMED')).toHaveLength(39)
  })
})
