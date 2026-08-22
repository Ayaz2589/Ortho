// Spec 044 (US4, FR-012) — merchant-name → place enrichment. Follows the plaid-link-token pattern
// exactly (research.md §7): requiredEnv() gate, a `probe` mode that answers "is this configured?"
// without spending a real geocode call, and a normal mode that resolves one merchant name.
//
// No geocoding credential exists in this sandbox/CI environment (or any environment until an
// operator provisions one) — `geocode()` below is written against a small, swappable provider
// interface so wiring in a real provider (Apple Maps Server API per the grounding decision record,
// github.com/Ayaz2589/Ortho/pull/5, or an equivalent) later is a credential + one function body,
// not a redesign. Until then this endpoint always answers `not_configured`, which is the correct,
// honest, and tested state (contracts/location-and-geocoding.md).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { errorResponse, json, preflight, requiredEnv } from '../_shared/http.ts'
import { decideGeocodeRequest } from './decision.ts'

interface GeocodeResult {
  latitude: number
  longitude: number
  label: string
}

async function geocode(_merchantLabel: string, _apiKey: string): Promise<GeocodeResult | null> {
  // Intentionally unimplemented — no provider credential exists yet (see header comment).
  // requiredEnv('MAPS_GEOCODING_API_KEY', ...) below is what actually gates this endpoint; this
  // body only runs once that gate passes, i.e. once an operator has set the secret AND wired a
  // real provider call in here.
  return null
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse('invalid_request')

  const env = requiredEnv('MAPS_GEOCODING_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('unauthenticated')

  let mode: unknown
  let merchant: unknown
  try {
    const body = await req.json()
    mode = body?.mode
    merchant = body?.merchant
  } catch {
    return errorResponse('invalid_request')
  }

  const decision = decideGeocodeRequest(env !== null, mode, merchant)
  if (decision.kind === 'not_configured') return errorResponse('not_configured')

  // Auth is verified after the config gate (mirrors plaid-link-token) but before any DB/provider
  // work — an unauthenticated probe still needs a valid session to learn "is this configured?".
  const authed = createClient(env!.SUPABASE_URL, env!.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await authed.auth.getUser()
  if (!user) return errorResponse('unauthenticated')

  if (decision.kind === 'probe_ok') return json(200, { configured: true })
  if (decision.kind === 'invalid_request') return errorResponse('invalid_request')

  const result = await geocode(decision.merchant, env!.MAPS_GEOCODING_API_KEY)
  if (!result) return errorResponse('provider_error')
  return json(200, result)
})
