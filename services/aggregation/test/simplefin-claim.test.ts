// SimpleFIN claim flow (spec 028, US1): parse Access URL, POST claim, parse account
// display metadata. Mocked fetch (text + json) — no live Bridge account.
import { describe, expect, it } from 'vitest'
import {
  createSimpleFinClient,
  institutionLabel,
  parseAccessUrl,
  parseSimpleFinAccounts,
} from '../src/index'
import { fakeSfinFetch, throwingSfinFetch } from './helpers'

describe('parseAccessUrl — split credentials into base URL + Basic auth header', () => {
  it('extracts user:pass and strips userinfo from the URL', () => {
    const parsed = parseAccessUrl('https://demo:secret@bridge.simplefin.org/simplefin')
    expect(parsed).not.toBeNull()
    expect(parsed!.baseUrl).toBe('https://bridge.simplefin.org/simplefin')
    // base64('demo:secret')
    expect(parsed!.authHeader).toBe('Basic ZGVtbzpzZWNyZXQ=')
  })

  it('returns null when there are no credentials', () => {
    expect(parseAccessUrl('https://bridge.simplefin.org/simplefin')).toBeNull()
  })
})

describe('client.claim — POST the claim URL → Access URL text', () => {
  const claimUrl = 'https://bridge.simplefin.org/simplefin/claim/ABC'
  const accessUrl = 'https://demo:secret@bridge.simplefin.org/simplefin'

  it('returns the Access URL on 200', async () => {
    const { fetch, calls } = fakeSfinFetch(() => ({ status: 200, text: accessUrl }))
    const res = await createSimpleFinClient(fetch).claim(claimUrl)
    expect(res).toEqual({ ok: true, data: accessUrl })
    expect(calls[0]).toMatchObject({ url: claimUrl, method: 'POST' })
  })

  it('maps a consumed/expired token (403) to provider_error', async () => {
    const { fetch } = fakeSfinFetch(() => ({ status: 403, text: 'forbidden' }))
    const res = await createSimpleFinClient(fetch).claim(claimUrl)
    expect(res).toMatchObject({ ok: false, code: 'provider_error', status: 403 })
  })

  it('maps 5xx to provider_unreachable', async () => {
    const { fetch } = fakeSfinFetch(() => ({ status: 503 }))
    expect(await createSimpleFinClient(fetch).claim(claimUrl)).toMatchObject({
      ok: false,
      code: 'provider_unreachable',
    })
  })

  it('maps a network throw to provider_unreachable', async () => {
    const res = await createSimpleFinClient(throwingSfinFetch()).claim(claimUrl)
    expect(res).toMatchObject({ ok: false, code: 'provider_unreachable' })
  })

  it('treats an empty body as provider_error', async () => {
    const { fetch } = fakeSfinFetch(() => ({ status: 200, text: '   ' }))
    expect(await createSimpleFinClient(fetch).claim(claimUrl)).toMatchObject({
      ok: false,
      code: 'provider_error',
    })
  })
})

describe('parseSimpleFinAccounts — display metadata (v1 nested org variant)', () => {
  const v1 = {
    errors: [],
    accounts: [
      {
        id: 'acct-1',
        name: 'Everyday Checking',
        currency: 'USD',
        'account-type': 'checking',
        org: { name: 'Demo Bank', domain: 'demo.example' },
        transactions: [],
      },
    ],
  }

  it('parses account name, org, currency, and type', () => {
    const parsed = parseSimpleFinAccounts(v1)
    expect(parsed.accounts).toEqual([
      {
        providerAccountId: 'acct-1',
        name: 'Everyday Checking',
        orgName: 'Demo Bank',
        currency: 'USD',
        mask: null,
        accountType: 'checking',
      },
    ])
    expect(institutionLabel(parsed.accounts)).toBe('Demo Bank')
  })
})

describe('parseSimpleFinAccounts — display metadata (v2 connections variant)', () => {
  const v2 = {
    errlist: [],
    connections: [{ conn_id: 'c1', org_name: 'V2 Bank' }],
    accounts: [
      {
        id: 'acct-2',
        name: 'Savings ····5678',
        currency: 'USD',
        org_name: 'V2 Bank',
        transactions: [],
      },
    ],
  }

  it('reads org_name and derives a mask from the name digits', () => {
    const parsed = parseSimpleFinAccounts(v2)
    expect(parsed.accounts[0]).toMatchObject({
      providerAccountId: 'acct-2',
      orgName: 'V2 Bank',
      currency: 'USD',
      mask: '5678',
    })
  })

  it('falls back to "SimpleFIN" when no org name is present', () => {
    expect(institutionLabel([{ providerAccountId: 'a', name: 'x', orgName: null, currency: null, mask: null, accountType: '' }])).toBe('SimpleFIN')
  })
})

describe('parseSimpleFinAccounts — malformed input never throws', () => {
  it('returns empty for non-objects', () => {
    expect(parseSimpleFinAccounts(null)).toEqual({ accounts: [], transactions: [], warnings: [] })
    expect(parseSimpleFinAccounts('nope')).toEqual({ accounts: [], transactions: [], warnings: [] })
    expect(parseSimpleFinAccounts({ accounts: 'notarray' })).toEqual({ accounts: [], transactions: [], warnings: [] })
  })

  it('skips accounts with no id', () => {
    expect(parseSimpleFinAccounts({ accounts: [{ name: 'x' }] }).accounts).toEqual([])
  })
})
