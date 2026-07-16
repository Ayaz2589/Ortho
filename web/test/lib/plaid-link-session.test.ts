// @vitest-environment jsdom
// T015 (spec 024) — the client's pending-connection record
// (contracts/link-session-lifecycle.md). One fixed localStorage key; expiry is
// checked against an injected clock, never the real one (constitution VI).
import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearPendingLinkSession,
  PENDING_LINK_SESSION_KEY,
  readPendingLinkSession,
  savePendingLinkSession,
  type PendingLinkSession,
} from '@/lib/plaidLinkSession'

const NOW = new Date('2026-07-16T12:00:00Z')

function record(overrides: Partial<PendingLinkSession> = {}): PendingLinkSession {
  return {
    sessionId: 's-1',
    linkToken: 'link-sandbox-1',
    mode: 'embedded',
    expiresAt: '2026-07-16T12:30:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('pending link-session record', () => {
  it('round-trips under the fixed key', () => {
    savePendingLinkSession(record())
    expect(window.localStorage.getItem(PENDING_LINK_SESSION_KEY)).not.toBeNull()
    expect(readPendingLinkSession(NOW)).toEqual(record())
  })

  it('reads null when nothing is stored', () => {
    expect(readPendingLinkSession(NOW)).toBeNull()
  })

  it('an expired record reads null AND is cleared (calm reset)', () => {
    savePendingLinkSession(record({ expiresAt: '2026-07-16T11:59:00Z' }))
    expect(readPendingLinkSession(NOW)).toBeNull()
    expect(window.localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull()
  })

  it('a malformed stored value reads null and is cleared, never throws', () => {
    window.localStorage.setItem(PENDING_LINK_SESSION_KEY, '{not json')
    expect(readPendingLinkSession(NOW)).toBeNull()
    expect(window.localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull()
  })

  it('a structurally wrong value reads null and is cleared', () => {
    window.localStorage.setItem(PENDING_LINK_SESSION_KEY, JSON.stringify({ sessionId: 1 }))
    expect(readPendingLinkSession(NOW)).toBeNull()
    expect(window.localStorage.getItem(PENDING_LINK_SESSION_KEY)).toBeNull()
  })

  it('clearPendingLinkSession removes the record', () => {
    savePendingLinkSession(record())
    clearPendingLinkSession()
    expect(readPendingLinkSession(NOW)).toBeNull()
  })

  it('hosted records round-trip too (mode preserved for the return path)', () => {
    savePendingLinkSession(record({ mode: 'hosted' }))
    expect(readPendingLinkSession(NOW)?.mode).toBe('hosted')
  })
})
