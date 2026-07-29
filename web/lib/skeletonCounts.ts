/**
 * Remembered list/table sizes for loading skeletons (spec 032).
 *
 * After a successful load we record how many items a dynamic collection held, so
 * the NEXT load can render a placeholder skeleton of roughly the right height —
 * a returning user with a tall ledger sees a tall ledger skeleton, not a generic
 * spinner. The stored value is a pure UX hint: it only sizes a placeholder and
 * never affects real data, so being stale or absent merely changes the skeleton
 * height. All reads are validated and clamped; nothing here ever throws.
 *
 * Persisted as a single JSON object under `ortho.skeletonCounts`, mirroring the
 * client-preference convention used by `ortho.flags` / `dashboardRange`.
 */

export type SkeletonCountKey =
  | 'transactions'
  | 'goals'
  | 'housing'
  | 'tags'
  | 'reportsSavings'
  | 'reportsCategories'

/** Upper bound on placeholder rows/cards — a very large collection never renders
 *  an absurdly long (or slow) skeleton. */
export const SKELETON_COUNT_CAP = 24

const STORAGE_KEY = 'ortho.skeletonCounts'

function clamp(n: number): number {
  return Math.max(0, Math.min(SKELETON_COUNT_CAP, Math.floor(n)))
}

/** Read the whole map defensively — any failure (no storage, corrupt JSON, wrong
 *  shape) resolves to an empty object rather than throwing. */
function readAll(): Record<string, unknown> {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * The remembered count for `key`, or `fallback` when nothing valid is stored.
 * Rejects non-integer, negative, or non-finite values (returns `fallback`), and
 * clamps a valid value to `[0, SKELETON_COUNT_CAP]`. Never throws.
 */
export function readSkeletonCount(key: SkeletonCountKey, fallback: number): number {
  const v = readAll()[key]
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
    return fallback
  }
  return clamp(v)
}

/**
 * Record a collection's last successful item count. Coerces to a non-negative
 * integer and clamps to the cap. A no-op if storage is unavailable or throws
 * (private mode, quota) — recording must never break the caller.
 */
export function writeSkeletonCount(key: SkeletonCountKey, n: number): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (typeof n !== 'number' || !Number.isFinite(n)) return
    const all = readAll()
    all[key] = clamp(n)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable — remembered sizing is best-effort */
  }
}
