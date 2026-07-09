'use client'

import { type ReactNode } from 'react'
import { AppStateProvider, useApp } from '@/lib/store'
import { TabBar } from '@/components/TabBar'
import { Sidebar } from '@/components/Sidebar'

function Shell({ children }: { children: ReactNode }) {
  const { loading, error, bootstrapFailed, dismissError, retryBootstrap, t } = useApp()
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
  return (
    <AppStateProvider>
      <Shell>{children}</Shell>
    </AppStateProvider>
  )
}
