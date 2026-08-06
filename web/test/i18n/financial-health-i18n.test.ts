import { describe, it, expect } from 'vitest'
import bn from '@/lib/i18n/bn'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'

// spec 041 (FR-014) — every new Financial Health string is present in ALL five
// catalogs (English is the identity key; these are the translations), with matching
// {0}/{1}/… placeholder arity. Guards against the cross-catalog gap the NYC market
// analysis flagged. `Back`/`Settings`/`Remove` are reused pre-existing keys and are
// intentionally NOT in this list.

const FEATURE_KEYS = [
  // onboarding + form copy
  'We use this to understand how much room you have each month.',
  'Monthly take-home',
  'Income varies',
  'On a slow month',
  'Housing is usually the biggest fixed cost.',
  'Monthly housing cost',
  'Split with others',
  'Your share (%)',
  'Loan payments, family support, subscriptions you can’t cancel — your baseline commitments.',
  'Label',
  'Kind',
  'Add a commitment',
  'This helps us know how cautiously to score purchases.',
  'Emergency fund',
  'Monthly savings goal',
  'How much does each area matter to you? This shapes your score.',
  '{0} out of 5',
  'Living situation',
  // section titles
  'Income',
  'Housing',
  'Monthly commitments',
  'Safety net',
  'What matters to you',
  // housing options
  'Rent',
  'Own',
  'With family',
  'No housing cost',
  // emergency-fund options
  'None yet',
  'Less than 1 month',
  '1–3 months',
  '3–6 months',
  '6 months or more',
  // fixed-cost kinds
  'Family support / remittance',
  'Loan',
  'Phone',
  'Transit',
  'Childcare',
  'Subscription',
  'Other',
  // dimension labels
  'Cash flow',
  'Commitment load',
  'Savings momentum',
  'Planning',
  // onboarding chrome
  'Step {0} of {1}',
  'Financial health',
  'See my score',
  'Continue',
  'Skip for now', // spec 042 — relabeled from 'Skip — use neutral defaults' (Skip is now dismiss-only)
  // settings
  'Financial profile',
  'Update this whenever your situation changes.',
  'Save profile',
  'Saved',
  // widget
  'Set up your financial profile',
  'Answer a few questions to see your financial health.',
  '{0} out of 100',
  '{0} → {1} since {2}',
  'Your baseline financial-health score and next step.',
  // bands
  'Strong',
  'Steady',
  'Building',
  'Getting started',
  // action templates
  'Your spending is close to your income — trimming one recurring cost frees up room.',
  'Start a small emergency fund — a little each week builds a cushion.',
  'A lot of your income is committed — see if one fixed cost can be reduced or shared.',
  'Set aside a little each month — even a {0}% goal is a solid start.',
  'Set a budget for one category — it makes the rest easier to see.',
]

const catalogs = { bn, es, ja, zh, ko } as Record<string, Record<string, string>>

const placeholders = (s: string): string[] => (s.match(/\{\d+\}/g) ?? []).sort()

describe('Financial Health i18n (spec 041)', () => {
  for (const [lang, catalog] of Object.entries(catalogs)) {
    it(`${lang} has every new key with matching placeholders`, () => {
      const missing = FEATURE_KEYS.filter((k) => !(k in catalog))
      expect(missing, `missing keys in ${lang}`).toEqual([])
      for (const k of FEATURE_KEYS) {
        expect(placeholders(catalog[k] ?? ''), `placeholders for "${k}" in ${lang}`).toEqual(placeholders(k))
      }
    })
  }
})
