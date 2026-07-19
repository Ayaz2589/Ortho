/**
 * Client wrappers for the plaid-* edge functions (spec 024,
 * contracts/plaid-functions.md). The apps never talk to Plaid directly and
 * never see the standing access credential; these calls start a connection
 * attempt, complete it, and disconnect an institution. Callers localize
 * failures by `code` — raw provider text never reaches the UI (FR-013).
 */
import { createClient } from './supabase/client'

export type LinkMode = 'embedded' | 'hosted'

export type AggregationResult<T> = { ok: true; value: T } | { ok: false; code: string }

/** plaid-link-token response: everything the client needs to run Link. */
export type LinkSessionStart = {
  sessionId: string
  linkToken: string
  expiresAt: string
  /** Present only for hosted mode (opened in the external browser on iOS). */
  hostedLinkUrl?: string
}

export type LinkedInstitutionView = {
  id: string
  provider: string
  institutionName: string
  status: string
  createdBy: string
  createdAt: string
}

export type LinkedAccountView = {
  id: string
  name: string
  officialName: string | null
  mask: string | null
  accountType: string
  accountSubtype: string | null
}

export type ExchangeOutcome = {
  institution: LinkedInstitutionView
  accounts: LinkedAccountView[]
}

type InvokeCapable = {
  functions?: {
    invoke: (name: string, opts?: { body?: unknown }) => Promise<{ data: unknown; error: unknown }>
  }
}

async function invokeAggregation<T>(name: string, body: unknown): Promise<AggregationResult<T>> {
  const client = createClient() as unknown as InvokeCapable
  // Test-data/memory client has no functions surface — behave as unconfigured.
  if (!client.functions) return { ok: false, code: 'not_configured' }
  try {
    const { data, error } = await client.functions.invoke(name, { body })
    if (!error) return { ok: true, value: data as T }
    // FunctionsHttpError carries the contract envelope in its Response context.
    let code = 'provider_error'
    const context = (error as { context?: { clone?: () => { json: () => Promise<unknown> } } })
      .context
    if (context?.clone) {
      try {
        const parsed = (await context.clone().json()) as { error?: { code?: string } }
        code = parsed?.error?.code ?? code
      } catch {
        // Unparseable body — keep the generic code.
      }
    }
    return { ok: false, code }
  } catch {
    return { ok: false, code: 'provider_error' }
  }
}

function isLinkSessionStart(v: unknown): v is LinkSessionStart {
  const r = v as LinkSessionStart | null
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.sessionId === 'string' &&
    typeof r.linkToken === 'string' &&
    typeof r.expiresAt === 'string'
  )
}

function isExchangeOutcome(v: unknown): v is ExchangeOutcome {
  const r = v as ExchangeOutcome | null
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.institution === 'object' &&
    r.institution !== null &&
    typeof r.institution.id === 'string' &&
    Array.isArray(r.accounts)
  )
}

/** The FR-012 probe: is bank linking configured on the server at all? Runs
 *  auth + membership + config checks in plaid-link-token WITHOUT creating a
 *  Plaid session or a DB row — the page goes calmly dark on not_configured. */
export function checkLinkingAvailable(): Promise<AggregationResult<{ configured: true }>> {
  return invokeAggregation<{ configured: true }>('plaid-link-token', { mode: 'probe' })
}

/** Start a connection attempt. A malformed 200 must surface as a calm
 *  retryable failure, never a crash (the fetchPlans lesson, review 018 [8]). */
export function createLinkSession(
  mode: LinkMode,
  language?: string
): Promise<AggregationResult<LinkSessionStart>> {
  const body = language === undefined ? { mode } : { mode, language }
  return invokeAggregation<LinkSessionStart>('plaid-link-token', body).then((r) => {
    if (!r.ok) return r
    return isLinkSessionStart(r.value) ? r : { ok: false, code: 'provider_error' }
  })
}

/** Complete a connection attempt. Embedded Link passes the public token it
 *  received; hosted completion omits it (the server resolves the session).
 *  Idempotent server-side — safe to call from both the deep-link hand-back
 *  and the foreground poll. */
export function completeLinkSession(
  sessionId: string,
  publicToken?: string
): Promise<AggregationResult<ExchangeOutcome>> {
  const body = publicToken === undefined ? { sessionId } : { sessionId, publicToken }
  return invokeAggregation<ExchangeOutcome>('plaid-exchange', body).then((r) => {
    if (!r.ok) return r
    return isExchangeOutcome(r.value) ? r : { ok: false, code: 'provider_error' }
  })
}

/** Disconnect: the server revokes provider access FIRST, then marks the
 *  institution disconnected — a failure means nothing changed (FR-009).
 *  Provider-aware (spec 028): SimpleFIN institutions route to simplefin-disconnect;
 *  everything else keeps the Plaid path (the default, for existing links). */
export function disconnectInstitution(
  institutionId: string,
  provider?: string
): Promise<AggregationResult<{ institutionId: string; status: string }>> {
  const fn = provider === 'simplefin' ? 'simplefin-disconnect' : 'plaid-disconnect'
  return invokeAggregation(fn, { institutionId })
}

// ── SimpleFIN (spec 028) — the go-forward provider ──

export type SimpleFinAccountView = {
  name: string
  accountType: string
  currency: string | null
  mask: string | null
}

export type SimpleFinClaimOutcome = {
  institutionId: string
  institutionName: string
  accounts: SimpleFinAccountView[]
}

export type SyncOutcome = {
  institutionId: string
  imported: number
  updated: number
  warnings: string[]
}

function isClaimOutcome(v: unknown): v is SimpleFinClaimOutcome {
  const r = v as SimpleFinClaimOutcome | null
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.institutionId === 'string' &&
    typeof r.institutionName === 'string' &&
    Array.isArray(r.accounts)
  )
}

function isSyncOutcome(v: unknown): v is SyncOutcome {
  const r = v as SyncOutcome | null
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.institutionId === 'string' &&
    typeof r.imported === 'number' &&
    typeof r.updated === 'number'
  )
}

/** Claim a SimpleFIN setup token: the server decodes it, POSTs the claim URL,
 *  stores the Access URL in Vault, and records the institution + accounts. A
 *  malformed 200 surfaces as a calm retryable failure, never a crash. */
export function claimSimpleFinToken(
  setupToken: string
): Promise<AggregationResult<SimpleFinClaimOutcome>> {
  return invokeAggregation<SimpleFinClaimOutcome>('simplefin-claim', { setupToken }).then((r) => {
    if (!r.ok) return r
    return isClaimOutcome(r.value) ? r : { ok: false, code: 'provider_error' }
  })
}

/** Sync a SimpleFIN connection's transactions into the ledger. `manual` marks a
 *  member-initiated refresh (rate-limited server-side → `rate_limited`). */
export function syncInstitution(
  institutionId: string,
  opts?: { manual?: boolean }
): Promise<AggregationResult<SyncOutcome>> {
  const body = opts?.manual ? { institutionId, manual: true } : { institutionId }
  return invokeAggregation<SyncOutcome>('simplefin-sync', body).then((r) => {
    if (!r.ok) return r
    return isSyncOutcome(r.value) ? r : { ok: false, code: 'provider_error' }
  })
}
