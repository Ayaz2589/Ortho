// Fetch-injected SimpleFIN client (spec 028, research D2/D3). Runtime-agnostic like
// the Plaid client: fetch is a structural type injected by the host (Deno edge fn or
// a test fake) — never a global. SimpleFIN needs no Ortho-side API key; every request
// authenticates with the Access URL's embedded HTTP Basic-Auth credentials.

import { base64Encode } from './base64.ts'

/** Structural stand-in for fetch. Unlike the Plaid client, SimpleFIN uses GET (no
 *  body) and both text (claim → Access URL string) and json (/accounts) responses. */
export type SimpleFinFetch = (
  url: string,
  init: { method: string; headers: Record<string, string> }
) => Promise<{ status: number; text(): Promise<string>; json(): Promise<unknown> }>

export type SimpleFinFailure = {
  ok: false
  code: 'provider_unreachable' | 'provider_error'
  status?: number
}
export type SimpleFinResult<T> = { ok: true; data: T } | SimpleFinFailure

/** Split an Access URL of the form `scheme://user:pass@host/path` into a
 *  credential-free base URL + a Basic-Auth header. Returns null if the URL is
 *  malformed or carries no credentials. fetch() in browsers/Deno rejects userinfo
 *  in the URL, so credentials MUST move to the Authorization header. */
export function parseAccessUrl(accessUrl: string): { baseUrl: string; authHeader: string } | null {
  // Greedy userinfo `(.+)` splits on the LAST '@' so a Basic-Auth password may
  // itself contain '@'; the host+path segment after it carries no '@'.
  const m = /^(https?:\/\/)(.+)@([^@]+)$/.exec(accessUrl.trim())
  if (!m) return null
  const scheme = m[1]
  const userinfo = m[2]
  const rest = m[3]
  if (!scheme || !userinfo || !rest) return null
  const colon = userinfo.indexOf(':')
  if (colon < 0) return null
  const user = userinfo.slice(0, colon)
  const pass = userinfo.slice(colon + 1)
  if (!user) return null
  return {
    baseUrl: `${scheme}${rest}`.replace(/\/+$/, ''),
    authHeader: `Basic ${base64Encode(`${user}:${pass}`)}`,
  }
}

export interface SimpleFinClient {
  /** POST a claim URL (decoded setup token) → the Access URL as a text body. */
  claim(claimUrl: string): Promise<SimpleFinResult<string>>
  /** GET {accessUrl}/accounts?<query> → raw JSON (parsed by simplefin.ts). */
  getAccounts(accessUrl: string, query: string): Promise<SimpleFinResult<unknown>>
}

export function createSimpleFinClient(fetchImpl: SimpleFinFetch): SimpleFinClient {
  return {
    async claim(claimUrl: string): Promise<SimpleFinResult<string>> {
      let res: Awaited<ReturnType<SimpleFinFetch>>
      try {
        res = await fetchImpl(claimUrl, { method: 'POST', headers: {} })
      } catch {
        return { ok: false, code: 'provider_unreachable' }
      }
      if (res.status >= 500) return { ok: false, code: 'provider_unreachable' }
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, code: 'provider_error', status: res.status }
      }
      let body: string
      try {
        body = (await res.text()).trim()
      } catch {
        return { ok: false, code: 'provider_error' }
      }
      if (!body) return { ok: false, code: 'provider_error' }
      return { ok: true, data: body }
    },

    async getAccounts(accessUrl: string, query: string): Promise<SimpleFinResult<unknown>> {
      const parsed = parseAccessUrl(accessUrl)
      if (!parsed) return { ok: false, code: 'provider_error' }
      const url = `${parsed.baseUrl}/accounts${query ? `?${query}` : ''}`
      let res: Awaited<ReturnType<SimpleFinFetch>>
      try {
        res = await fetchImpl(url, { method: 'GET', headers: { Authorization: parsed.authHeader } })
      } catch {
        return { ok: false, code: 'provider_unreachable' }
      }
      if (res.status >= 500) return { ok: false, code: 'provider_unreachable' }
      let json: unknown
      try {
        json = await res.json()
      } catch {
        return { ok: false, code: 'provider_error' }
      }
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, code: 'provider_error', status: res.status }
      }
      return { ok: true, data: json }
    },
  }
}
