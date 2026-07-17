// T032 — /item/remove semantics (contracts/plaid-functions.md §3, FR-009).
// Revoke-at-provider-first: only an unambiguous "access is gone" may flip the
// institution to disconnected; an unreachable provider must change nothing.
import { describe, expect, it } from 'vitest'
import { createPlaidClient, interpretItemRemoveResult } from '../src/index'
import { CONFIG, fakeFetch } from './helpers'

describe('interpretItemRemoveResult', () => {
  it('a 200 means access is revoked', async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, body: { request_id: 'r' } }))
    const result = await createPlaidClient(fetch, CONFIG).post('/item/remove', {
      access_token: 'access-1',
    })
    expect(interpretItemRemoveResult(result)).toBe('removed')
  })

  it('ITEM_NOT_FOUND counts as success — access is already gone', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 400,
      body: { error_type: 'INVALID_INPUT', error_code: 'ITEM_NOT_FOUND', error_message: 'x' },
    }))
    const result = await createPlaidClient(fetch, CONFIG).post('/item/remove', {
      access_token: 'access-1',
    })
    expect(interpretItemRemoveResult(result)).toBe('removed')
  })

  it('an unreachable provider is NOT a revocation (nothing may change)', async () => {
    const { fetch } = fakeFetch(() => ({ status: 502, body: 'bad gateway' }))
    const result = await createPlaidClient(fetch, CONFIG).post('/item/remove', {
      access_token: 'access-1',
    })
    expect(interpretItemRemoveResult(result)).toBe('unreachable')
  })

  it('any other structured provider error is a plain failure', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 400,
      body: { error_type: 'INVALID_INPUT', error_code: 'INVALID_ACCESS_TOKEN', error_message: 'x' },
    }))
    const result = await createPlaidClient(fetch, CONFIG).post('/item/remove', {
      access_token: 'access-1',
    })
    expect(interpretItemRemoveResult(result)).toBe('failed')
  })
})
