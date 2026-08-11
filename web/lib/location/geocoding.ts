// Merchant-name geocoding (spec 044 US4, FR-012) — follows the Plaid/SimpleFin
// credential-gated-integration pattern exactly (research.md §7, lib/aggregation.ts's
// checkLinkingAvailable): a `probe` mode asks "is this configured?" without spending a real
// provider call, and every failure degrades to a calm 'unconfigured' state — never a broken UI.
// Contract: specs/044-financial-routines/contracts/location-and-geocoding.md.

import { createClient } from '../supabase/client'

export type GeocodingAvailability = 'checking' | 'available' | 'unconfigured' | 'no-household'

type InvokeCapable = {
  functions?: {
    invoke: (name: string, opts?: { body?: unknown }) => Promise<{ data: unknown; error: unknown }>
  }
}

/** The FR-012 probe: is merchant geocoding configured on the server at all? Runs the edge
 *  function's config check WITHOUT spending a real geocode call. */
export async function checkGeocodingAvailable(hasHousehold: boolean): Promise<GeocodingAvailability> {
  if (!hasHousehold) return 'no-household'
  const client = createClient() as unknown as InvokeCapable
  // Test-data/memory client has no functions surface — behave as unconfigured (mirrors
  // checkLinkingAvailable's fail-open for the same reason).
  if (!client.functions) return 'unconfigured'
  try {
    const { data, error } = await client.functions.invoke('geocode-merchant', { body: { mode: 'probe' } })
    if (error) return 'unconfigured'
    const configured = (data as { configured?: boolean } | null)?.configured === true
    return configured ? 'available' : 'unconfigured'
  } catch {
    return 'unconfigured'
  }
}

export interface GeocodeResult {
  latitude: number
  longitude: number
  label: string
}

/** Resolve one merchant name to a place, fire-and-forget. Returns `null` on ANY failure
 *  (unconfigured, provider error, network) — geocoding is purely additive decoration (FR-011); a
 *  failure here must never surface an error banner or block routine detection/display. */
export async function resolveMerchantGeocode(merchantLabel: string): Promise<GeocodeResult | null> {
  const client = createClient() as unknown as InvokeCapable
  if (!client.functions) return null
  try {
    const { data, error } = await client.functions.invoke('geocode-merchant', { body: { merchant: merchantLabel } })
    if (error) return null
    const r = data as { latitude?: number; longitude?: number; label?: string } | null
    if (typeof r?.latitude !== 'number' || typeof r?.longitude !== 'number') return null
    return { latitude: r.latitude, longitude: r.longitude, label: r.label ?? merchantLabel }
  } catch {
    return null
  }
}
