'use client'

// spec 051 — one selected MoneyScope shared by every scoped surface, so "Everyone" vs a
// person is ONE switch rather than a filter each screen reinvents. Mirrors
// lib/widgets/DashboardScopeContext.tsx (the TIME axis); this is the PEOPLE axis.
//
// Deliberately NOT persisted: like the dashboard's month/range scope, it is a per-session
// lens, not a setting. A stale scope pointing at a removed person resolves back to the
// household rather than emptying the app.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { HOUSEHOLD_SCOPE, resolveScope, type MoneyScope } from './moneyScope'

interface MoneyScopeValue {
  scope: MoneyScope
  setScope: (scope: MoneyScope) => void
  /** False for a one-person household — the selector is hidden and scope stays household. */
  canScope: boolean
}

const MoneyScopeCtx = createContext<MoneyScopeValue>({
  scope: HOUSEHOLD_SCOPE,
  setScope: () => {},
  canScope: false,
})

export function MoneyScopeProvider({
  activePersonIds,
  children,
}: {
  activePersonIds: string[]
  children: ReactNode
}) {
  const [raw, setScope] = useState<MoneyScope>(HOUSEHOLD_SCOPE)
  const canScope = activePersonIds.length > 1

  const value = useMemo<MoneyScopeValue>(
    () => ({
      // Resolve on every read so a person removed mid-session degrades to household scope
      // instead of leaving every surface blank.
      scope: canScope ? resolveScope(raw, activePersonIds) : HOUSEHOLD_SCOPE,
      setScope,
      canScope,
    }),
    [raw, activePersonIds, canScope]
  )

  return <MoneyScopeCtx.Provider value={value}>{children}</MoneyScopeCtx.Provider>
}

export function useMoneyScope(): MoneyScopeValue {
  return useContext(MoneyScopeCtx)
}
