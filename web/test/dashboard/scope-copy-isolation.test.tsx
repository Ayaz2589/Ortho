// @vitest-environment jsdom
//
// spec 056 US2 (C-8) — the "Everyone" → "Household" rename is confined to the
// DASHBOARD picker.
//
// `Everyone` is a SHARED i18n key with three consumers: MemberScopePicker (the
// dashboard), PlanScopeBar (the planning hub and the budgets page), and TxForm's
// "Who is this for?" segmented control. Renaming the key, or editing its five
// catalog translations, would silently reword two controls this spec explicitly
// protects. So the change is two call sites in ONE component and no catalog edit —
// `Household` already existed in all five catalogs.
//
// The planning and TxForm sides are also covered incidentally by their own suites
// (test/web/planning-hub.test.tsx, test/transactions/shared-default-form.test.tsx,
// test/budgets/budgets-page.test.tsx), which still assert "Everyone" and were left
// untouched. This file states the invariant directly so a future reader can see
// that the difference in wording is intentional rather than an oversight.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { HOUSEHOLD_SCOPE } from '@/lib/scope/moneyScope'

const ALICE = { id: 'p1', name: 'Alice', initial: 'A', color_key: 'sage', created_at: '' }
const BOB = { id: 'p2', name: 'Bob', initial: 'B', color_key: 'slate', created_at: '' }

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string) => k, householdMembers: [ALICE, BOB] }),
}))

import { MemberScopePicker } from '@/components/dashboard/MemberScopePicker'
import { PlanScopeBar } from '@/components/planning/PlanScopeBar'

afterEach(cleanup)

describe('scope-control copy', () => {
  it('the dashboard picker says Household', () => {
    render(<MemberScopePicker personId={null} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Household')
  })

  it('the planning scope bar still says Everyone', () => {
    render(<PlanScopeBar scope={HOUSEHOLD_SCOPE} onChange={vi.fn()} />)
    const bar = screen.getByRole('tablist')
    expect(within(bar).getByRole('tab', { name: 'Everyone' })).toBeTruthy()
    expect(within(bar).queryByRole('tab', { name: 'Household' })).toBeNull()
  })

  it('the two controls do not share their wording', () => {
    // Rendered together, the difference is the assertion: a single shared key
    // could not produce both words.
    render(
      <>
        <MemberScopePicker personId={null} onChange={vi.fn()} />
        <PlanScopeBar scope={HOUSEHOLD_SCOPE} onChange={vi.fn()} />
      </>
    )
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Household')
    expect(screen.getByRole('tab', { name: 'Everyone' })).toBeTruthy()
  })
})
