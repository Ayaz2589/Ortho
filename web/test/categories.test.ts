import { describe, it, expect } from 'vitest'
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  SPEND_CATEGORIES,
  INCOME_CATEGORIES,
  categoryMeta,
  SEVERITY_ORDER,
  severityColor,
  PALETTE,
  paletteFor,
  deriveInitial,
} from '@/lib/categories'
import type { TransactionCategory, InsightSeverity } from '@/lib/types'

// All 40 pickable slugs + transfer = 41 total
const ALL_EXPENSE_SLUGS: TransactionCategory[] = [
  // Food & Drink
  'coffee', 'groceries', 'dining', 'fast_food', 'alcohol', 'takeout',
  // Transport
  'transit', 'fuel', 'parking', 'rideshare',
  // Home
  'rent', 'utilities', 'home_improvement', 'insurance',
  // Health & Wellness
  'health', 'gym', 'pharmacy', 'mental_health',
  // Entertainment
  'entertainment', 'streaming', 'gaming', 'events',
  // Shopping
  'clothing', 'electronics', 'personal_care', 'gifts',
  // Subscriptions
  'subs',
  // Education
  'education', 'books',
]

const ALL_INCOME_SLUGS: TransactionCategory[] = [
  'income', 'salary', 'bonus', 'freelance', 'business_income',
  'dividends', 'rental_income', 'gift_received', 'refund', 'other_income',
]

const ALL_CATEGORIES: TransactionCategory[] = [
  ...ALL_EXPENSE_SLUGS,
  ...ALL_INCOME_SLUGS,
  'transfer',
]

const ALL_SEVERITIES: InsightSeverity[] = ['critical', 'warning', 'info', 'positive']

describe('CATEGORIES / categoryMeta', () => {
  it('has an entry for every TransactionCategory (40 pickable + transfer = 41)', () => {
    expect(Object.keys(CATEGORIES).sort()).toEqual([...ALL_CATEGORIES].sort())
  })

  it('every entry has a non-empty label, an icon, a tint, and a parent', () => {
    for (const c of ALL_CATEGORIES) {
      const meta = CATEGORIES[c]
      expect(meta.label.length, `${c} missing label`).toBeGreaterThan(0)
      expect(meta.icon, `${c} missing icon`).toBeTruthy()
      expect(meta.tint, `${c} missing tint`).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
      expect(meta.parent, `${c} missing parent`).toBeTruthy()
    }
  })

  it('categoryMeta returns the same object as the CATEGORIES map', () => {
    for (const c of ALL_CATEGORIES) {
      expect(categoryMeta(c)).toBe(CATEGORIES[c])
    }
  })

  it('categoryMeta returns the expected label/tint for known categories', () => {
    expect(categoryMeta('coffee').label).toBe('Coffee')
    expect(categoryMeta('coffee').tint).toBe('rgb(203, 165, 132)')
    expect(categoryMeta('income').label).toBe('Income')
    expect(categoryMeta('salary').label).toBe('Salary')
    expect(categoryMeta('fast_food').label).toBe('Fast Food')
    expect(categoryMeta('rideshare').label).toBe('Rideshare')
  })

  it('original slugs retain their exact original labels and tints (regression lock)', () => {
    expect(categoryMeta('coffee').tint).toBe('rgb(203, 165, 132)')
    expect(categoryMeta('groceries').label).toBe('Groceries')
    expect(categoryMeta('dining').label).toBe('Dining')
    expect(categoryMeta('subs').label).toBe('Subscriptions')
    expect(categoryMeta('fuel').label).toBe('Fuel')
    expect(categoryMeta('rent').label).toBe('Rent')
    expect(categoryMeta('health').label).toBe('Health')
    expect(categoryMeta('transit').label).toBe('Transit')
    expect(categoryMeta('utilities').label).toBe('Utilities')
    expect(categoryMeta('entertainment').label).toBe('Entertainment')
  })
})

describe('SPEND_CATEGORIES', () => {
  it('excludes income and all income subcategory slugs', () => {
    for (const s of ALL_INCOME_SLUGS) {
      expect(SPEND_CATEGORIES, `SPEND_CATEGORIES must not contain income slug "${s}"`).not.toContain(s)
    }
  })

  it('excludes transfer', () => {
    expect(SPEND_CATEGORIES).not.toContain('transfer')
  })

  it('contains all 29 expense subcategory slugs', () => {
    expect(SPEND_CATEGORIES).toHaveLength(29)
    for (const s of ALL_EXPENSE_SLUGS) {
      expect(SPEND_CATEGORIES, `SPEND_CATEGORIES missing "${s}"`).toContain(s)
    }
  })

  it('starts with original slugs in the food_drink group', () => {
    expect(SPEND_CATEGORIES[0]).toBe('coffee')
    expect(SPEND_CATEGORIES[1]).toBe('groceries')
    expect(SPEND_CATEGORIES[2]).toBe('dining')
  })

  it('equals the union of all CATEGORY_GROUPS.expense children', () => {
    const fromGroups = CATEGORY_GROUPS.expense.flatMap((g) => g.children)
    expect([...SPEND_CATEGORIES].sort()).toEqual([...fromGroups].sort())
  })
})

describe('INCOME_CATEGORIES', () => {
  it('contains all required income slugs', () => {
    const required: TransactionCategory[] = [
      'salary', 'bonus', 'freelance', 'business_income',
      'dividends', 'rental_income', 'gift_received', 'refund', 'other_income', 'income',
    ]
    expect(INCOME_CATEGORIES).toHaveLength(10)
    for (const s of required) {
      expect(INCOME_CATEGORIES, `INCOME_CATEGORIES missing "${s}"`).toContain(s)
    }
  })

  it('does not contain any expense slug or transfer', () => {
    for (const s of ALL_EXPENSE_SLUGS) {
      expect(INCOME_CATEGORIES, `INCOME_CATEGORIES must not contain expense slug "${s}"`).not.toContain(s)
    }
    expect(INCOME_CATEGORIES).not.toContain('transfer')
  })

  it('equals the union of all CATEGORY_GROUPS.income children', () => {
    const fromGroups = CATEGORY_GROUPS.income.flatMap((g) => g.children)
    expect([...INCOME_CATEGORIES].sort()).toEqual([...fromGroups].sort())
  })
})

describe('CATEGORY_GROUPS', () => {
  it('has expense and income arrays', () => {
    expect(Array.isArray(CATEGORY_GROUPS.expense)).toBe(true)
    expect(Array.isArray(CATEGORY_GROUPS.income)).toBe(true)
  })

  it('expense has 8 groups', () => {
    expect(CATEGORY_GROUPS.expense).toHaveLength(8)
  })

  it('income has 3 groups', () => {
    expect(CATEGORY_GROUPS.income).toHaveLength(3)
  })

  it('every group has a key, label, and non-empty children array', () => {
    for (const g of [...CATEGORY_GROUPS.expense, ...CATEGORY_GROUPS.income]) {
      expect(g.key, `group missing key`).toBeTruthy()
      expect(g.label, `${g.key} missing label`).toBeTruthy()
      expect(g.children.length, `${g.key} has no children`).toBeGreaterThan(0)
    }
  })

  it('no slug appears in both expense and income groups', () => {
    const expenseSlugs = new Set(CATEGORY_GROUPS.expense.flatMap((g) => g.children))
    const incomeSlugs = CATEGORY_GROUPS.income.flatMap((g) => g.children)
    for (const s of incomeSlugs) {
      expect(expenseSlugs.has(s), `"${s}" appears in both expense and income groups`).toBe(false)
    }
  })

  it('transfer does not appear in any group', () => {
    const allGroupSlugs = [
      ...CATEGORY_GROUPS.expense.flatMap((g) => g.children),
      ...CATEGORY_GROUPS.income.flatMap((g) => g.children),
    ]
    expect(allGroupSlugs).not.toContain('transfer')
  })

  it('Food & Drink group contains original food slugs plus new ones', () => {
    const foodGroup = CATEGORY_GROUPS.expense.find((g) => g.key === 'food_drink')
    expect(foodGroup).toBeDefined()
    expect(foodGroup!.children).toContain('coffee')
    expect(foodGroup!.children).toContain('groceries')
    expect(foodGroup!.children).toContain('dining')
    expect(foodGroup!.children).toContain('fast_food')
    expect(foodGroup!.children).toContain('alcohol')
    expect(foodGroup!.children).toContain('takeout')
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
