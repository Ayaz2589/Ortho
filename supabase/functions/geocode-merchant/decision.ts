// Pure request-routing logic for geocode-merchant, extracted for Deno.test coverage —
// mirrors plaid-exchange/completion.ts's precedent (decideCompletionAfterRpcError).
// Contract: specs/044-financial-routines/contracts/location-and-geocoding.md.

export type GeocodeRequestOutcome =
  | { kind: 'not_configured' }
  | { kind: 'probe_ok' }
  | { kind: 'invalid_request' }
  | { kind: 'proceed'; merchant: string }

/** Decide how to route a geocode-merchant request. `envConfigured` is the result of the
 *  requiredEnv() gate (the credential-gated-integration pattern, research.md §7) — checked BEFORE
 *  the probe branch, so an unconfigured server answers `not_configured` even for a probe request
 *  (the probe exists to ask "is this configured?", so it must itself respect that gate). */
export function decideGeocodeRequest(
  envConfigured: boolean,
  mode: unknown,
  merchant: unknown
): GeocodeRequestOutcome {
  if (!envConfigured) return { kind: 'not_configured' }
  if (mode === 'probe') return { kind: 'probe_ok' }
  if (typeof merchant !== 'string' || merchant.trim() === '') return { kind: 'invalid_request' }
  return { kind: 'proceed', merchant }
}
