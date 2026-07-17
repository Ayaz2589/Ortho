// T007 — failure mapping (contracts/plaid-functions.md shared error codes).
// Raw provider text never crosses the contract boundary: callers get a code;
// Plaid's error_code is preserved separately for server-side logs only.
import { describe, expect, it } from 'vitest'
import { createPlaidClient } from '../src/index'
import { CONFIG, fakeFetch, throwingFetch } from './helpers'

describe('Plaid failure mapping', () => {
  it('network throw → provider_unreachable', async () => {
    const result = await createPlaidClient(throwingFetch(), CONFIG).post('/accounts/get', {})
    expect(result).toEqual({ ok: false, code: 'provider_unreachable' })
  })

  it('5xx → provider_unreachable', async () => {
    const { fetch } = fakeFetch(() => ({ status: 502, body: 'Bad Gateway' }))
    const result = await createPlaidClient(fetch, CONFIG).post('/accounts/get', {})
    expect(result).toEqual({ ok: false, code: 'provider_unreachable' })
  })

  it('structured Plaid error → provider_error with error_code preserved', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 400,
      body: {
        error_type: 'INVALID_REQUEST',
        error_code: 'INVALID_FIELD',
        error_message: 'client_id must be a properly formatted...',
      },
    }))
    const result = await createPlaidClient(fetch, CONFIG).post('/link/token/create', {})
    expect(result).toEqual({
      ok: false,
      code: 'provider_error',
      providerErrorCode: 'INVALID_FIELD',
    })
  })

  it('4xx with an unparseable body → provider_error without a provider code', async () => {
    const { fetch } = fakeFetch(() => ({ status: 400, badJson: true }))
    const result = await createPlaidClient(fetch, CONFIG).post('/link/token/create', {})
    expect(result).toEqual({ ok: false, code: 'provider_error' })
  })

  it('200 with an unparseable body → provider_error', async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, badJson: true }))
    const result = await createPlaidClient(fetch, CONFIG).post('/accounts/get', {})
    expect(result).toEqual({ ok: false, code: 'provider_error' })
  })
})
