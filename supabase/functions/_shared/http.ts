// Hand-written host helpers for the billing (spec 018) and plaid (spec 024)
// edge functions. (Unlike _shared/billing/ and _shared/aggregation/, this
// file is NOT generated.) Error envelope + codes are contract-bound:
// specs/018-*/contracts/billing-functions.md + specs/024-*/contracts/plaid-functions.md.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export type ErrorCode =
  | 'unauthenticated'
  | 'invalid_request'
  | 'not_configured'
  | 'no_billing_account'
  | 'provider_error'
  // spec 024 (plaid-* functions)
  | 'not_household_member'
  | 'provider_unreachable'
  | 'session_not_found'
  | 'session_not_owned'
  | 'session_expired'
  | 'session_incomplete'
  | 'exchange_failed'
  | 'institution_not_found'
  | 'disconnect_failed'

const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  invalid_request: 400,
  not_configured: 503,
  no_billing_account: 409,
  provider_error: 502,
  not_household_member: 403,
  provider_unreachable: 502,
  session_not_found: 404,
  session_not_owned: 403,
  session_expired: 410,
  session_incomplete: 409,
  exchange_failed: 502,
  institution_not_found: 404,
  disconnect_failed: 502,
}

// Messages are safe, calm copy-source text; clients localize by `code`.
const ERROR_MESSAGE: Record<ErrorCode, string> = {
  unauthenticated: 'You need to be signed in for this.',
  invalid_request: 'That request was not understood.',
  not_configured: 'Plans are unavailable right now.',
  no_billing_account: 'There is no billing account for this user yet.',
  provider_error: 'The billing service could not be reached.',
  not_household_member: 'You need to be in a household for this.',
  provider_unreachable: 'The bank-connection service could not be reached.',
  session_not_found: 'That connection attempt was not found.',
  session_not_owned: 'That connection attempt belongs to someone else.',
  session_expired: 'That connection attempt expired. Start again.',
  session_incomplete: 'That connection attempt has not finished yet.',
  exchange_failed: 'The connection could not be completed. Try again.',
  institution_not_found: 'That linked bank was not found.',
  disconnect_failed: 'Disconnecting did not go through. Try again.',
}

export function errorResponse(code: ErrorCode): Response {
  return json(ERROR_STATUS[code], { error: { code, message: ERROR_MESSAGE[code] } })
}

/** OPTIONS preflight for the client-facing functions. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}

export function requiredEnv(...names: string[]): Record<string, string> | null {
  const out: Record<string, string> = {}
  for (const name of names) {
    const v = Deno.env.get(name)
    if (!v) return null
    out[name] = v
  }
  return out
}
