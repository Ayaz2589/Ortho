'use client'

import { type ReactNode } from 'react'
import { AppStateProvider, useApp } from '@/lib/store'
import { TabBar } from '@/components/TabBar'
import { Sidebar } from '@/components/Sidebar'

function Shell({ children }: { children: ReactNode }) {
  const { loading, error } = useApp()
  return (
    <div className="sm:flex sm:h-screen sm:overflow-hidden">
      <Sidebar />
      <main className="relative flex-1 sm:min-w-0 sm:overflow-y-auto sm:[scrollbar-gutter:stable]">
        {error && (
          <div className="sticky top-0 z-40 bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="px-4 pb-24 pt-2 sm:px-8 sm:pb-12 sm:pt-4 lg:px-10">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-32 text-sm text-text-3">
              Loading…
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
