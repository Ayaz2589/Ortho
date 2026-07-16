// T007 — the fetch-injected Plaid REST client (research.md D4).
import { describe, expect, it } from 'vitest'
import { createPlaidClient, PLAID_API_VERSION } from '../src/index'
import { CONFIG, fakeFetch } from './helpers'

describe('createPlaidClient', () => {
  it('POSTs to the sandbox base URL for env=sandbox', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { ok: 1 } }))
    const client = createPlaidClient(fetch, CONFIG)
    await client.post('/link/token/create', {})
    expect(calls[0]?.url).toBe('https://sandbox.plaid.com/link/token/create')
    expect(calls[0]?.method).toBe('POST')
  })

  it('POSTs to the production base URL for env=production', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: {} }))
    const client = createPlaidClient(fetch, { ...CONFIG, env: 'production' })
    await client.post('/item/remove', {})
    expect(calls[0]?.url).toBe('https://production.plaid.com/item/remove')
  })

  it('sends the pinned Plaid-Version and JSON content type', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: {} }))
    await createPlaidClient(fetch, CONFIG).post('/accounts/get', {})
    expect(PLAID_API_VERSION).toBe('2020-09-14')
    expect(calls[0]?.headers['Plaid-Version']).toBe(PLAID_API_VERSION)
    expect(calls[0]?.headers['Content-Type']).toBe('application/json')
  })

  it('injects client_id and secret into the JSON body alongside the payload', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: {} }))
    await createPlaidClient(fetch, CONFIG).post('/link/token/create', { language: 'en' })
    expect(calls[0]?.body).toMatchObject({
      client_id: 'cid_test',
      secret: 'sec_test',
      language: 'en',
    })
  })

  it('returns the parsed body on 200', async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, body: { link_token: 'link-1' } }))
    const result = await createPlaidClient(fetch, CONFIG).post<{ link_token: string }>(
      '/link/token/create',
      {}
    )
    expect(result).toEqual({ ok: true, data: { link_token: 'link-1' } })
  })
})
