'use client'

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { SplashScreen } from '@capacitor/splash-screen'
import { AppStateProvider, useApp } from '@/lib/store'
import { useBiometricGate } from '@/lib/biometricGate'
import { makeT } from '@/lib/i18n'
import { asLanguage, DEFAULT_LANGUAGE, type Language } from '@/lib/language'
import { TabBar } from '@/components/TabBar'
import { Sidebar } from '@/components/Sidebar'

/** spec 021, FR-011 — shown while `useBiometricGate()` is 'checking' or
 *  'locked'. Never rendered on a device with no biometric enrollment (the
 *  gate resolves straight to 'unlocked' there — see lib/biometricGate.ts).
 *  Deliberately outside AppStateProvider: no household data should even
 *  start rendering until the device is unlocked. Builds its own `t` from the
 *  persisted language, same as app/sign-in/page.tsx (also unauthenticated). */
function BiometricLockScreen({ locked, onRetry }: { locked: boolean; onRetry: () => void }) {
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)
  useEffect(() => {
    setLanguage(asLanguage(localStorage.getItem('language')))
  }, [])
  const t = useMemo(() => makeT(language), [language])

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <Fingerprint size={40} className="text-text-3" strokeWidth={1.5} />
      {locked && (
        <>
          <p className="text-[15px] text-text-2">{t('Unlock Ortho to continue')}</p>
          <button
            type="button"
            onClick={onRetry}
            className="ortho-interactive rounded-full px-5 py-2.5 text-[15px] font-normal text-accent"
            style={{ background: 'var(--chip-bg)' }}
          >
            {t('Try again')}
          </button>
        </>
      )}
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const { loading, error, bootstrapFailed, dismissError, retryBootstrap, t } = useApp()

  // spec 021: capacitor.config.ts sets launchAutoHide: false — hide the
  // splash manually once loading first resolves (first meaningful paint),
  // not on a fixed timer, so a slow cold boot never shows a blank flash.
  // A no-op on desktop/mobile web (the plugin's web shim resolves harmlessly).
  const splashHidden = useRef(false)
  useEffect(() => {
    if (loading || splashHidden.current) return
    splashHidden.current = true
    void SplashScreen.hide()
  }, [loading])

  return (
    <div className="sm:flex sm:h-screen sm:overflow-hidden">
      <Sidebar />
      <main
        className="relative flex-1 sm:min-w-0 sm:overflow-y-auto sm:[scrollbar-gutter:stable]"
        // spec 021: clears the status bar/notch/Dynamic Island on the
        // Capacitor iOS shell — resolves to 0 on any context without a safe
        // area (desktop browsers, older devices), so this is harmless there.
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        {error && (
          <div className="sticky top-0 z-40 flex items-center justify-center gap-3 border-b border-hairline bg-surface px-4 py-2 text-center text-xs text-text-2">
            <span className="min-w-0">{error}</span>
            {bootstrapFailed && (
              <button
                type="button"
                onClick={retryBootstrap}
                className="shrink-0 font-normal text-accent"
              >
                {t('Retry')}
              </button>
            )}
            <button
              type="button"
              aria-label={t('Dismiss error')}
              onClick={dismissError}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-3 transition-colors hover:text-text"
            >
              <svg width="9" height="9" viewBox="0 0 12 12">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {/* spec 021: the mobile tab bar grew by --safe-bottom (home indicator
            clearance); an arbitrary-value class (not inline style) so
            sm:pb-12 still wins at desktop widths — inline style would beat
            it regardless of breakpoint. */}
        <div className="px-4 pt-2 pb-[calc(6rem+var(--safe-bottom))] sm:px-8 sm:pb-12 sm:pt-4 lg:px-10">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-32 text-sm text-text-3">
              {t('Loading…')}
            </div>
          ) : (
            children
          )}
        </div>
      </main>
      <TabBar />
    </div>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const gate = useBiometricGate()

  // spec 021, FR-011: 'checking' and 'locked' both render the lock screen —
  // 'checking' shows it blank (no "Try again" yet, avoids a flash of a retry
  // button before the first checkBiometry() resolves); a device with no
  // enrollment never reaches either state (the gate resolves straight to
  // 'unlocked' — see lib/biometricGate.ts).
  if (gate.state !== 'unlocked') {
    return <BiometricLockScreen locked={gate.state === 'locked'} onRetry={() => void gate.retry()} />
  }

  return (
    <AppStateProvider>
      <Shell>{children}</Shell>
    </AppStateProvider>
  )
}
