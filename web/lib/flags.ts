/**
 * Test-build feature flags (spec 015). Two disposable, per-browser toggles that
 * only exist on test builds and are forced OFF in production. Mirrors iOS's
 * `FeatureFlags`; persistence follows the `components/settings/appearance.ts`
 * read/write pattern (localStorage), plus a cookie so the server-side `proxy.ts`
 * auth gate can honor `bypassAuth` (middleware cannot read localStorage).
 *
 * Safety invariant (FR-003): off a test build every flag reads `false`
 * regardless of any persisted value — so no test-data / auth-bypass path is
 * reachable in production even if a value was carried over or hand-edited.
 */
import { isTestBuild } from './test-build'

export interface FlagState {
  /** Run the app on the isolated in-memory sample dataset (no live backend). */
  useTestData: boolean
  /** Skip the sign-in gate; implies `useTestData`. */
  bypassAuth: boolean
}

const STORAGE_KEY = 'ortho.flags'
/** Cookie mirror of `bypassAuth`, read by the server-side proxy gate. */
export const BYPASS_AUTH_COOKIE = 'ortho_bypass_auth'

const OFF: FlagState = { useTestData: false, bypassAuth: false }

export function readFlags(): FlagState {
  if (!isTestBuild()) return { ...OFF }
  if (typeof localStorage === 'undefined') return { ...OFF }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...OFF }
    const parsed = JSON.parse(raw) as Partial<FlagState>
    return { useTestData: !!parsed.useTestData, bypassAuth: !!parsed.bypassAuth }
  } catch {
    return { ...OFF }
  }
}

export function writeFlags(next: FlagState): void {
  // No-op in production so a stray call can never enable a flag there.
  if (!isTestBuild()) return
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  if (typeof document !== 'undefined') {
    // The proxy gate reads this cookie; keep it in lockstep with bypassAuth.
    document.cookie = next.bypassAuth
      ? `${BYPASS_AUTH_COOKIE}=1; path=/; max-age=86400; samesite=lax`
      : `${BYPASS_AUTH_COOKIE}=; path=/; max-age=0; samesite=lax`
  }
}

/** The data layer keys off this: bypassing auth always implies test data
 *  (there is no real session behind bypass to read live data from). */
export function effectiveUseTestData(f: FlagState): boolean {
  return f.useTestData || f.bypassAuth
}
