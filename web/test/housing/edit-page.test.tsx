// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Property } from '@/lib/types'

const H = vi.hoisted(() => ({
  expanded: false,
  properties: [] as Property[],
  loading: false,
  addProperty: vi.fn(),
  updateProperty: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: H.push, replace: H.replace }),
  usePathname: () => '/housing/edit',
}))
vi.mock('@/lib/useMediaQuery', () => ({ useIsExpanded: () => H.expanded }))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    properties: H.properties,
    loading: H.loading,
    addProperty: H.addProperty,
    updateProperty: H.updateProperty,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import EditPropertyPage from '@/app/(app)/housing/edit/page'

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

function setUrl(search: string) {
  window.history.replaceState({}, '', `/housing/edit${search}`)
}

beforeEach(() => {
  H.expanded = false
  H.properties = [RENTAL]
  H.loading = false
  H.addProperty.mockClear()
  H.updateProperty.mockClear()
  H.push.mockClear()
  H.replace.mockClear()
  setUrl('?id=prop-1')
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('EditPropertyPage (mobile)', () => {
  it('prefills from the store by id and Save updates the same property', async () => {
    const user = userEvent.setup()
    render(<EditPropertyPage />)

    const address = (await screen.findByPlaceholderText('e.g. 124 Oak Lane')) as HTMLInputElement
    expect(address.value).toBe('9 Birch St')

    await user.click(screen.getByRole('button', { name: 'Save property' }))
    expect(H.updateProperty).toHaveBeenCalledTimes(1)
    expect(H.updateProperty.mock.calls[0][0]).toMatchObject({ id: 'prop-1', kind: 'rental' })
    expect(H.push).toHaveBeenCalledWith('/housing')
  })

  it('redirects to the list when the id resolves to nothing', async () => {
    setUrl('?id=nope')
    render(<EditPropertyPage />)
    await vi.waitFor(() => expect(H.replace).toHaveBeenCalledWith('/housing'))
    expect(screen.queryByPlaceholderText('e.g. 124 Oak Lane')).toBeNull()
    expect(H.updateProperty).not.toHaveBeenCalled()
  })

  it('redirects to the list at desktop width', async () => {
    H.expanded = true
    render(<EditPropertyPage />)
    await vi.waitFor(() => expect(H.replace).toHaveBeenCalledWith('/housing'))
    expect(screen.queryByPlaceholderText('e.g. 124 Oak Lane')).toBeNull()
  })
})
