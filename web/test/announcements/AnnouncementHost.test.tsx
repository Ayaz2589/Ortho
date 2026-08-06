// @vitest-environment jsdom
// spec 042 US1/US2 — the announcement popup host. Shows the next unseen+relevant
// announcement to a signed-in user via the shared Drawer (dialog); CTA navigates
// and marks seen; any dismiss marks seen without navigating; never re-shows.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ANNOUNCEMENTS } from '@/components/announcements/registry'
import { markAnnouncementSeen, hasSeenAnnouncement } from '@/components/announcements/announcementsSeen'

const FH = ANNOUNCEMENTS.find((a) => a.id === 'financial-health')!

const h = vi.hoisted(() => ({
  app: {
    loading: false,
    currentUserId: 'u1',
    userFinancialProfile: null as unknown,
    t: (k: string, ...a: unknown[]) =>
      k.replace(/\{(\d+)\}/g, (_: string, i: string) => String(a[Number(i)] ?? '')),
  },
  pathname: '/dashboard',
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('@/lib/store', () => ({ useApp: () => h.app }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  usePathname: () => h.pathname,
}))

import { AnnouncementHost } from '@/components/announcements/AnnouncementHost'

beforeEach(() => {
  localStorage.clear()
  h.app.loading = false
  h.app.currentUserId = 'u1'
  h.app.userFinancialProfile = null
  h.pathname = '/dashboard'
  h.push.mockClear()
  h.replace.mockClear()
})
afterEach(cleanup)

describe('AnnouncementHost', () => {
  it('renders nothing while the app is loading', () => {
    h.app.loading = true
    render(<AnnouncementHost />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing when no user is signed in', () => {
    h.app.currentUserId = ''
    render(<AnnouncementHost />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing when there is no unseen announcement', () => {
    markAnnouncementSeen('financial-health')
    render(<AnnouncementHost />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("renders nothing when already on the announcement's CTA route", () => {
    // A direct/bookmark navigation to the questionnaire must not pop the popup
    // over the very page its CTA links to (preserves the old gate's path guard).
    h.pathname = FH.cta.route
    render(<AnnouncementHost />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing when the only announcement is not relevant', () => {
    h.app.userFinancialProfile = { id: 'p1' } // FH is only relevant when profile == null
    render(<AnnouncementHost />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the next unseen+relevant announcement as a labelled dialog', () => {
    render(<AnnouncementHost />)
    const dialog = screen.getByRole('dialog', { name: "What's new" })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText(FH.titleKey)).toBeInTheDocument()
    expect(screen.getByText(FH.descriptionKey)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: FH.cta.labelKey })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('does not navigate on mount (no forced redirect — FR-011)', () => {
    render(<AnnouncementHost />)
    expect(h.push).not.toHaveBeenCalled()
    expect(h.replace).not.toHaveBeenCalled()
  })

  it('CTA marks seen and navigates to the target route', async () => {
    render(<AnnouncementHost />)
    await userEvent.click(screen.getByRole('button', { name: FH.cta.labelKey }))
    expect(hasSeenAnnouncement('financial-health')).toBe(true)
    expect(h.push).toHaveBeenCalledWith(FH.cta.route)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('dismiss via the close control marks seen without navigating', async () => {
    render(<AnnouncementHost />)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(hasSeenAnnouncement('financial-health')).toBe(true)
    expect(h.push).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('dismiss via Escape marks seen without navigating', async () => {
    render(<AnnouncementHost />)
    await userEvent.keyboard('{Escape}')
    expect(hasSeenAnnouncement('financial-health')).toBe(true)
    expect(h.push).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not re-show on a fresh mount once seen', () => {
    markAnnouncementSeen('financial-health')
    render(<AnnouncementHost />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
