import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { goalProgress, goalPacing, type GoalProgress, type GoalPacing } from '@/lib/finance/goals'

// Regression vectors for the savings-goal engine (spec 027). Generated from the TS
// implementation by `npm run gen:vectors`; this suite asserts the engine still
// reproduces them (a single-implementation pinning check, per docs/shared.md).
// Integer USD cents; the reference "today" is injected — timezone-stable.

interface ProgressCase {
  input: { name: string; target_cents: number; contributions: number[] }
  expected: GoalProgress
}
interface PacingCase {
  input: {
    name: string
    target_cents: number
    target_date: string | null
    start: string
    saved_cents: number
    now: string
  }
  expected: GoalPacing
}

const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../shared/test-vectors/goals.json'), 'utf8')
) as { progress: ProgressCase[]; pacing: PacingCase[] }

describe('goal progress golden vectors', () => {
  for (const { input, expected } of vectors.progress) {
    it(input.name, () => {
      const got = goalProgress(
        input.target_cents,
        input.contributions.map((amount_cents) => ({ amount_cents }))
      )
      expect(got).toEqual(expected)
    })
  }
})

describe('goal pacing golden vectors', () => {
  for (const { input, expected } of vectors.pacing) {
    it(input.name, () => {
      const got = goalPacing(
        input.target_cents,
        input.target_date,
        input.start,
        input.saved_cents,
        new Date(input.now)
      )
      expect(got).toEqual(expected)
    })
  }
})
