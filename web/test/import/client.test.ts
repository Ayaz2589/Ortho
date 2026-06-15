import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { signInWithOtp, verifyOtp } = vi.hoisted(() => ({ signInWithOtp: vi.fn(), verifyOtp: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithOtp, verifyOtp } }),
}))

import { makeClient, loadEnv } from '../../scripts/import/db/client'

beforeEach(() => {
  signInWithOtp.mockReset()
  verifyOtp.mockReset()
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('makeClient — email OTP sign-in', () => {
  it('sends a code, verifies it, and returns the user id', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    signInWithOtp.mockResolvedValue({ error: null })
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u9' } }, error: null })
    let asked = false
    const c = await makeClient({ admin: false, email: 'a@b.com', requestCode: async () => ((asked = true), '123456') })
    expect(c.userId).toBe('u9')
    expect(asked).toBe(true)
    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'a@b.com' })
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'email' })
  })
  it('throws when the email is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    await expect(makeClient({ admin: false, requestCode: async () => '1' })).rejects.toThrow(/MISSING_EMAIL/)
  })
  it('throws when OTP verification fails', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    signInWithOtp.mockResolvedValue({ error: null })
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'bad code' } })
    await expect(makeClient({ admin: false, email: 'a@b.com', requestCode: async () => '000000' })).rejects.toThrow(/OTP_VERIFY_FAILED/)
  })
  it('throws when the Supabase URL env is missing', async () => {
    await expect(makeClient({ admin: false, email: 'a@b.com', requestCode: async () => '1' })).rejects.toThrow(/MISSING_ENV/)
  })
})

describe('makeClient — admin (service role)', () => {
  it('uses the service-role key and the given user id', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-real'
    const c = await makeClient({ admin: true, asUserId: 'u1' })
    expect(c.userId).toBe('u1')
  })
  it('rejects a placeholder service key', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE'
    await expect(makeClient({ admin: true, asUserId: 'u1' })).rejects.toThrow(/SERVICE_ROLE_KEY/)
  })
})

describe('loadEnv', () => {
  it('loads file keys without overriding existing process.env values', () => {
    const p = join(tmpdir(), `ortho-env-${process.pid}-${Date.now()}`)
    writeFileSync(p, 'FOO_X=bar\nNEXT_PUBLIC_SUPABASE_URL="https://file.example"\n# a comment\n')
    process.env.FOO_X = 'preset'
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    try {
      loadEnv(p)
      expect(process.env.FOO_X).toBe('preset') // existing not overridden
      expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://file.example') // quotes stripped
    } finally {
      rmSync(p)
      delete process.env.FOO_X
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
    }
  })
  it('is a no-op when the file does not exist', () => {
    expect(() => loadEnv(join(tmpdir(), 'definitely-not-here-xyz'))).not.toThrow()
  })
})
