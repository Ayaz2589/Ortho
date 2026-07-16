'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SplashScreen } from '@capacitor/splash-screen'
import { createClient } from '@/lib/supabase/client'
import { PrimaryButton } from '@/components/ui'
import { useTranslate } from '@/lib/i18n'
import { asLanguage, DEFAULT_LANGUAGE, type Language } from '@/lib/language'

function SignIn() {
  const router = useRouter()
  const supabase = createClient()

  // spec 021: capacitor.config.ts sets launchAutoHide: false, so the splash is
  // dismissed manually. The only other hide() lives in the (app) Shell (after
  // app data loads) — but a signed-out launch lands here, outside that layout,
  // so without this the Capacitor splash would cover the sign-in screen
  // forever. First paint of the sign-in form is immediate, so hide on mount.
  // No-op on desktop/mobile web (the plugin's web shim resolves harmlessly).
  useEffect(() => {
    void SplashScreen.hide()
  }, [])

  // Not rendered under AppStateProvider, so build `t` locally from the same
  // persisted language the store uses (read after mount, like the store).
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)
  useEffect(() => {
    setLanguage(asLanguage(localStorage.getItem('language')))
  }, [])
  const t = useTranslate(language)

  // spec 021: this used to be the deleted `proxy.ts`'s `isAuthRoute` branch
  // (redirect a signed-in user away from /sign-in). Under static export there
  // is no server hop, so the check moves here, on mount.
  useEffect(() => {
    let cancelled = false
    async function checkAlreadySignedIn() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!cancelled && user) router.replace('/dashboard')
    }
    void checkAlreadySignedIn()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          <p className="mt-1 text-sm text-text-2">{t('Household finance, in order.')}</p>
        </div>

        {!pendingEmail ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (validEmail) sendCode(email)
            }}
            className="flex flex-col gap-4"
          >
            <h2 className="text-lg font-normal text-text">{t('Sign in')}</h2>
            <p className="-mt-2 text-sm text-text-2">
              {t("We'll email you an 8-digit code. No password, no fuss.")}
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
              {loading ? t('Sending…') : t('Send code')}
            </PrimaryButton>
            <p className="text-center text-xs text-text-3">
              {/* Seed key carries iOS's **bold** markers; web renders it plain. */}
              {t('By continuing you agree to our **Terms** and **Privacy**.').replace(/\*\*/g, '')}
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
            <h2 className="text-lg font-normal text-text">{t('Enter your code')}</h2>
            <p className="-mt-2 text-sm text-text-2">
              {/* Seed key marks the email with iOS's **bold** markers; render
                  the bold segments as styled spans. */}
              {t('Sent to **{0}**.', pendingEmail).split('**').map((part, i) =>
                i % 2 === 1 ? (
                  <span key={i} className="font-normal text-text">
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
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
              {loading ? t('Verifying…') : t('Verify')}
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
                {t('Use a different email')}
              </button>
              <button type="button" onClick={() => sendCode(pendingEmail)}>
                {t('Send again')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function SignInPage() {
  return <SignIn />
}
