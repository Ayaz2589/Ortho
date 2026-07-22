/**
 * Is this a *test* build (development / preview / stage), as opposed to
 * production?
 *
 * The single gate for the Settings → Developer feature-flag section and every
 * code path the flags gate. It is the web mirror of iOS's `TestBuild.isTestBuild`
 * (which uses `#if DEBUG` OR the TestFlight sandbox receipt).
 *
 * Since spec 030 this is defined in terms of the unified environment signal
 * `appEnv()` — a test build is simply any non-production environment
 * (`local | stage`). The truth table is unchanged from the previous
 * `NEXT_PUBLIC_VERCEL_ENV`/`NODE_ENV` logic (production → false; local, Vercel
 * preview, `next dev`, and Vitest → true), but resolution now goes through the
 * one `appEnv()` source of truth, which is **deny-by-default to production** for
 * any environment it cannot positively identify as non-prod.
 *
 * Because `appEnv()` is a build-time constant, guarding UI/behavior with
 * `isTestBuild()` lets a production build dead-code-eliminate the flag machinery
 * — a real customer's bundle never contains it (FR-002/FR-003).
 */
import { appEnv } from './app-env'

export function isTestBuild(): boolean {
  return appEnv() !== 'prod'
}
