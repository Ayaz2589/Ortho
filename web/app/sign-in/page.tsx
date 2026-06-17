'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PrimaryButton } from '@/components/ui'

function SignIn() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const iosActive = params.get('reason') === 'ios_active'
  const validEmail = email.includes('@') && email.includes('.')

  async function sendCode(target: string) {
    setLoading(true)
    setError(null)
    const { error: e } = await supabase.auth.signInWithOtp({ email: target.trim() })
    setLoading(false)
    if (e) setError(e.message)
    else setPendingEmail(target.trim())
  }

  async function verify() {
    setLoading(true)
    setError(null)
    const { error: e } = await supabase.auth.verifyOtp({
      email: pendingEmail!,
      token: code.trim(),
      type: 'email',
    })
    setLoading(false)
    if (e) {
      setError(e.message)
      return
    }
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-text text-2xl font-light text-bg">
            O
          </div>
          <h1 className="text-2xl font-light tracking-tight text-text">Ortho</h1>
          <p className="mt-1 text-sm text-text-2">Household finance, in order.</p>
        </div>

        {iosActive && !pendingEmail && (
          <div className="mb-4 rounded-xl bg-[var(--destructive)]/10 px-4 py-3 text-sm text-destructive">
            Your account is active on iOS. Sign in again to continue on web.
          </div>
        )}

        {!pendingEmail ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (validEmail) sendCode(email)
            }}
            className="flex flex-col gap-4"
          >
            <h2 className="text-lg font-normal text-text">Sign in</h2>
            <p className="-mt-2 text-sm text-text-2">
              We&apos;ll email you an 8-digit code. No password, no fuss.
            </p>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-xl border border-hairline bg-surface px-4 py-3 text-text outline-none focus:border-accent"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <PrimaryButton type="submit" disabled={!validEmail || loading}>
              {loading ? 'Sending…' : 'Send code'}
            </PrimaryButton>
            <p className="text-center text-xs text-text-3">
              By continuing you agree to our Terms and Privacy.
            </p>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length >= 8) verify()
            }}
            className="flex flex-col gap-4"
          >
            <h2 className="text-lg font-normal text-text">Enter your code</h2>
            <p className="-mt-2 text-sm text-text-2">
              Sent to <span className="font-normal text-text">{pendingEmail}</span>.
            </p>
            <input
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="12345678"
              className="rounded-xl border border-hairline bg-surface px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-text outline-none focus:border-accent"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <PrimaryButton type="submit" disabled={code.length < 8 || loading}>
              {loading ? 'Verifying…' : 'Verify'}
            </PrimaryButton>
            <div className="flex items-center justify-between text-xs text-text-2">
              <button
                type="button"
                onClick={() => {
                  setPendingEmail(null)
                  setCode('')
                  setError(null)
                }}
              >
                Use a different email
              </button>
              <button type="button" onClick={() => sendCode(pendingEmail)}>
                Send again
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignIn />
    </Suspense>
  )
}
