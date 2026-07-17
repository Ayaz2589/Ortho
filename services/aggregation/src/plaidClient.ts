// Fetch-injected Plaid REST client (research.md D4). Runtime-agnostic by
// construction: the core compiles with lib ES2022 and no environment types,
// so fetch/Response are structural types injected by the host (Deno edge
// function, operator script, or a test fake) — never globals.

/** Only two Plaid environments exist (Development was decommissioned 2024). */
export type PlaidEnv = 'sandbox' | 'production'

export const PLAID_BASE_URLS: Record<PlaidEnv, string> = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
}

/** Pinned API version — sent on every request (Plaid versioning docs). */
export const PLAID_API_VERSION = '2020-09-14'

/** Structural stand-in for fetch: exactly what the client needs, nothing more. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ status: number; json(): Promise<unknown> }>

export interface PlaidConfig {
  clientId: string
  secret: string
  env: PlaidEnv
}

/** Failure shape for every Plaid call. `providerErrorCode` (Plaid's
 *  `error_code`) is for SERVER-SIDE logs and branching only — it must never
 *  be forwarded to clients (contracts/plaid-functions.md). */
export type PlaidFailure = {
  ok: false
  code: 'provider_unreachable' | 'provider_error'
  providerErrorCode?: string
}

export type PlaidResult<T> = { ok: true; data: T } | PlaidFailure

export interface PlaidClient {
  post<T = unknown>(path: string, body: Record<string, unknown>): Promise<PlaidResult<T>>
}

export function createPlaidClient(fetchImpl: FetchLike, config: PlaidConfig): PlaidClient {
  const baseUrl = PLAID_BASE_URLS[config.env]
  return {
    async post<T>(path: string, body: Record<string, unknown>): Promise<PlaidResult<T>> {
      let status: number
      let parse: () => Promise<unknown>
      try {
        const res = await fetchImpl(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Plaid-Version': PLAID_API_VERSION,
          },
          // Plaid auth rides in the JSON body (their documented REST form).
          body: JSON.stringify({ client_id: config.clientId, secret: config.secret, ...body }),
        })
        status = res.status
        parse = () => res.json()
      } catch {
        return { ok: false, code: 'provider_unreachable' }
      }

      // 5xx = Plaid itself is unhealthy — same user-facing state as no network.
      if (status >= 500) return { ok: false, code: 'provider_unreachable' }

      let parsed: unknown
      try {
        parsed = await parse()
      } catch {
        return { ok: false, code: 'provider_error' }
      }

      if (status >= 200 && status < 300) return { ok: true, data: parsed as T }

      const providerErrorCode = (parsed as { error_code?: unknown } | null)?.error_code
      return typeof providerErrorCode === 'string'
        ? { ok: false, code: 'provider_error', providerErrorCode }
        : { ok: false, code: 'provider_error' }
    },
  }
}
