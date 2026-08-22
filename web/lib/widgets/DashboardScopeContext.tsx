'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useDashboardScope, type DashboardScope } from '@/lib/useDashboardRange'

/**
 * Shared dashboard time scope (spec 035 — Section 0 foundation).
 *
 * `useDashboardScope()` keeps the active month/range in local `useState`, so it
 * MUST be called exactly once and shared — if every widget called it, each would
 * get its own independent month and the board would desync (decision D1). We hold
 * that single instance in a dedicated context (NOT the global store, which is for
 * persisted household data + explicit preferences) so widget bodies stay propless:
 * they read the active window through `useDashboardScopeContext()` exactly as they
 * already read data through `useApp()`.
 */
const DashboardScopeContext = createContext<DashboardScope | null>(null)

/** Calls `useDashboardScope()` once and supplies it to every descendant. Wrap the
 *  overview board so the picker and all widgets read the same window. */
export function DashboardScopeProvider({ children }: { children: ReactNode }) {
  const scope = useDashboardScope()
  return (
    <DashboardScopeContext.Provider value={scope}>
      {children}
    </DashboardScopeContext.Provider>
  )
}

/** Read the shared scope. Throws if used outside a `DashboardScopeProvider` so a
 *  misplaced widget fails loudly instead of silently getting its own scope. */
export function useDashboardScopeContext(): DashboardScope {
  const scope = useContext(DashboardScopeContext)
  if (scope === null) {
    throw new Error(
      'useDashboardScopeContext must be used within a DashboardScopeProvider'
    )
  }
  return scope
}
