// Plaid request builders + response parsers (spec 024, research.md D6/D7).
// Pure functions over untrusted JSON: parsers return null on malformed input
// rather than throwing — the edge functions translate null into the contract
// error codes. Nothing here performs I/O (see plaidClient.ts).
import type { LinkMode, NormalizedAccount } from './types.ts'

/** Where Plaid Hosted Link hands the user back to the iOS shell. A custom
 *  scheme needs no Plaid Dashboard registration (research.md D3). */
export const HOSTED_COMPLETION_REDIRECT_URI = 'ortho://plaid-done'

/** The SPA route (static export) that resumes embedded Link after a bank
 *  OAuth detour. Must be allowlisted in the Plaid Dashboard (quickstart §2.1). */
export const OAUTH_RETURN_PATH = '/plaid-oauth'

/** Plaid Link display languages we are willing to pass through. Ortho also
 *  ships bn/ja/ko/zh catalogs, but Plaid Link does not render those — they
 *  fall back to English rather than sending Plaid an unsupported value. */
const PLAID_LANGUAGES = new Set(['en', 'es', 'fr', 'de', 'nl', 'pt'])

export interface LinkTokenRequestOptions {
  mode: LinkMode
  /** Supabase auth user UUID — resolved from the JWT, never from a body. */
  clientUserId: string
  /** Origin the web app is served from (APP_BASE_URL secret). */
  appBaseUrl: string
  /** Active app language; passed through only when Plaid Link supports it. */
  language?: string
}

/** Body for POST /link/token/create (client_id/secret are injected by the
 *  Plaid client, not here). */
export function buildLinkTokenRequest(opts: LinkTokenRequestOptions): Record<string, unknown> {
  const language =
    opts.language !== undefined && PLAID_LANGUAGES.has(opts.language) ? opts.language : 'en'

  const base: Record<string, unknown> = {
    client_name: 'Ortho',
    language,
    country_codes: ['US'],
    user: { client_user_id: opts.clientUserId },
    // Connect-only posture (FR-011): Auth is the mandatory ≥1 product (one-time
    // fee, free on Trial); transactions consent is collected now but billed
    // only when the future sync feature starts using it — no re-link needed.
    products: ['auth'],
    additional_consented_products: ['transactions'],
  }

  if (opts.mode === 'embedded') {
    // Web SPA: bank-OAuth detours return here; Link resumes with the same
    // link_token + receivedRedirectUri (contracts/link-session-lifecycle.md).
    base.redirect_uri = `${opts.appBaseUrl}${OAUTH_RETURN_PATH}`
  } else {
    // Capacitor iOS: Hosted Link in the external browser. Plaid handles any
    // bank OAuth inside its hosted session — no redirect_uri of ours involved.
    base.hosted_link = {
      completion_redirect_uri: HOSTED_COMPLETION_REDIRECT_URI,
      is_mobile_app: true,
    }
  }

  return base
}

export interface ParsedLinkToken {
  linkToken: string
  expiresAt: string
  /** Present only for hosted-mode tokens. */
  hostedLinkUrl: string | null
}

export function parseLinkTokenResponse(data: unknown): ParsedLinkToken | null {
  const r = data as { link_token?: unknown; expiration?: unknown; hosted_link_url?: unknown } | null
  if (!r || typeof r.link_token !== 'string' || typeof r.expiration !== 'string') return null
  return {
    linkToken: r.link_token,
    expiresAt: r.expiration,
    hostedLinkUrl: typeof r.hosted_link_url === 'string' ? r.hosted_link_url : null,
  }
}

export interface ParsedExchange {
  accessToken: string
  itemId: string
}

export function parseExchangeResponse(data: unknown): ParsedExchange | null {
  const r = data as { access_token?: unknown; item_id?: unknown } | null
  if (!r || typeof r.access_token !== 'string' || typeof r.item_id !== 'string') return null
  return { accessToken: r.access_token, itemId: r.item_id }
}

export interface ParsedAccounts {
  accounts: NormalizedAccount[]
  institutionId: string | null
  institutionName: string | null
}

/** Normalize POST /accounts/get: display metadata only — balances and every
 *  other field are deliberately dropped at the boundary (connect-only scope,
 *  SC-002). */
export function parseAccountsResponse(data: unknown): ParsedAccounts | null {
  const r = data as { accounts?: unknown; item?: unknown } | null
  if (!r || !Array.isArray(r.accounts)) return null

  const accounts: NormalizedAccount[] = []
  for (const raw of r.accounts) {
    const a = raw as {
      account_id?: unknown
      name?: unknown
      official_name?: unknown
      mask?: unknown
      type?: unknown
      subtype?: unknown
    } | null
    if (!a || typeof a.account_id !== 'string') return null
    accounts.push({
      providerAccountId: a.account_id,
      name: typeof a.name === 'string' ? a.name : '',
      officialName: typeof a.official_name === 'string' ? a.official_name : null,
      mask: typeof a.mask === 'string' ? a.mask : null,
      accountType: typeof a.type === 'string' ? a.type : '',
      accountSubtype: typeof a.subtype === 'string' ? a.subtype : null,
    })
  }

  const item = r.item as { institution_id?: unknown; institution_name?: unknown } | null
  return {
    accounts,
    institutionId: typeof item?.institution_id === 'string' ? item.institution_id : null,
    institutionName: typeof item?.institution_name === 'string' ? item.institution_name : null,
  }
}

/** Resolve a finished Hosted Link session's public token from the
 *  POST /link/token/get payload (`link_sessions[].results.item_add_results[]`
 *  — the shape Plaid recommends over the legacy on_success object). Null means
 *  "the user has not finished yet", which the exchange function reports as
 *  `session_incomplete` — a waiting state, not an error. */
export function parseHostedSessionResult(data: unknown): string | null {
  const r = data as { link_sessions?: unknown } | null
  if (!r || !Array.isArray(r.link_sessions)) return null
  for (const raw of r.link_sessions) {
    const results = (raw as { results?: { item_add_results?: unknown } } | null)?.results
    const adds = results?.item_add_results
    if (!Array.isArray(adds)) continue
    for (const add of adds) {
      const token = (add as { public_token?: unknown } | null)?.public_token
      if (typeof token === 'string' && token.length > 0) return token
    }
  }
  return null
}

/** Name from POST /institutions/get_by_id — the fallback when /accounts/get
 *  did not carry item.institution_name. */
export function parseInstitutionResponse(data: unknown): string | null {
  const r = data as { institution?: { name?: unknown } } | null
  const name = r?.institution?.name
  return typeof name === 'string' ? name : null
}
