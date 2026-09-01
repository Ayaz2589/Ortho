// @vitest-environment jsdom
//
// spec 059 US4 — the three derived blocks that replace the old page's
// information-free charts: a what-if table where a static number used to be, a
// pace chart with a plan line to be level with, and a consistency strip.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Goal, GoalContribution } from '@/lib/types'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    locale: 'en-US',
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { goalProjection, whatIfScenarios } from '@/lib/finance/goalProjection'
import { goalProgress } from '@/lib/finance/goals'
import { ProjectedFinishBlock } from '@/components/goals/detail/ProjectedFinishBlock'
import { PaceAgainstPlanBlock } from '@/components/goals/detail/PaceAgainstPlanBlock'
import { ConsistencyBlock } from '@/components/goals/detail/ConsistencyBlock'

const NOW = new Date(2026, 7, 15)

const goal = (over: Partial<Goal> = {}): Goal =>
  ({
    id: 'g1',
    household_id: 'h1',
    name: 'Tasnuva Owes Ayaz',
    kind: 'debt_payoff',
    target_cents: 1_750_000,
    target_date: null,
    linked_account_id: null,
    linked_category: null,
    created_by: 'u1',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    ...over,
  }) as Goal

const contrib = (date: string, cents: number): GoalContribution => ({
  id: date,
  goal_id: 'g1',
  amount_cents: cents,
  date,
  note: null,
  created_by: 'u1',
  created_at: `${date}T00:00:00.000Z`,
})

const steady = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'].map(
  (d) => contrib(d, 60_000)
)

/** The handoff's uneven-pace study: short months, a skip, and an over-payment. */
const uneven = [
  contrib('2026-01-01', 142_800),
  contrib('2026-02-01', 142_800),
  contrib('2026-03-01', 70_000),
  contrib('2026-04-01', 142_800),
  contrib('2026-06-01', 180_000),
  contrib('2026-07-01', 90_000),
  contrib('2026-08-01', 142_800),
]

function project(g: Goal, cs: GoalContribution[]) {
  const projection = goalProjection(g, cs, NOW)
  const remaining = goalProgress(g.target_cents, cs).remaining_cents
  return { projection, remaining, rows: whatIfScenarios(projection, remaining, NOW) }
}

afterEach(cleanup)

describe('ProjectedFinishBlock', () => {
  it('leads with the finish month and the number of months', () => {
    const { projection, rows } = project(goal(), steady)
    render(<ProjectedFinishBlock goal={goal()} projection={projection} scenarios={rows} now={NOW} />)
    const header = screen.getByTestId('block-projected-finish-value')
    expect(header).toHaveTextContent('July 2028')
    expect(header).toHaveTextContent('23 months')
  })

  it('marks a sooner scenario as an improvement and leaves a later one plain', () => {
    const { projection, rows } = project(goal(), steady)
    render(<ProjectedFinishBlock goal={goal()} projection={projection} scenarios={rows} now={NOW} />)

    const deltas = screen.getAllByTestId('whatif-delta')
    const sooner = deltas.find((d) => /sooner/.test(d.textContent ?? ''))!
    const later = deltas.find((d) => /later/.test(d.textContent ?? ''))!

    expect(sooner.style.color).toBe('var(--positive)')
    // A later date must never read more alarmingly than an earlier one — it is
    // the same muted shade as any neutral value, and never a warning.
    expect(later.style.color).toBe('var(--text-3)')
  })

  it('offers keep / pay more / skip a month when on plan', () => {
    const { projection, rows } = project(goal(), steady)
    render(<ProjectedFinishBlock goal={goal()} projection={projection} scenarios={rows} now={NOW} />)

    const scenarios = screen.getAllByTestId('whatif-scenario').map((s) => s.textContent ?? '')
    expect(scenarios[0]).toMatch(/Keep paying \$600\.00/)
    expect(scenarios[1]).toMatch(/\$750\.00/)
    expect(scenarios[2]).toMatch(/\$1000\.00/)
    expect(scenarios[3]).toMatch(/Skip one month/)
  })

  it('names the recent average as the basis when off plan, and the plan as an improvement', () => {
    const g = goal({ target_cents: 2_300_000 })
    const { projection, rows } = project(g, uneven)
    expect(projection.basis).toBe('recent_average')

    render(<ProjectedFinishBlock goal={g} projection={projection} scenarios={rows} now={NOW} />)
    const scenarios = screen.getAllByTestId('whatif-scenario').map((s) => s.textContent ?? '')
    expect(scenarios[0]).toMatch(/At your recent average/)
    expect(scenarios[1]).toMatch(/At the planned/)

    const deltas = screen.getAllByTestId('whatif-delta')
    expect(deltas[1].textContent).toMatch(/sooner/)
  })

  it('renders nothing at all when the projection was refused', () => {
    const { projection, rows } = project(goal(), steady.slice(0, 2))
    const { container } = render(
      <ProjectedFinishBlock goal={goal()} projection={projection} scenarios={rows} now={NOW} />
    )
    expect(container.textContent).toBe('')
  })
})

describe('PaceAgainstPlanBlock', () => {
  it('draws one bar per contribution month and counts the on-plan ones', () => {
    const { projection } = project(goal(), steady)
    render(<PaceAgainstPlanBlock projection={projection} />)
    expect(screen.getAllByTestId('pace-bar')).toHaveLength(7)
    expect(screen.getByTestId('block-pace-value')).toHaveTextContent('7 of 7')
  })

  it('reads identical bars as good news, because there is now a plan line', () => {
    const { projection } = project(goal(), steady)
    render(<PaceAgainstPlanBlock projection={projection} />)
    expect(screen.getByTestId('pace-reading')).toHaveTextContent('matched the plan')
  })

  it('draws an over-plan month taller than the plan line rather than clamping it', () => {
    const { projection } = project(goal({ target_cents: 2_300_000 }), uneven)
    render(<PaceAgainstPlanBlock projection={projection} />)

    const bars = screen.getAllByTestId('pace-bar')
    const heights = bars.map((b) => parseFloat(b.style.height))
    const planHeight = parseFloat(screen.getByTestId('pace-plan-line').style.bottom)
    // June was $1,800 against a $1,428 plan.
    expect(Math.max(...heights)).toBeGreaterThan(planHeight)
  })

  it('draws a missed month at zero height with no stub', () => {
    const { projection } = project(goal({ target_cents: 2_300_000 }), uneven)
    render(<PaceAgainstPlanBlock projection={projection} />)
    const bars = screen.getAllByTestId('pace-bar')
    expect(bars[4].style.height).toBe('0px') // May, skipped
  })

  it('says in one sentence why the projection sits where it does, when off plan', () => {
    const { projection } = project(goal({ target_cents: 2_300_000 }), uneven)
    render(<PaceAgainstPlanBlock projection={projection} />)
    const reading = screen.getByTestId('pace-reading').textContent ?? ''
    expect(reading).toMatch(/short/)
    expect(reading).toMatch(/skipped/)
  })
})

describe('PaceAgainstPlanBlock — the plan line is a real reference', () => {
  it('keeps an on-plan bar level with the plan line even when one month towers over it', () => {
    // The plan line used to be pinned at a fixed height while the bars were
    // rescaled to fit the tallest month. One $1,800 catch-up against a $600 plan
    // pushed every perfect month to under half the line's height — while the
    // reading beside it still said "on plan".
    const contributions = [
      contrib('2026-02-01', 60_000),
      contrib('2026-03-01', 60_000),
      contrib('2026-04-01', 180_000), // catch-up
      contrib('2026-05-01', 60_000),
      contrib('2026-06-01', 60_000),
    ]
    const { projection } = project(goal(), contributions)
    render(<PaceAgainstPlanBlock projection={projection} />)

    const bars = screen.getAllByTestId('pace-bar')
    const planBottom = parseFloat(screen.getByTestId('pace-plan-line').style.bottom)
    const onPlanHeight = parseFloat(bars[0].style.height)

    expect(onPlanHeight).toBeCloseTo(planBottom, 0)
    expect(parseFloat(bars[2].style.height)).toBeGreaterThan(planBottom)
  })

  it('does not claim every payment matched exactly when some months went over', () => {
    // "Over" counts as on plan for the COUNT, but it is not "matched the plan
    // exactly" — the bars visibly differ in height.
    // Runs right up to the reference month, so nothing reads as missed — the
    // only deviation is the one month that went OVER.
    const contributions = [
      contrib('2026-02-01', 60_000),
      contrib('2026-03-01', 90_000),
      contrib('2026-04-01', 60_000),
      contrib('2026-05-01', 60_000),
      contrib('2026-06-01', 60_000),
      contrib('2026-07-01', 60_000),
      contrib('2026-08-01', 60_000),
    ]
    const { projection } = project(goal(), contributions)
    expect(projection.months.some((m) => m.status === 'over')).toBe(true)
    expect(projection.months.some((m) => m.status === 'missed')).toBe(false)
    render(<PaceAgainstPlanBlock projection={projection} />)

    const reading = screen.getByTestId('pace-reading').textContent ?? ''
    expect(reading).not.toMatch(/matched the plan exactly/)
    expect(reading).not.toMatch(/0 months came in short/)
    expect(reading).toMatch(/beyond|more than|above/i)
  })

  it('bounds the strip so a long-running item stays legible', () => {
    // One cell per month since the first contribution is unbounded: a three-year
    // payoff renders 36 columns in a reading column, most of it gaps.
    const many = Array.from({ length: 30 }, (_, i) => {
      const year = 2024 + Math.floor(i / 12)
      const month = String((i % 12) + 1).padStart(2, '0')
      return contrib(`${year}-${month}-01`, 60_000)
    })
    const { projection } = project(goal({ target_cents: 10_000_000 }), many)
    render(<PaceAgainstPlanBlock projection={projection} />)
    expect(screen.getAllByTestId('pace-bar').length).toBeLessThanOrEqual(12)
  })
})

describe('ConsistencyBlock', () => {
  it('shows one cell per month and states the streak', () => {
    const { projection } = project(goal(), steady)
    render(<ConsistencyBlock projection={projection} />)
    expect(screen.getAllByTestId('consistency-cell')).toHaveLength(7)
    expect(screen.getByTestId('block-consistency-value')).toHaveTextContent('7-month')
  })

  it('reads a missed month by absence and an outline, never by colour', () => {
    const { projection } = project(goal({ target_cents: 2_300_000 }), uneven)
    render(<ConsistencyBlock projection={projection} />)

    const missed = screen.getAllByTestId('consistency-cell')[4] // May
    expect(missed.style.background).toBe('transparent')
    expect(missed.style.border).toContain('dashed')
  })

  it('dims an under-plan month rather than flagging it', () => {
    const { projection } = project(goal({ target_cents: 2_300_000 }), uneven)
    render(<ConsistencyBlock projection={projection} />)

    const cells = screen.getAllByTestId('consistency-cell')
    const march = cells[2] // $700 against a $1,428 plan
    const january = cells[0] // on plan
    expect(parseFloat(march.style.opacity)).toBeLessThan(parseFloat(january.style.opacity))
    expect(march.style.background).toBe(january.style.background)
  })

  it('names the missed and under-plan months in one calm sentence', () => {
    const { projection } = project(goal({ target_cents: 2_300_000 }), uneven)
    render(<ConsistencyBlock projection={projection} />)
    const reading = screen.getByTestId('consistency-reading').textContent ?? ''
    expect(reading).toMatch(/Missed/)
    expect(reading).toMatch(/May/)
  })

  it('bounds the strip so a long-running item stays legible', () => {
    const many = Array.from({ length: 30 }, (_, i) => {
      const year = 2024 + Math.floor(i / 12)
      const month = String((i % 12) + 1).padStart(2, '0')
      return contrib(`${year}-${month}-01`, 60_000)
    })
    const { projection } = project(goal({ target_cents: 10_000_000 }), many)
    render(<ConsistencyBlock projection={projection} />)
    expect(screen.getAllByTestId('consistency-cell').length).toBeLessThanOrEqual(12)
  })

  it('says so plainly when nothing has been missed', () => {
    const { projection } = project(goal(), steady)
    render(<ConsistencyBlock projection={projection} />)
    expect(screen.getByTestId('consistency-reading')).toHaveTextContent('No missed months')
  })
})
