// Supabase client for the CLI. Two modes (research.md D10):
//   sign-in (default): email OTP — exactly like the web/iOS apps (signInWithOtp →
//     emailed 8-digit code → verifyOtp). Yields correct created_by; RLS applies.
//   admin (--admin):   service-role key, bypasses RLS for cross-account attribution.
// Plain @supabase/supabase-js (not the @supabase/ssr browser/server clients).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env.local')

/** Load an env file into process.env for any keys not already set. */
export function loadEnv(envPath: string = DEFAULT_ENV_PATH): void {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

export interface AuthedClient {
  supabase: SupabaseClient
  /** The user id that will own created rows (created_by). */
  userId: string
}

// Supabase's client constructs a realtime client that needs a global WebSocket.
// Node < 22 has none, so polyfill it from `ws`. No-op on Node 22+ (native WS).
let wsReady = false
async function ensureWebSocket(): Promise<void> {
  if (wsReady || typeof (globalThis as { WebSocket?: unknown }).WebSocket !== 'undefined') return
  const ws = (await import('ws')) as { default?: unknown }
  ;(globalThis as { WebSocket?: unknown }).WebSocket = ws.default ?? ws
  wsReady = true
}

export interface ClientOptions {
  admin: boolean
  /** Email for OTP sign-in (sign-in mode). */
  email?: string
  /** Announce that the code email was sent (UI hook). */
  onCodeSent?: (email: string) => void
  /** Prompt for and return the emailed verification code (sign-in mode). */
  requestCode?: () => Promise<string>
}

export async function makeClient(opts: ClientOptions): Promise<AuthedClient> {
  await ensureWebSocket()
  // Env is loaded by the CLI entrypoints (cli.ts/tx.ts) before this is called.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('MISSING_ENV: NEXT_PUBLIC_SUPABASE_URL')

  if (opts.admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key || /YOUR_SERVICE_ROLE_KEY/i.test(key)) {
      throw new Error('MISSING_ENV: a real SUPABASE_SERVICE_ROLE_KEY is required for ADMIN=1')
    }
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    // Admin mode attributes created_by by name-matching the statement holder,
    // resolved after the fact by the CLI — there is no ambient admin user id.
    return { supabase, userId: '' }
  }

  // Email OTP sign-in (mirrors the apps).
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anon) throw new Error('MISSING_ENV: NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!opts.email) throw new Error('MISSING_EMAIL: set IMPORT_EMAIL or enter it when prompted')
  if (!opts.requestCode) throw new Error('sign-in requires an interactive terminal for the OTP code')

  const supabase = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: sendErr } = await supabase.auth.signInWithOtp({ email: opts.email })
  if (sendErr) throw new Error(`OTP_SEND_FAILED: ${sendErr.message}`)
  opts.onCodeSent?.(opts.email)

  const token = (await opts.requestCode()).trim()
  const { data, error } = await supabase.auth.verifyOtp({ email: opts.email, token, type: 'email' })
  if (error || !data.user) throw new Error(`OTP_VERIFY_FAILED: ${error?.message ?? 'no user returned'}`)
  return { supabase, userId: data.user.id }
}
