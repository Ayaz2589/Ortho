// Safe-target guard for the corpus seeder (spec 026, FR-009). Pure so it can be
// unit-tested without a database. The seeder must NEVER write to the shared
// hosted project — only a local/dev Supabase stack, unless a loud double opt-in
// is set for a personal throwaway cloud project.

export function isLocalSupabaseUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const h = u.hostname.toLowerCase()
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]' ||
    h.endsWith('.local')
  )
}

export interface GuardOptions {
  url: string | undefined
  /** --i-understand-this-is-not-local was passed. */
  overrideFlag: boolean
  /** SEED_ALLOW_REMOTE=1 is set. */
  allowRemoteEnv: boolean
}

export type GuardResult = { ok: true } | { ok: false; reason: string }

export function checkSeedTarget(o: GuardOptions): GuardResult {
  if (!o.url) {
    return { ok: false, reason: 'MISSING_ENV: NEXT_PUBLIC_SUPABASE_URL is not set.' }
  }
  if (isLocalSupabaseUrl(o.url)) return { ok: true }
  if (o.overrideFlag && o.allowRemoteEnv) return { ok: true }
  return {
    ok: false,
    reason:
      `Refusing to seed a non-local Supabase target (${o.url}). ` +
      `The corpus seeder only writes to a local stack (localhost / 127.0.0.1 / *.local). ` +
      `To target a personal throwaway cloud project, pass ` +
      `--i-understand-this-is-not-local AND set SEED_ALLOW_REMOTE=1.`,
  }
}
