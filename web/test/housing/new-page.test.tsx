// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const H = vi.hoisted(() => ({
  expanded: false,
  addProperty: vi.fn(),
  updateProperty: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: H.push, replace: H.replace }),
  usePathname: () => '/housing/new',
}))
vi.mock('@/lib/useMediaQuery', () => ({ useIsExpanded: () => H.expanded }))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currency: 'usd',
    rate: () => 1,
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    properties: [],
    loading: false,
    addProperty: H.addProperty,
    updateProperty: H.updateProperty,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import NewPropertyPage from '@/app/(app)/housing/new/page'

function setUrl(search: string) {
  window.history.replaceState({}, '', `/housing/new${search}`)
}

beforeEach(() => {
  H.expanded = false
  H.addProperty.mockClear()
  H.updateProperty.mockClear()
  H.push.mockClear()
  H.replace.mockClear()
  setUrl('')
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    // @ts-expect-error test shim
    globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' }
  }
})
afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('NewPropertyPage (mobile)', () => {
  it('shows the kind step first, then the form, and Save creates + navigates', async () => {
    const user = userEvent.setup()
    render(<NewPropertyPage />)

    // Step 1: the kind picker (no address field yet).
    await screen.findByText('New property')
    expect(screen.queryByPlaceholderText('e.g. 124 Oak Lane')).toBeNull()

    // Choose "Rental".
    await user.click(screen.getByText('You rent your home'))

    // Step 2: the rental form.
    await user.type(await screen.findByPlaceholderText('e.g. 124 Oak Lane'), '5 Cedar Ct')
    await user.type(screen.getByPlaceholderText('0'), '1800')
    await user.click(screen.getByRole('button', { name: 'Add property' }))

    expect(H.addProperty).toHaveBeenCalledTimes(1)
    expect(H.addProperty.mock.calls[0][0]).toMatchObject({ kind: 'rental', address: '5 Cedar Ct' })
    expect(H.push).toHaveBeenCalledWith('/housing')
  })

  it('skips the kind step when ?kind is provided', async () => {
    setUrl('?kind=rental')
    render(<NewPropertyPage />)
    expect(await screen.findByPlaceholderText('e.g. 124 Oak Lane')).toBeInTheDocument()
  })

  it('redirects to the list at desktop width', async () => {
    H.expanded = true
    render(<NewPropertyPage />)
    await vi.waitFor(() => expect(H.replace).toHaveBeenCalledWith('/housing'))
    expect(screen.queryByPlaceholderText('e.g. 124 Oak Lane')).toBeNull()
  })
})
