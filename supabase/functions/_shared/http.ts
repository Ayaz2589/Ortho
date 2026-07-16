// Hand-written host helpers for the billing edge functions (spec 018).
// (Unlike _shared/billing/, this file is NOT generated.)
// Error envelope + codes are contract-bound: contracts/billing-functions.md.

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

const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  invalid_request: 400,
  not_configured: 503,
  no_billing_account: 409,
  provider_error: 502,
}

// Messages are safe, calm copy-source text; clients localize by `code`.
const ERROR_MESSAGE: Record<ErrorCode, string> = {
  unauthenticated: 'You need to be signed in for this.',
  invalid_request: 'That request was not understood.',
  not_configured: 'Plans are unavailable right now.',
  no_billing_account: 'There is no billing account for this user yet.',
  provider_error: 'The billing service could not be reached.',
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
