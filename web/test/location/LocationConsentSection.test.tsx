// @vitest-environment jsdom
// spec 044 US4 — LocationConsentSection: three-tier control, calm "unconfigured" state for
// geocoding, revoke flow calls setLocationConsent('off').
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LocationConsent } from '@/lib/types'

const h = vi.hoisted(() => ({
  locationConsent: null as LocationConsent | null,
  setLocationConsent: vi.fn(),
  currentHousehold: { id: 'h' },
  availability: 'available' as 'available' | 'unconfigured' | 'no-household' | 'checking',
}))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    locationConsent: h.locationConsent,
    setLocationConsent: h.setLocationConsent,
    currentHousehold: h.currentHousehold,
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_: string, i: string) => String(a[Number(i)] ?? '')),
  }),
}))
vi.mock('@/lib/location/geocoding', () => ({
  checkGeocodingAvailable: () => Promise.resolve(h.availability),
}))

import { LocationConsentSection } from '@/components/settings/LocationConsentSection'

beforeEach(() => {
  h.locationConsent = null
  h.setLocationConsent.mockClear()
  h.availability = 'available'
  cleanup()
})

describe('LocationConsentSection', () => {
  it('defaults to Off selected, no permission prompt implied', () => {
    render(<LocationConsentSection />)
    const group = screen.getByRole('radiogroup', { name: 'Location assistance' })
    expect(group.querySelector('[aria-checked="true"]')?.textContent).toContain('Off')
  })

  it('selecting Geocoding calls setLocationConsent with geocoding', async () => {
    render(<LocationConsentSection />)
    await waitFor(() => expect(screen.getByText('Geocoding').closest('button')).not.toBeDisabled())
    await userEvent.click(screen.getByText('Geocoding'))
    expect(h.setLocationConsent).toHaveBeenCalledWith('geocoding')
  })

  it('selecting Foreground capture calls setLocationConsent with foreground_capture', async () => {
    render(<LocationConsentSection />)
    await waitFor(() => expect(screen.getByText('Foreground capture').closest('button')).not.toBeDisabled())
    await userEvent.click(screen.getByText('Foreground capture'))
    expect(h.setLocationConsent).toHaveBeenCalledWith('foreground_capture')
  })

  it('selecting Off after a higher tier calls setLocationConsent with off (revoke)', async () => {
    h.locationConsent = { id: 'c', user_id: 'u', level: 'foreground_capture', granted_at: 'x', revoked_at: null, created_at: 'x', updated_at: 'x' }
    render(<LocationConsentSection />)
    await userEvent.click(screen.getByText('Off'))
    expect(h.setLocationConsent).toHaveBeenCalledWith('off')
  })

  it('shows a calm unconfigured message and disables higher tiers when geocoding is not configured', async () => {
    h.availability = 'unconfigured'
    render(<LocationConsentSection />)
    await waitFor(() => expect(screen.getByText(/isn.t available yet/i)).toBeInTheDocument())
    expect(screen.getByText('Geocoding').closest('button')).toBeDisabled()
    expect(screen.getByText('Foreground capture').closest('button')).toBeDisabled()
    // Off is never disabled — a user can always turn it off.
    expect(screen.getByText('Off').closest('button')).not.toBeDisabled()
  })
})
