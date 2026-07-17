// T014 (spec 024) — the edge-function invoke wrapper for bank linking.
// Contract: contracts/plaid-functions.md — every failure is a machine `code`
// the UI localizes; raw provider text never reaches a caller.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const supabase = vi.hoisted(() => ({
  client: {} as Record<string, unknown>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => supabase.client,
}))

import {
  checkLinkingAvailable,
  completeLinkSession,
  createLinkSession,
  disconnectInstitution,
} from '@/lib/aggregation'

type InvokeMock = ReturnType<typeof vi.fn>

function withInvoke(impl: InvokeMock) {
  supabase.client = { functions: { invoke: impl } }
  return impl
}

/** Shape the supabase-js FunctionsHttpError exposes: the envelope rides in a
 *  Response-like `context`. */
function functionsError(body: unknown) {
  return {
    context: {
      clone: () => ({ json: () => Promise.resolve(body) }),
    },
  }
}

const START = { sessionId: 's-1', linkToken: 'link-1', expiresAt: '2099-01-01T00:00:00Z' }
const OUTCOME = {
  institution: {
    id: 'i-1',
    provider: 'plaid',
    institutionName: 'First Platypus Bank',
    status: 'active',
    createdBy: 'u-1',
    createdAt: '2026-07-16T00:00:00Z',
  },
  accounts: [
    {
      id: 'a-1',
      name: 'Plaid Checking',
      officialName: null,
      mask: '0000',
      accountType: 'depository',
      accountSubtype: 'checking',
    },
  ],
}

beforeEach(() => {
  supabase.client = {}
})

describe('createLinkSession', () => {
  it('invokes plaid-link-token with the mode and returns the session', async () => {
    const invoke = withInvoke(vi.fn().mockResolvedValue({ data: START, error: null }))
    const result = await createLinkSession('embedded')
    expect(invoke).toHaveBeenCalledWith('plaid-link-token', { body: { mode: 'embedded' } })
    expect(result).toEqual({ ok: true, value: START })
  })

  it('passes the language through for hosted mode', async () => {
    const invoke = withInvoke(
      vi.fn().mockResolvedValue({ data: { ...START, hostedLinkUrl: 'https://h' }, error: null })
    )
    const result = await createLinkSession('hosted', 'es')
    expect(invoke).toHaveBeenCalledWith('plaid-link-token', {
      body: { mode: 'hosted', language: 'es' },
    })
    expect(result.ok && result.value.hostedLinkUrl).toBe('https://h')
  })

  it('a malformed 200 surfaces as provider_error, never a crash', async () => {
    withInvoke(vi.fn().mockResolvedValue({ data: { nope: true }, error: null }))
    expect(await createLinkSession('embedded')).toEqual({ ok: false, code: 'provider_error' })
  })

  it('extracts the contract code from a FunctionsHttpError envelope', async () => {
    withInvoke(
      vi.fn().mockResolvedValue({
        data: null,
        error: functionsError({ error: { code: 'not_household_member', message: 'x' } }),
      })
    )
    expect(await createLinkSession('embedded')).toEqual({
      ok: false,
      code: 'not_household_member',
    })
  })

  it('an unparseable error body falls back to provider_error', async () => {
    withInvoke(
      vi.fn().mockResolvedValue({
        data: null,
        error: { context: { clone: () => ({ json: () => Promise.reject(new Error('x')) }) } },
      })
    )
    expect(await createLinkSession('embedded')).toEqual({ ok: false, code: 'provider_error' })
  })

  it('behaves as unconfigured when the client has no functions surface (test-data mode)', async () => {
    supabase.client = {}
    expect(await createLinkSession('embedded')).toEqual({ ok: false, code: 'not_configured' })
  })

  it('an invoke throw surfaces as provider_error', async () => {
    withInvoke(vi.fn().mockRejectedValue(new Error('boom')))
    expect(await createLinkSession('embedded')).toEqual({ ok: false, code: 'provider_error' })
  })
})

describe('completeLinkSession', () => {
  it('sends sessionId (+ publicToken when embedded Link produced one)', async () => {
    const invoke = withInvoke(vi.fn().mockResolvedValue({ data: OUTCOME, error: null }))
    const result = await completeLinkSession('s-1', 'public-1')
    expect(invoke).toHaveBeenCalledWith('plaid-exchange', {
      body: { sessionId: 's-1', publicToken: 'public-1' },
    })
    expect(result).toEqual({ ok: true, value: OUTCOME })
  })

  it('omits publicToken for hosted completion (server resolves it)', async () => {
    const invoke = withInvoke(vi.fn().mockResolvedValue({ data: OUTCOME, error: null }))
    await completeLinkSession('s-1')
    expect(invoke).toHaveBeenCalledWith('plaid-exchange', { body: { sessionId: 's-1' } })
  })

  it('session_incomplete passes through as a waiting state code', async () => {
    withInvoke(
      vi.fn().mockResolvedValue({
        data: null,
        error: functionsError({ error: { code: 'session_incomplete', message: 'x' } }),
      })
    )
    expect(await completeLinkSession('s-1')).toEqual({ ok: false, code: 'session_incomplete' })
  })

  it('a malformed 200 surfaces as provider_error', async () => {
    withInvoke(vi.fn().mockResolvedValue({ data: { institution: null }, error: null }))
    expect(await completeLinkSession('s-1')).toEqual({ ok: false, code: 'provider_error' })
  })
})

describe('checkLinkingAvailable (the FR-012 probe)', () => {
  it('probes plaid-link-token with mode "probe" — no Plaid session is created', async () => {
    const invoke = withInvoke(
      vi.fn().mockResolvedValue({ data: { configured: true }, error: null })
    )
    const result = await checkLinkingAvailable()
    expect(invoke).toHaveBeenCalledWith('plaid-link-token', { body: { mode: 'probe' } })
    expect(result).toEqual({ ok: true, value: { configured: true } })
  })

  it('not_configured passes through so the page can go dark calmly', async () => {
    withInvoke(
      vi.fn().mockResolvedValue({
        data: null,
        error: functionsError({ error: { code: 'not_configured', message: 'x' } }),
      })
    )
    expect(await checkLinkingAvailable()).toEqual({ ok: false, code: 'not_configured' })
  })
})

describe('disconnectInstitution', () => {
  it('invokes plaid-disconnect and returns the new status', async () => {
    const invoke = withInvoke(
      vi.fn().mockResolvedValue({
        data: { institutionId: 'i-1', status: 'disconnected' },
        error: null,
      })
    )
    const result = await disconnectInstitution('i-1')
    expect(invoke).toHaveBeenCalledWith('plaid-disconnect', { body: { institutionId: 'i-1' } })
    expect(result).toEqual({ ok: true, value: { institutionId: 'i-1', status: 'disconnected' } })
  })

  it('provider_unreachable passes through for the calm retry line', async () => {
    withInvoke(
      vi.fn().mockResolvedValue({
        data: null,
        error: functionsError({ error: { code: 'provider_unreachable', message: 'x' } }),
      })
    )
    expect(await disconnectInstitution('i-1')).toEqual({
      ok: false,
      code: 'provider_unreachable',
    })
  })
})
