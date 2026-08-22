// spec 044 US4 — the FR-012 geocoding probe, mirroring
// test/lib/aggregation.test.ts's checkLinkingAvailable pattern.
import { describe, it, expect, vi } from 'vitest'

const supabase = vi.hoisted(() => ({ client: {} as Record<string, unknown> }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabase.client }))

import { checkGeocodingAvailable, resolveMerchantGeocode } from '@/lib/location/geocoding'

type InvokeMock = ReturnType<typeof vi.fn>
function withInvoke(impl: InvokeMock) {
  supabase.client = { functions: { invoke: impl } }
  return impl
}

describe('checkGeocodingAvailable', () => {
  it('returns no-household when there is no active household', async () => {
    withInvoke(vi.fn())
    expect(await checkGeocodingAvailable(false)).toBe('no-household')
  })

  it('returns unconfigured when the client has no functions surface (test/memory client)', async () => {
    supabase.client = {}
    expect(await checkGeocodingAvailable(true)).toBe('unconfigured')
  })

  it('returns available when the probe reports configured', async () => {
    withInvoke(vi.fn(async () => ({ data: { configured: true }, error: null })))
    expect(await checkGeocodingAvailable(true)).toBe('available')
  })

  it('returns unconfigured when the probe reports not configured', async () => {
    withInvoke(vi.fn(async () => ({ data: { configured: false }, error: null })))
    expect(await checkGeocodingAvailable(true)).toBe('unconfigured')
  })

  it('returns unconfigured (never throws) on a provider/network error', async () => {
    withInvoke(vi.fn(async () => ({ data: null, error: new Error('boom') })))
    expect(await checkGeocodingAvailable(true)).toBe('unconfigured')
  })

  it('returns unconfigured (never throws) when invoke itself rejects', async () => {
    withInvoke(vi.fn(async () => { throw new Error('network down') }))
    expect(await checkGeocodingAvailable(true)).toBe('unconfigured')
  })
})

describe('resolveMerchantGeocode', () => {
  it('resolves a place on success', async () => {
    withInvoke(vi.fn(async () => ({ data: { latitude: 40.7, longitude: -74.0, label: 'Blue Bottle Coffee' }, error: null })))
    expect(await resolveMerchantGeocode('Blue Bottle Coffee')).toEqual({
      latitude: 40.7,
      longitude: -74.0,
      label: 'Blue Bottle Coffee',
    })
  })

  it('returns null on any failure — never throws', async () => {
    withInvoke(vi.fn(async () => ({ data: null, error: new Error('not_configured') })))
    expect(await resolveMerchantGeocode('Netflix')).toBeNull()
  })

  it('returns null when the client has no functions surface', async () => {
    supabase.client = {}
    expect(await resolveMerchantGeocode('Netflix')).toBeNull()
  })
})
