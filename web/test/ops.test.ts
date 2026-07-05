/**
 * Spec 017 T028 — the operator probe's report formatting (the only part of
 * the ops scripts that runs without a network; the scripts themselves are
 * [OPERATOR-PENDING] live tools, see scripts/ops/README.md).
 */
import { describe, it, expect } from 'vitest'
import { summarizeChecks } from '../scripts/ops/invite-probe'

describe('invite-probe report', () => {
  it('reports all-present as deploy-complete with exit-ok', () => {
    const { report, ok } = summarizeChecks([
      { name: 'pending_invites table', ok: true, detail: 'present' },
      { name: 'accept_invite RPC', ok: true, detail: 'present' },
    ])
    expect(ok).toBe(true)
    expect(report).toContain('OK  ')
    expect(report).toContain('deploy-complete')
    expect(report).not.toContain('MISS')
  })

  it('names every missing rail and refuses the feature', () => {
    const { report, ok } = summarizeChecks([
      { name: 'pending_invites table', ok: true, detail: 'present' },
      { name: 'accept_invite RPC', ok: false, detail: 'not in PostgREST paths' },
    ])
    expect(ok).toBe(false)
    expect(report).toContain('MISS')
    expect(report).toContain('accept_invite RPC')
    expect(report).toContain('DO NOT enable')
  })
})
