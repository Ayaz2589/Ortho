import { describe, it, expect } from 'vitest'
import bn from '@/lib/i18n/bn'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'

// spec 045 (FR-025) — every user-facing string this feature introduces is present
// in ALL five catalogs with matching {n} placeholder arity. Reused pre-existing
// keys (Goals / Contributions / Add contribution / New goal / Reached / {0} to go /
// of / Savings / Debt payoff / Planning / Amount / Date / Note / Save) are NOT
// re-listed here.

const FEATURE_KEYS = [
  'Saved over time',
  'By month',
  'Dashed line: steady pace to your target date.',
  'Add your first contribution to see how this goal builds up over time.',
  'Edit contribution',
  'Delete contribution',
  '{0} more',
]

// Retired with the goals index page. `catalog-reachability` fails on any key with
// no source literal left, so these removals are mandatory; they are asserted here
// too, so the REASON sits next to the keys rather than in a git blame.
//
//  - "View all goals" / "No goals yet" / "Name something you're saving toward…"
//    belonged to the index page and its empty state. The hub's own
//    "No goals yet — create one to start saving toward it." covers the empty case.
//  - "On track · due {0}" was the hub GoalRow's wording for the very same state
//    the shared GoalCard calls "On pace · due {0}". That drift is exactly why the
//    two collapsed into one component (research R7) — one of the pair had to go.
const REMOVED_KEYS = [
  'View all goals',
  'No goals yet',
  'Name something you’re saving toward or paying off, set a target, and track your progress.',
  'On track · due {0}',
]

const catalogs = { bn, es, ja, zh, ko } as Record<string, Record<string, string>>

const placeholders = (s: string): string[] => (s.match(/\{\d+\}/g) ?? []).sort()

describe('Goal detail & contribution editing i18n (spec 045)', () => {
  for (const [lang, catalog] of Object.entries(catalogs)) {
    it(`${lang} has every new key with matching placeholders`, () => {
      const missing = FEATURE_KEYS.filter((k) => !(k in catalog))
      expect(missing, `missing keys in ${lang}`).toEqual([])
      for (const k of FEATURE_KEYS) {
        expect(placeholders(catalog[k] ?? ''), `placeholders for "${k}" in ${lang}`).toEqual(
          placeholders(k)
        )
      }
    })

    it(`${lang} no longer carries the retired goals-index keys`, () => {
      expect(REMOVED_KEYS.filter((k) => k in catalog)).toEqual([])
    })
  }
})
