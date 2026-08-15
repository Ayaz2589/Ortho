// @vitest-environment jsdom
//
// spec 045 US3 — ContributionForm gains an edit mode. Contract C4.
//
// The load-bearing case is the last one: opening a contribution in a non-USD
// display currency and saving it UNTOUCHED must write back the stored cents
// exactly. Without that guard the cents→display→cents round trip silently changes
// the household's saved total — at GBP 0.78, centsToDisplay(2) is "0.02" and
// parseMoney("0.02") is 3. This is the same failure `useTxForm`'s
// `originalAmountText` guard exists to prevent (spec 023 B1).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Goal, GoalContribution } from '@/lib/types'

const addContribution = vi.fn()
const updateContribution = vi.fn()

const store = {
  currency: 'usd',
  rate: () => 1,
  currentUserId: 'u1',
  addContribution,
  updateContribution,
  t: (k: string, ...a: Array<string | number>) =>
    a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
}
vi.mock('@/lib/store', () => ({ useApp: () => store }))

import { ContributionForm } from '@/components/goals/ContributionForm'

const GOAL = { id: 'g1', name: 'Emergency fund' } as Goal

const CONTRIB: GoalContribution = {
  id: 'c1',
  goal_id: 'g1',
  amount_cents: 5000,
  date: '2026-03-01',
  note: 'bonus',
  created_by: 'u-other',
  created_at: '2026-03-01T00:00:00.000Z',
}

const amountField = () => screen.getByLabelText(/Amount/i) as HTMLInputElement
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

beforeEach(() => {
  store.currency = 'usd'
  store.rate = () => 1
  addContribution.mockClear()
  updateContribution.mockClear()
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(cleanup)

describe('ContributionForm — add mode is unchanged', () => {
  it('starts empty and adds a new contribution', () => {
    render(<ContributionForm goal={GOAL} onClose={vi.fn()} />)
    expect(amountField().value).toBe('')

    fireEvent.change(amountField(), { target: { value: '12.50' } })
    save()

    expect(addContribution).toHaveBeenCalledTimes(1)
    expect(updateContribution).not.toHaveBeenCalled()
    expect(addContribution.mock.calls[0][0]).toMatchObject({ goal_id: 'g1', amount_cents: 1250 })
  })
})

describe('ContributionForm — edit mode', () => {
  it('pre-fills amount, date and note from the stored contribution', () => {
    render(<ContributionForm goal={GOAL} editing={CONTRIB} onClose={vi.fn()} />)
    expect(amountField().value).toBe('50.00')
    // The date field is a popover trigger, not an input — assert what it displays.
    expect(screen.getByRole('button', { name: /Contribution date/i }).textContent).toMatch(/Mar/)
    expect(screen.getByDisplayValue('bonus')).toBeTruthy()
  })

  it('saves the pre-filled date unchanged when only the amount is edited', () => {
    render(<ContributionForm goal={GOAL} editing={CONTRIB} onClose={vi.fn()} />)
    fireEvent.change(amountField(), { target: { value: '75.00' } })
    save()
    expect((updateContribution.mock.calls[0][0] as GoalContribution).date).toBe('2026-03-01')
  })

  it('saves through updateContribution, preserving identity', () => {
    render(<ContributionForm goal={GOAL} editing={CONTRIB} onClose={vi.fn()} />)
    fireEvent.change(amountField(), { target: { value: '75.00' } })
    save()

    expect(addContribution).not.toHaveBeenCalled()
    expect(updateContribution).toHaveBeenCalledTimes(1)
    expect(updateContribution.mock.calls[0][0]).toEqual({
      ...CONTRIB,
      amount_cents: 7500,
    })
  })

  it('keeps created_by and created_at from the original, not the current user', () => {
    render(<ContributionForm goal={GOAL} editing={CONTRIB} onClose={vi.fn()} />)
    fireEvent.change(amountField(), { target: { value: '75.00' } })
    save()
    const saved = updateContribution.mock.calls[0][0] as GoalContribution
    expect(saved.created_by).toBe('u-other')
    expect(saved.created_at).toBe('2026-03-01T00:00:00.000Z')
    expect(saved.id).toBe('c1')
    expect(saved.goal_id).toBe('g1')
  })

  it('stores an emptied note as null', () => {
    render(<ContributionForm goal={GOAL} editing={CONTRIB} onClose={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('bonus'), { target: { value: '   ' } })
    save()
    expect((updateContribution.mock.calls[0][0] as GoalContribution).note).toBeNull()
  })

  it('blocks saving a cleared amount, leaving the stored row untouched', () => {
    render(<ContributionForm goal={GOAL} editing={CONTRIB} onClose={vi.fn()} />)
    fireEvent.change(amountField(), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    save()
    expect(updateContribution).not.toHaveBeenCalled()
  })

  it('blocks saving a zero amount', () => {
    render(<ContributionForm goal={GOAL} editing={CONTRIB} onClose={vi.fn()} />)
    fireEvent.change(amountField(), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    save()
    expect(updateContribution).not.toHaveBeenCalled()
  })

  it('MONEY INVARIANT: an untouched amount in GBP saves the stored cents verbatim', () => {
    // 11¢ at 0.78 round-trips lossily: display "0.09" re-parses to 12¢.
    store.currency = 'gbp'
    store.rate = () => 0.78
    const odd: GoalContribution = { ...CONTRIB, amount_cents: 11 }

    render(<ContributionForm goal={GOAL} editing={odd} onClose={vi.fn()} />)
    save() // nothing touched

    expect(updateContribution).toHaveBeenCalledTimes(1)
    expect((updateContribution.mock.calls[0][0] as GoalContribution).amount_cents).toBe(11)
  })

  it('still parses the field when the amount IS touched, in GBP', () => {
    store.currency = 'gbp'
    store.rate = () => 0.78
    render(<ContributionForm goal={GOAL} editing={CONTRIB} onClose={vi.fn()} />)
    fireEvent.change(amountField(), { target: { value: '78.00' } })
    save()
    // £78.00 at 0.78 → $100.00 → 10000¢
    expect((updateContribution.mock.calls[0][0] as GoalContribution).amount_cents).toBe(10000)
  })

  it('re-seeds when a different contribution is opened', () => {
    const { rerender } = render(<ContributionForm goal={GOAL} editing={CONTRIB} onClose={vi.fn()} />)
    expect(amountField().value).toBe('50.00')
    rerender(
      <ContributionForm goal={GOAL} editing={{ ...CONTRIB, id: 'c2', amount_cents: 2500 }} onClose={vi.fn()} />
    )
    expect(amountField().value).toBe('25.00')
  })
})
