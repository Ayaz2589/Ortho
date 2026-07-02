// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Both nav components read the current route from next/navigation. Pin it to
// /transactions so we can assert active-state semantics.
vi.mock('next/navigation', () => ({
  usePathname: () => '/transactions',
  useRouter: () => ({ push: vi.fn() }),
}))

// Sidebar reads currentHousehold / householdMembers / signOut / t from the store.
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currentHousehold: { id: 'h1', name: 'Test Household' },
    householdMembers: [],
    signOut: vi.fn(),
    t: (key: string) => key,
  }),
}))

import { Sidebar } from '@/components/Sidebar'
import { TabBar } from '@/components/TabBar'

const DESTINATIONS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Housing', href: '/housing' },
  { label: 'Settings', href: '/settings' },
]

describe('Sidebar', () => {
  it('renders each destination as a link to the right route', () => {
    render(<Sidebar />)
    for (const { label, href } of DESTINATIONS) {
      const link = screen.getByRole('link', { name: new RegExp(label) })
      expect(link).toHaveAttribute('href', href)
    }
  })

  it('marks the active route with aria-current="page" and leaves others unmarked', () => {
    render(<Sidebar />)
    const active = screen.getByRole('link', { name: /Transactions/ })
    expect(active).toHaveAttribute('aria-current', 'page')

    for (const { label } of DESTINATIONS.filter((d) => d.label !== 'Transactions')) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).not.toHaveAttribute(
        'aria-current'
      )
    }
  })
})

describe('TabBar', () => {
  it('renders each destination as a link to the right route', () => {
    render(<TabBar />)
    for (const { label, href } of DESTINATIONS) {
      const link = screen.getByRole('link', { name: new RegExp(label) })
      expect(link).toHaveAttribute('href', href)
    }
  })

  it('distinguishes the active route via the text-text class (others get text-text-3)', () => {
    render(<TabBar />)
    // TabBar signals active state with a class swap, not aria-current.
    const active = screen.getByRole('link', { name: /Transactions/ })
    expect(active).toHaveClass('text-text')
    expect(active).not.toHaveClass('text-text-3')

    const inactive = screen.getByRole('link', { name: /Dashboard/ })
    expect(inactive).toHaveClass('text-text-3')
    expect(inactive).not.toHaveClass('text-text')
  })
})
