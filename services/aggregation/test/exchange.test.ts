// T010 — exchange + accounts + institution parsing (sandbox-shaped fixtures).
import { describe, expect, it } from 'vitest'
import {
  parseAccountsResponse,
  parseExchangeResponse,
  parseInstitutionResponse,
} from '../src/index'

describe('parseExchangeResponse', () => {
  it('extracts the access token and item id', () => {
    expect(
      parseExchangeResponse({
        access_token: 'access-sandbox-123',
        item_id: 'M5eVJqLnv3tbzdngLDp9FL5OlDNxlNhlE55op',
        request_id: 'req',
      })
    ).toEqual({ accessToken: 'access-sandbox-123', itemId: 'M5eVJqLnv3tbzdngLDp9FL5OlDNxlNhlE55op' })
  })

  it('returns null on malformed payloads', () => {
    expect(parseExchangeResponse({ access_token: 'a' })).toBeNull()
    expect(parseExchangeResponse(undefined)).toBeNull()
  })
})

// Shaped from Plaid sandbox /accounts/get (fields we don't read elided).
const ACCOUNTS_FIXTURE = {
  accounts: [
    {
      account_id: 'blgvvBlXw3cq5GMPwqB6s6q4dLKB9WcVqGDGo',
      mask: '0000',
      name: 'Plaid Checking',
      official_name: 'Plaid Gold Standard 0% Interest Checking',
      subtype: 'checking',
      type: 'depository',
      balances: { available: 100, current: 110 },
    },
    {
      account_id: '6PdjjRP6LmugpBy5NgQvUqpRXMWxzktg3rwrk',
      mask: null,
      name: 'Plaid Saving',
      official_name: null,
      subtype: 'savings',
      type: 'depository',
    },
  ],
  item: {
    institution_id: 'ins_109508',
    institution_name: 'First Platypus Bank',
  },
  request_id: 'req',
}

describe('parseAccountsResponse', () => {
  const parsed = parseAccountsResponse(ACCOUNTS_FIXTURE)

  it('normalizes accounts to display metadata only (never balances)', () => {
    expect(parsed?.accounts).toEqual([
      {
        providerAccountId: 'blgvvBlXw3cq5GMPwqB6s6q4dLKB9WcVqGDGo',
        name: 'Plaid Checking',
        officialName: 'Plaid Gold Standard 0% Interest Checking',
        mask: '0000',
        accountType: 'depository',
        accountSubtype: 'checking',
      },
      {
        providerAccountId: '6PdjjRP6LmugpBy5NgQvUqpRXMWxzktg3rwrk',
        name: 'Plaid Saving',
        officialName: null,
        mask: null,
        accountType: 'depository',
        accountSubtype: 'savings',
      },
    ])
    expect(JSON.stringify(parsed)).not.toContain('balances')
  })

  it('carries the item institution identity when present', () => {
    expect(parsed?.institutionId).toBe('ins_109508')
    expect(parsed?.institutionName).toBe('First Platypus Bank')
  })

  it('tolerates a missing institution identity', () => {
    const bare = parseAccountsResponse({
      accounts: [],
      item: {},
    })
    expect(bare).toEqual({ accounts: [], institutionId: null, institutionName: null })
  })

  it('returns null on malformed payloads', () => {
    expect(parseAccountsResponse({ item: {} })).toBeNull()
    expect(parseAccountsResponse(null)).toBeNull()
  })
})

describe('parseInstitutionResponse (/institutions/get_by_id fallback)', () => {
  it('extracts the institution name', () => {
    expect(
      parseInstitutionResponse({ institution: { institution_id: 'ins_109508', name: 'First Platypus Bank' } })
    ).toBe('First Platypus Bank')
  })

  it('is graceful about absence', () => {
    expect(parseInstitutionResponse({})).toBeNull()
    expect(parseInstitutionResponse(null)).toBeNull()
  })
})
