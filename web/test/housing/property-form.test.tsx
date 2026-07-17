// @vitest-environment jsdom
//
// Desktop-parity lock for the PropertyForm extraction (spec 025): the desktop
// AddPropertyModal (Drawer) still renders the shared form body and submits via
// the same addProperty/updateProperty store actions after the body was pulled
// out into <PropertyForm>.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Property } from '@/lib/types'

const H = vi.hoisted(() => ({ addProperty: vi.fn(), updateProperty: vi.fn() }))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    addProperty: H.addProperty,
    updateProperty: H.updateProperty,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { AddPropertyModal } from '@/components/housing/AddPropertyModal'

const RENTAL: Property = {
  id: 'prop-1',
  household_id: 'h1',
  kind: 'rental',
  address: '9 Birch St',
  nickname: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  lease: {
    property_id: 'prop-1',
    monthly_rent_cents: 200000,
    lease_start: '2026-01-01',
    lease_end: '2027-01-01',
    security_deposit_cents: null,
    paid_with_source: null,
  },
  units: [],
}

beforeEach(() => {
  H.addProperty.mockClear()
  H.updateProperty.mockClear()
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => {})

describe('AddPropertyModal desktop parity after PropertyForm extraction', () => {
  it('creates a rental via addProperty', async () => {
    const user = userEvent.setup()
    render(<AddPropertyModal open kind="rental" onClose={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('e.g. 124 Oak Lane'), '5 Cedar Ct')
    await user.type(screen.getByPlaceholderText('0'), '1800')
    await user.click(screen.getByRole('button', { name: 'Add property' }))

    expect(H.addProperty).toHaveBeenCalledTimes(1)
    expect(H.addProperty.mock.calls[0][0]).toMatchObject({ kind: 'rental', address: '5 Cedar Ct' })
  })

  it('prefills from an editing property and saves via updateProperty (same id)', async () => {
    const user = userEvent.setup()
    render(<AddPropertyModal open kind="rental" editing={RENTAL} onClose={vi.fn()} />)

    expect((screen.getByPlaceholderText('e.g. 124 Oak Lane') as HTMLInputElement).value).toBe('9 Birch St')
    await user.click(screen.getByRole('button', { name: 'Save property' }))

    expect(H.updateProperty).toHaveBeenCalledTimes(1)
    expect(H.updateProperty.mock.calls[0][0]).toMatchObject({ id: 'prop-1', kind: 'rental' })
  })
})
