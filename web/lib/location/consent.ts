// Financial Routines location consent (spec 044 US4). Pure helper only — the actual
// Supabase read/write lives in store.tsx (this codebase's convention: lib/ modules stay pure,
// store.tsx owns all DB calls), mirroring lib/finance/*'s relationship to store.tsx elsewhere.
// Contract: specs/044-financial-routines/contracts/location-and-geocoding.md.

import type { LocationConsentLevel } from '../types'

/** Given the previous and next consent level, which timestamp(s) should be stamped `now`?
 *  Moving OFF → a real level stamps `granted_at`; moving a real level → OFF stamps `revoked_at`.
 *  A same-level "change" (e.g. re-confirming) stamps neither. */
export function consentTransition(
  previousLevel: LocationConsentLevel,
  nextLevel: LocationConsentLevel,
  now: string
): { grantedAt: string | undefined; revokedAt: string | undefined } {
  return {
    grantedAt: previousLevel === 'off' && nextLevel !== 'off' ? now : undefined,
    revokedAt: previousLevel !== 'off' && nextLevel === 'off' ? now : undefined,
  }
}

/** Whether moving to `nextLevel` should cascade-delete the user's captured visits (FR-015). */
export function shouldDeleteVisitsOnTransition(
  previousLevel: LocationConsentLevel,
  nextLevel: LocationConsentLevel
): boolean {
  return previousLevel !== 'off' && nextLevel === 'off'
}
