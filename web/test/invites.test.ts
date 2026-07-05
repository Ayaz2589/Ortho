/**
 * Invite-code codec — spec 017, contracts/invite-code.md.
 *
 * The literal cases marked "contract §6" are the cross-surface convention lock:
 * iOS/Ortho-iOSTests/InviteCodecTests.swift asserts the SAME literals. Change
 * them only per the contract's change-control rules (both suites + contract doc
 * in the same commit).
 */
import { describe, it, expect } from 'vitest'
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  generateInviteCode,
  formatInviteCode,
  canonicalizeInviteCode,
  hashInviteCode,
  inviteStatus,
  joinLink,
} from '@/lib/invites'

describe('invite code generation', () => {
  it('generates codes of exactly 10 characters from the Crockford alphabet', () => {
    expect(INVITE_CODE_LENGTH).toBe(10)
    expect(INVITE_CODE_ALPHABET).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ')
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode()
      expect(code).toHaveLength(INVITE_CODE_LENGTH)
      for (const ch of code) expect(INVITE_CODE_ALPHABET).toContain(ch)
    }
  })

  it('generates distinct codes (CSPRNG, not a constant)', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generateInviteCode()))
    expect(seen.size).toBeGreaterThan(1)
  })

  it('returns the canonical form (no separator) — round-trips through format (contract §6 T5)', () => {
    for (let i = 0; i < 20; i++) {
      const g = generateInviteCode()
      expect(canonicalizeInviteCode(formatInviteCode(g))).toBe(g)
    }
  })
})

describe('formatInviteCode (contract §6 T4)', () => {
  it('groups as XXXXX-XXXXX', () => {
    expect(formatInviteCode('ABCDE23456')).toBe('ABCDE-23456')
  })
})

describe('canonicalizeInviteCode', () => {
  it('uppercases and strips the separator (contract §6 T1)', () => {
    expect(canonicalizeInviteCode('abcde-23456')).toBe('ABCDE23456')
  })

  it('maps the Crockford confusables O→0, I→1, L→1 (contract §6 T2)', () => {
    expect(canonicalizeInviteCode('oil0-o1ilo')).toBe('011001110')
  })

  it('strips every non-alphanumeric, not just hyphens', () => {
    expect(canonicalizeInviteCode(' ab cd e_2:34•56 ')).toBe('ABCDE23456')
  })
})

describe('hashInviteCode (contract §6 T3)', () => {
  it('produces the lowercase-hex SHA-256 of the canonical string', async () => {
    // Must equal Postgres encode(digest('ABCDE23456','sha256'),'hex') — the
    // accept_invite RPC's hash of the same canonical token.
    await expect(hashInviteCode('ABCDE23456')).resolves.toBe(
      '82a15347a056ccbf451fbd1c865eed21ec190069eedd32b0c9dc6452887811cc'
    )
  })

  it('is 64 hex chars for any input', async () => {
    await expect(hashInviteCode(generateInviteCode())).resolves.toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('inviteStatus', () => {
  const now = new Date('2026-07-05T12:00:00.000Z')
  const past = '2026-07-01T12:00:00.000Z'
  const future = '2026-07-10T12:00:00.000Z'

  it('redeemed wins over everything', () => {
    expect(inviteStatus({ expires_at: past, redeemed_at: past }, now)).toBe('redeemed')
    expect(inviteStatus({ expires_at: future, redeemed_at: past }, now)).toBe('redeemed')
  })

  it('expired when expires_at ≤ now and not redeemed', () => {
    expect(inviteStatus({ expires_at: past, redeemed_at: null }, now)).toBe('expired')
    expect(inviteStatus({ expires_at: now.toISOString(), redeemed_at: null }, now)).toBe('expired')
  })

  it('pending otherwise', () => {
    expect(inviteStatus({ expires_at: future, redeemed_at: null }, now)).toBe('pending')
  })
})

describe('joinLink', () => {
  it('builds the display-format join URL', () => {
    expect(joinLink('https://ortho.example', 'ABCDE23456')).toBe(
      'https://ortho.example/join?code=ABCDE-23456'
    )
  })
})
