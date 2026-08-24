'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Transaction } from '@/lib/types'
import { HOUSEHOLD_SCOPE, scopeTransactions, type MoneyScope } from '@/lib/scope/moneyScope'

/**
 * Shared dashboard money scope — the PEOPLE axis (spec 056), sibling to the TIME
 * axis in `DashboardScopeContext`.
 *
 * The board's contract since spec 034 is that a widget body takes NO PROPS: it
 * reads data from `useApp()` and the active window from `useDashboardScopeContext()`,
 * and a new widget is one registry entry. Threading a `personId` prop through
 * WidgetBoard → Widget → Body would break that for all fifteen widgets to serve
 * six, so the people axis arrives the same way the time axis already does.
 *
 * ── Why this context does NOT own its state ──────────────────────────────────
 * `DashboardScopeProvider` calls `useDashboardScope()` internally, because the
 * time window has exactly one consumer tree. The money scope has three consumers
 * at different depths — `MemberScopePicker` writes it, `NetSummaryHero` reads it
 * as a prop, and the board reads it through here — so the dashboard page owns the
 * state and passes it down.
 *
 * ── Why a missing provider is HOUSEHOLD rather than a throw ──────────────────
 * `useDashboardScopeContext()` throws when unwrapped, and that is right there:
 * there is no such thing as "no month", so a missing provider can only be a bug.
 * Here there IS an identity value. `scopeTransactions(txs, HOUSEHOLD_SCOPE)`
 * returns the *same array reference* (spec 051 made the household case a strict
 * no-op and pins that identity in test/scope/moneyScope.test.ts), so "no provider"
 * and "household" are not merely similar states — they are the same computation.
 * A default that IS the identity cannot mask a bug the way a guessed fallback can.
 *
 * The practical payoff is the reason this was chosen: every pre-existing suite
 * under test/widgets/ renders bodies directly, knowing nothing about a money
 * scope. With this default they keep passing UNMODIFIED, and that untouched green
 * is the evidence that household output did not move (FR-005 / SC-002). Making
 * the hook throw would have forced a provider into twenty test files — an edit
 * that destroys exactly the evidence it was meant to preserve.
 */
const MoneyScopeContext = createContext<MoneyScope>(HOUSEHOLD_SCOPE)

/** Supplies one money scope to every descendant widget body. */
export function MoneyScopeProvider({
  scope,
  children,
}: {
  scope: MoneyScope
  children: ReactNode
}) {
  return <MoneyScopeContext.Provider value={scope}>{children}</MoneyScopeContext.Provider>
}

/** The active money scope. Household when there is no provider — see the header. */
export function useMoneyScope(): MoneyScope {
  return useContext(MoneyScopeContext)
}

/**
 * The ledger narrowed to the active scope — the one line a widget body needs to
 * join the people axis.
 *
 * Memoized here so the hook, not each body, owns the caching rule. useMemo is
 * per hook instance, so each consuming widget still runs its own O(n)
 * projection on a scope change — what the memo prevents is re-projecting on
 * unrelated re-renders. That only holds if `scope` is referentially stable,
 * which is why the dashboard page keeps a `MoneyScope` in state
 * (`personScope()` allocates) and re-resolves it with `resolveScope`, which
 * returns the same object rather than a copy.
 */
export function useScopedTransactions(transactions: Transaction[]): Transaction[] {
  const scope = useMoneyScope()
  return useMemo(() => scopeTransactions(transactions, scope), [transactions, scope])
}
