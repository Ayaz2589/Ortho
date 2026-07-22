/**
 * The single runtime environment discriminator (spec 030).
 *
 * `appEnv()` collapses every available build/runtime signal into exactly one of
 * `local | stage | prod`. It is the source of truth that `isTestBuild()`
 * (spec 015) and the local/stage auto-login (spec 030) key off, replacing the
 * ad-hoc `NEXT_PUBLIC_VERCEL_ENV !== 'production'` checks that were scattered
 * around.
 *
 * Resolution order (first hit wins):
 *   1. `NEXT_PUBLIC_APP_ENV` — the explicit signal (set per Vercel environment /
 *      in `.env.local`). Only `local|stage|prod` are honored.
 *   2. `NEXT_PUBLIC_VERCEL_ENV` — Vercel injects `production|preview|development`
 *      at build time (`production→prod`, `preview→stage`, `development→local`).
 *   3. `NODE_ENV` — `development`/`test` → local, `production` → prod.
 *   4. **Deny by default → `prod`.** An environment we cannot positively
 *      identify as non-production is treated as production, so auth-disable and
 *      test-data paths are *provably impossible* unless we can prove we are NOT
 *      in production (spec 030 FR-001/FR-004, production-safety-is-absolute).
 *
 * Because every input is a build-time constant, guarding behavior on `appEnv()`
 * lets a production build dead-code-eliminate the local/stage-only machinery.
 */
export type AppEnv = 'local' | 'stage' | 'prod'

function explicit(value: string | undefined): AppEnv | null {
  return value === 'local' || value === 'stage' || value === 'prod' ? value : null
}

export function appEnv(): AppEnv {
  const fromAppEnv = explicit(process.env.NEXT_PUBLIC_APP_ENV)
  if (fromAppEnv) return fromAppEnv

  switch (process.env.NEXT_PUBLIC_VERCEL_ENV) {
    case 'production':
      return 'prod'
    case 'preview':
      return 'stage'
    case 'development':
      return 'local'
  }

  switch (process.env.NODE_ENV) {
    case 'development':
    case 'test':
      return 'local'
    case 'production':
      return 'prod'
  }

  // Unknown: deny by default (locks auth, disables every non-prod path).
  return 'prod'
}

export function isLocal(): boolean {
  return appEnv() === 'local'
}

export function isStage(): boolean {
  return appEnv() === 'stage'
}

export function isProd(): boolean {
  return appEnv() === 'prod'
}
