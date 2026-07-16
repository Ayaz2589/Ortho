// T025 — Hosted Link session resolution via POST /link/token/get
// (research.md D3; contracts/link-session-lifecycle.md). Session results stay
// retrievable for ~6h after the hosted session ends; before the user finishes
// there is simply no public token yet.
import { describe, expect, it } from 'vitest'
import { parseHostedSessionResult } from '../src/index'

const FINISHED = {
  link_token: 'link-sandbox-abc',
  link_sessions: [
    {
      link_session_id: 'sess-1',
      results: {
        item_add_results: [
          {
            public_token: 'public-sandbox-xyz',
            item_id: 'item-1',
            institution: { institution_id: 'ins_109508', institution_name: 'First Platypus Bank' },
          },
        ],
      },
    },
  ],
}

describe('parseHostedSessionResult', () => {
  it('extracts the public token from a finished hosted session', () => {
    expect(parseHostedSessionResult(FINISHED)).toBe('public-sandbox-xyz')
  })

  it('returns null while the user has not finished (no sessions yet)', () => {
    expect(parseHostedSessionResult({ link_token: 'link-1', link_sessions: [] })).toBeNull()
  })

  it('returns null when sessions exist but carry no item_add_results', () => {
    expect(
      parseHostedSessionResult({
        link_sessions: [{ link_session_id: 's', results: { item_add_results: [] } }],
      })
    ).toBeNull()
  })

  it('scans multiple sessions and takes the first result', () => {
    expect(
      parseHostedSessionResult({
        link_sessions: [
          { results: { item_add_results: [] } },
          { results: { item_add_results: [{ public_token: 'public-2' }] } },
        ],
      })
    ).toBe('public-2')
  })

  it('is null-safe on malformed payloads', () => {
    expect(parseHostedSessionResult(null)).toBeNull()
    expect(parseHostedSessionResult({})).toBeNull()
    expect(parseHostedSessionResult({ link_sessions: [{ results: {} }] })).toBeNull()
  })
})
