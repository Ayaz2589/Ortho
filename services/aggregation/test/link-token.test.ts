// T009 — /link/token/create request builder + response parser (research.md D6).
import { describe, expect, it } from 'vitest'
import { buildLinkTokenRequest, parseLinkTokenResponse } from '../src/index'

const BASE = {
  clientUserId: 'user-uuid-1',
  appBaseUrl: 'https://ortho.example.com',
}

describe('buildLinkTokenRequest (embedded)', () => {
  const req = buildLinkTokenRequest({ ...BASE, mode: 'embedded' })

  it('carries the connect-only product posture', () => {
    // Auth now (one-time product, free on Trial); transactions consent
    // collected but unbilled until the future sync feature (FR-011).
    expect(req.products).toEqual(['auth'])
    expect(req.additional_consented_products).toEqual(['transactions'])
  })

  it('is US-only English-default with the caller as client_user_id', () => {
    expect(req.country_codes).toEqual(['US'])
    expect(req.language).toBe('en')
    expect(req.client_name).toBe('Ortho')
    expect(req.user).toEqual({ client_user_id: 'user-uuid-1' })
  })

  it('embedded mode registers the SPA OAuth return route, never hosted_link', () => {
    expect(req.redirect_uri).toBe('https://ortho.example.com/plaid-oauth')
    expect(req).not.toHaveProperty('hosted_link')
  })

  it('passes a Plaid-supported language through and falls back to en otherwise', () => {
    expect(buildLinkTokenRequest({ ...BASE, mode: 'embedded', language: 'es' }).language).toBe('es')
    // Languages Ortho has catalogs for but Plaid Link does not support.
    expect(buildLinkTokenRequest({ ...BASE, mode: 'embedded', language: 'bn' }).language).toBe('en')
    expect(buildLinkTokenRequest({ ...BASE, mode: 'embedded', language: 'ja' }).language).toBe('en')
  })
})

describe('buildLinkTokenRequest (hosted)', () => {
  const req = buildLinkTokenRequest({ ...BASE, mode: 'hosted' })

  it('configures Hosted Link for an out-of-process mobile browser', () => {
    expect(req.hosted_link).toEqual({
      completion_redirect_uri: 'ortho://plaid-done',
      is_mobile_app: true,
    })
  })

  it('does not register the web OAuth redirect (Plaid handles OAuth in-session)', () => {
    expect(req).not.toHaveProperty('redirect_uri')
  })
})

describe('parseLinkTokenResponse', () => {
  it('parses token, expiration, and hosted url when present', () => {
    expect(
      parseLinkTokenResponse({
        link_token: 'link-sandbox-abc',
        expiration: '2026-07-16T18:30:00Z',
        hosted_link_url: 'https://secure.plaid.com/hl/xyz',
        request_id: 'req1',
      })
    ).toEqual({
      linkToken: 'link-sandbox-abc',
      expiresAt: '2026-07-16T18:30:00Z',
      hostedLinkUrl: 'https://secure.plaid.com/hl/xyz',
    })
  })

  it('hostedLinkUrl is null for embedded responses', () => {
    expect(
      parseLinkTokenResponse({ link_token: 'link-1', expiration: '2026-07-16T18:30:00Z' })
    ).toEqual({ linkToken: 'link-1', expiresAt: '2026-07-16T18:30:00Z', hostedLinkUrl: null })
  })

  it('returns null on malformed payloads', () => {
    expect(parseLinkTokenResponse({})).toBeNull()
    expect(parseLinkTokenResponse(null)).toBeNull()
    expect(parseLinkTokenResponse({ link_token: 42, expiration: 'x' })).toBeNull()
  })
})
