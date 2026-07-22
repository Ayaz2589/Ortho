/**
 * Local/stage auto-login (spec 030).
 *
 * In a non-production environment the app may sign a known **seed user** into
 * the REAL Supabase backend automatically, skipping the OTP sign-in screen — so
 * a developer (or the staging deploy) opens the app already authenticated and
 * fully populated, while still exercising real RLS, RPCs, and edge functions
 * (unlike the in-memory `bypassAuth` stub, which touches no backend).
 *
 * Production safety is absolute (FR-004). Auto-login is **triple-gated** so it is
 * provably impossible in production:
 *   1. `appEnv() !== 'prod'` — never in production (and deny-by-default: an
 *      environment we cannot prove is non-prod is treated as prod),
 *   2. `NEXT_PUBLIC_DEV_AUTOLOGIN === '1'` — an explicit per-environment opt-in
 *      (absent in production; it is only set on the local/staging Vercel envs),
 *   3. seed credentials are configured.
 *
 * All three are build-time constants, so a production build dead-code-eliminates
 * this path entirely. `NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD` is deliberately a
 * disposable seed-only credential (the seeded user owns only throwaway seed data
 * on a non-production backend); it must never be set in the production env.
 */
import { appEnv } from '@/lib/app-env'

export interface AutoLoginCreds {
  email: string
  password: string
}

/** The configured seed-user credentials, or null if not both present. */
export function autoLoginCreds(): AutoLoginCreds | null {
  const email = process.env.NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL
  const password = process.env.NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

/** Whether the app may auto-authenticate the seed user (see file header). */
export function autoLoginEnabled(): boolean {
  if (appEnv() === 'prod') return false
  if (process.env.NEXT_PUBLIC_DEV_AUTOLOGIN !== '1') return false
  return autoLoginCreds() !== null
}
