/**
 * Remembered collapse state for the "Copy from most common" category sections.
 *
 * The copy shortcut groups the household's most-common merchants under a header
 * per category. Each header is a disclosure the user can collapse to tuck a
 * category out of the way; we remember which categories were collapsed so the
 * next time the panel opens it looks exactly as the user left it. The stored
 * value is a pure UX hint — being stale or absent only changes which sections
 * start open, never any real data. All reads are validated; nothing here throws.
 *
 * Persisted as a JSON array of collapsed category slugs under
 * `ortho.txCopyCollapsed`, mirroring the client-preference convention used by
 * `ortho.skeletonCounts` / `ortho.flags`.
 */

const STORAGE_KEY = 'ortho.txCopyCollapsed'

/**
 * The set of category slugs the user last left collapsed. Any failure (no
 * storage, corrupt JSON, wrong shape) resolves to an empty set — i.e. every
 * section open — rather than throwing. Non-string entries are ignored.
 */
export function readCollapsedCategories(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set()
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((c): c is string => typeof c === 'string'))
  } catch {
    return new Set()
  }
}

/**
 * Persist the currently-collapsed category slugs. De-duplicated and reduced to
 * strings before writing. A no-op if storage is unavailable or throws (private
 * mode, quota) — remembering collapse state is best-effort and must never break
 * the caller.
 */
export function writeCollapsedCategories(categories: Iterable<string>): void {
  try {
    if (typeof localStorage === 'undefined') return
    const unique = [...new Set(categories)].filter((c) => typeof c === 'string')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique))
  } catch {
    /* storage unavailable — remembered collapse state is best-effort */
  }
}
