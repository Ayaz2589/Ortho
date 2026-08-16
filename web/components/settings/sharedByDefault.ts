// Spec 050 — a per-device preference controlling whether a NEW transaction starts
// owned by the whole household or by the person entering it.
//
// Per-device rather than a household column, for two reasons: it needs no migration,
// and under the handler pattern (one person entering money for several who have no
// account) a household typically shares one device, so the practical cost of not
// syncing is low. If multi-device households become common this should be promoted to
// a `households` column — the read/write seam here is the only thing that would change.
//
// Mirrors components/settings/textSize.ts: a read/write pair that is the single source
// of truth for both the transaction form and the Settings row. No boot script — this
// affects form state, never paint, so there is nothing to flash.

const STORAGE_KEY = 'ortho.sharedByDefault'

/** Shipped default: shared. A household that installed Ortho to share money should not
 *  have to discover a setting before its ledger reflects that. */
export const SHARED_BY_DEFAULT_FALLBACK = true

/**
 * Read the preference. Defaults to `true`.
 *
 * Wrapped in try/catch because `localStorage` can throw: it is undefined during SSR/static
 * export, and Safari private mode can reject access outright. A failure means "use the
 * default", never a crash.
 */
export function readSharedByDefault(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'true') return true
    if (v === 'false') return false
    return SHARED_BY_DEFAULT_FALLBACK
  } catch {
    return SHARED_BY_DEFAULT_FALLBACK
  }
}

/** Persist the preference for this device. Silently ignores storage failures. */
export function writeSharedByDefault(shared: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, shared ? 'true' : 'false')
  } catch {
    /* preference is best-effort; never break the settings screen over it */
  }
}
