import { describe, it, expect } from 'vitest'
import {
  CATEGORIES,
  SPEND_CATEGORIES,
  categoryMeta,
  SEVERITY_ORDER,
  severityColor,
  PALETTE,
  paletteFor,
  deriveInitial,
} from '@/lib/categories'
import type { TransactionCategory, InsightSeverity } from '@/lib/types'

const ALL_CATEGORIES: TransactionCategory[] = [
  'coffee',
  'groceries',
  'dining',
  'subs',
  'fuel',
  'rent',
  'health',
  'income',
  'transit',
  'utilities',
  'entertainment',
]

const ALL_SEVERITIES: InsightSeverity[] = ['critical', 'warning', 'info', 'positive']

describe('CATEGORIES / categoryMeta', () => {
  it('has an entry for every TransactionCategory', () => {
    expect(Object.keys(CATEGORIES).sort()).toEqual([...ALL_CATEGORIES].sort())
  })

  it('every entry has a non-empty label, an icon, and a tint', () => {
    for (const c of ALL_CATEGORIES) {
      const meta = CATEGORIES[c]
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.icon).toBeTruthy()
      expect(meta.tint).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
    }
  })

  it('categoryMeta returns the same object as the CATEGORIES map', () => {
    for (const c of ALL_CATEGORIES) {
      expect(categoryMeta(c)).toBe(CATEGORIES[c])
    }
  })

  it('categoryMeta returns the expected label/tint for a known category', () => {
    expect(categoryMeta('coffee').label).toBe('Coffee')
    expect(categoryMeta('coffee').tint).toBe('rgb(203, 165, 132)')
    expect(categoryMeta('income').label).toBe('Income')
  })
})

describe('SPEND_CATEGORIES', () => {
  it('excludes income', () => {
    expect(SPEND_CATEGORIES).not.toContain('income')
  })

  it('is in the documented enum order (income removed)', () => {
    expect(SPEND_CATEGORIES).toEqual([
      'coffee',
      'groceries',
      'dining',
      'subs',
      'fuel',
      'rent',
      'health',
      'transit',
      'utilities',
      'entertainment',
    ])
  })

  it('contains exactly every category except income', () => {
    expect([...SPEND_CATEGORIES].sort()).toEqual(
      ALL_CATEGORIES.filter((c) => c !== 'income').sort()
    )
  })
})

describe('SEVERITY_ORDER', () => {
  it('orders critical < warning < info < positive', () => {
    expect(SEVERITY_ORDER.critical).toBeLessThan(SEVERITY_ORDER.warning)
    expect(SEVERITY_ORDER.warning).toBeLessThan(SEVERITY_ORDER.info)
    expect(SEVERITY_ORDER.info).toBeLessThan(SEVERITY_ORDER.positive)
  })

  it('has an entry for every severity', () => {
    expect(Object.keys(SEVERITY_ORDER).sort()).toEqual([...ALL_SEVERITIES].sort())
  })
})

describe('severityColor', () => {
  it('maps each severity to its CSS token', () => {
    expect(severityColor('critical')).toBe('var(--destructive)')
    expect(severityColor('warning')).toBe('var(--accent)')
    expect(severityColor('positive')).toBe('var(--positive)')
    expect(severityColor('info')).toBe('var(--text-2)')
  })
})

describe('PALETTE / paletteFor', () => {
  it('has six distinct keys', () => {
    const keys = PALETTE.map((p) => p.key)
    expect(keys).toEqual(['peach', 'slate', 'sage', 'terracotta', 'mauve', 'sand'])
    expect(new Set(keys).size).toBe(6)
  })

  it('every option has rgb bg and fg', () => {
    for (const opt of PALETTE) {
      expect(opt.bg).toMatch(/^rgb\(/)
      expect(opt.fg).toMatch(/^rgb\(/)
    }
  })

  it('paletteFor returns the matching option for a known key', () => {
    const slate = paletteFor('slate')
    expect(slate.key).toBe('slate')
    expect(slate).toBe(PALETTE[1])
  })

  it('paletteFor falls back to the first palette entry (peach) for unknown keys', () => {
    expect(paletteFor('nope')).toBe(PALETTE[0])
    expect(paletteFor('').key).toBe('peach')
  })
})

describe('deriveInitial', () => {
  it('uppercases the first letter of a simple name', () => {
    expect(deriveInitial('ayaz')).toBe('A')
    expect(deriveInitial('Ben')).toBe('B')
  })

  it('trims surrounding whitespace before deriving', () => {
    expect(deriveInitial('  zoe ')).toBe('Z')
  })

  it('joins single-letter joint names with "&" into "A+B"', () => {
    expect(deriveInitial('A & B')).toBe('A+B')
  })

  it('joins single-letter joint names with "+" into "A+B"', () => {
    expect(deriveInitial('a + b')).toBe('A+B')
  })

  it('does not treat multi-letter names as joint (only the first initial)', () => {
    expect(deriveInitial('Alice & Bob')).toBe('A')
  })

  it('returns a middot for empty/whitespace input', () => {
    expect(deriveInitial('')).toBe('·')
    expect(deriveInitial('   ')).toBe('·')
  })
})
