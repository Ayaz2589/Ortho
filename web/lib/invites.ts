/**
 * Invite-code codec — spec 017.
 *
 * Cross-surface convention contract: specs/017-partner-invite-join/contracts/invite-code.md.
 * Hand-mirrored by iOS `Shared/InviteCodec.swift` (like spec-014's ScanHeuristics tables) and
 * locked by identical literal test cases in both suites — deliberately NOT a golden vector.
 *
 * The CANONICAL form (10 uppercase Crockford-base32 chars, no separator) is the identity:
 * it is what gets hashed into `pending_invites.token_hash` at creation AND what is passed as
 * `p_token` to the `accept_invite` RPC, whose pgcrypto `encode(digest(p_token,'sha256'),'hex')`
 * must reproduce the stored hex byte-for-byte.
 */
import type { InviteStatus } from './types'

/** Crockford base32 — I, L, O, U excluded (confusables handled by canonicalization). */
export const INVITE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const INVITE_CODE_LENGTH = 10

/** A fresh canonical 10-char code (~50 bits) from the platform CSPRNG. */
export function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  // 32 divides 256, so `byte & 31` is bias-free.
  let code = ''
  for (const b of bytes) code += INVITE_CODE_ALPHABET[b & 31]
  return code
}

/** Display form: XXXXX-XXXXX. Display is derived; canonical is the identity. */
export function formatInviteCode(canonical: string): string {
  return `${canonical.slice(0, 5)}-${canonical.slice(5)}`
}

/** Normalize any user-typed form to canonical: uppercase, map the Crockford
 *  confusables (O→0, I→1, L→1), strip every non-alphanumeric. Applied on BOTH
 *  the create-side hash and redemption so a code minted anywhere redeems anywhere. */
export function canonicalizeInviteCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '')
}

/** Lowercase-hex SHA-256 of the canonical string — equals Postgres
 *  `encode(digest(p_token,'sha256'),'hex')` for the same token. */
export async function hashInviteCode(canonical: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Client-derived status; precedence redeemed → expired → pending (contract §7). */
export function inviteStatus(
  invite: { expires_at: string; redeemed_at: string | null },
  now: Date
): InviteStatus {
  if (invite.redeemed_at != null) return 'redeemed'
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return 'expired'
  return 'pending'
}

/** Web join link carrying the display-form code (consumer canonicalizes). */
export function joinLink(origin: string, canonical: string): string {
  return `${origin}/join?code=${formatInviteCode(canonical)}`
}

/** Invite lifetime: exactly 7 × 24h from the creation instant (contract §7). */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
