'use client'

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { SplashScreen } from '@capacitor/splash-screen'
import { AppStateProvider, useApp } from '@/lib/store'
import { useBiometricGate } from '@/lib/biometricGate'
import { applyAppearance, readAppearance } from '@/components/settings/appearance'
import { useTranslate } from '@/lib/i18n'
import { asLanguage, DEFAULT_LANGUAGE, type Language } from '@/lib/language'
import { TabBar } from '@/components/TabBar'
import { Sidebar } from '@/components/Sidebar'

/** spec 021, FR-011 — shown while `useBiometricGate()` is 'checking' or
 *  'locked'. Never rendered on a device with no biometric enrollment (the
 *  gate resolves straight to 'unlocked' there — see lib/biometricGate.ts).
 *  spec 023 B4: a fixed OPAQUE overlay above a kept-mounted AppStateProvider —
 *  it covers all household data until unlock, while the data mounts behind it so
 *  unlocking never re-bootstraps. Builds its own `t` from the persisted language,
 *  same as app/sign-in/page.tsx. */
function BiometricLockScreen({ locked, onRetry }: { locked: boolean; onRetry: () => void }) {
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)
  useEffect(() => {
    setLanguage(asLanguage(localStorage.getItem('language')))
  }, [])
  // spec 021: Shell's manual splash hide never runs while the gate holds the
  // app locked. Once the lock screen is interactive (the 'locked' "Try again"
  // state after a failed/cancelled unlock), dismiss the splash so it doesn't
  // cover the unlock UI. Left up during the transient 'checking' state so the
  // normal unlocked path never flashes the bare fingerprint icon.
  useEffect(() => {
    if (locked) void SplashScreen.hide()
  }, [locked])
  const t = useTranslate(language)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: 'var(--bg)', paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
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

function Shell({ children, active }: { children: ReactNode; active: boolean }) {
  const { loading, error, bootstrapFailed, dismissError, retryBootstrap, t } = useApp()

  // spec 021: capacitor.config.ts sets launchAutoHide: false — hide the
  // splash manually once loading first resolves (first meaningful paint),
  // not on a fixed timer, so a slow cold boot never shows a blank flash.
  // A no-op on desktop/mobile web (the plugin's web shim resolves harmlessly).
  // spec 023 B4: only the ACTIVE (unlocked) shell hides the splash — while the
  // biometric lock overlays this kept-mounted provider, the lock screen owns
  // splash timing so the 'checking' state never flashes the bare fingerprint.
  const splashHidden = useRef(false)
  useEffect(() => {
    if (!active || loading || splashHidden.current) return
    splashHidden.current = true
    void SplashScreen.hide()
  }, [active, loading])

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
  const unlocked = gate.state === 'unlocked'

  // spec 023 B10: apply the persisted appearance — including the native
  // status-bar text style — at app-shell mount, so the status bar matches the
  // light/dark theme from launch and on every tab, not only after the Settings
  // page is opened. No-op on desktop/mobile web (syncStatusBar is native-only).
  useEffect(() => {
    applyAppearance(readAppearance())
  }, [])

  // spec 023 B4: the provider is ALWAYS mounted; the biometric lock renders as a
  // fixed opaque OVERLAY above it while 'checking'/'locked', instead of the old
  // early-return that unmounted the whole subtree and forced a full re-bootstrap
  // (spinner + 11 selects, lost scroll/modals/input) on every unlock. The overlay
  // covers all household data until unlock. FR-011: 'checking' shows the overlay
  // blank (no "Try again" yet); a device with no enrollment resolves straight to
  // 'unlocked' and never shows it.
  return (
    <AppStateProvider>
      <Shell active={unlocked}>{children}</Shell>
      {!unlocked && (
        <BiometricLockScreen locked={gate.state === 'locked'} onRetry={() => void gate.retry()} />
      )}
    </AppStateProvider>
  )
}
