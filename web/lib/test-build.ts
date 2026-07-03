/**
 * Is this a *test* build (development / preview), as opposed to production?
 *
 * The single gate for the Settings → Developer feature-flag section and every
 * code path the flags gate. It is the web mirror of iOS's `TestBuild.isTestBuild`
 * (which uses `#if DEBUG` OR the TestFlight sandbox receipt). On web the signal
 * is the build environment:
 *   - `NEXT_PUBLIC_VERCEL_ENV` is `production | preview | development` on Vercel
 *     and is inlined into the client bundle at build time.
 *   - Locally (`next dev`) and under Vitest, that var is absent, so we fall back
 *     to `NODE_ENV` (`development`/`test` → test build; `production` → not).
 *
 * Because the comparison is against build-time constants, guarding UI/behavior
 * with `isTestBuild()` lets a production build dead-code-eliminate the flag
 * machinery — a real customer's bundle never contains it (FR-002/FR-003).
 */
export function isTestBuild(): boolean {
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV
  if (vercelEnv) return vercelEnv !== 'production'
  return process.env.NODE_ENV !== 'production'
}
