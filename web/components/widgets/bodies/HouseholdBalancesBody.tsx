'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { useMoneyScope } from '@/lib/widgets/MoneyScopeContext'
import { outstandingBalances, peopleInLedger } from '@/lib/finance/balances'

/**
 * Household balances widget body (spec 053) — who owes whom, for THREE OR MORE people.
 *
 * The predecessor was deleted in spec 043 because its calculation was viewer-anchored: in a
 * three-adult household what one roommate owed another was invisible to the third. This shows
 * EVERY non-zero pair to every member, which is the whole point of the rebuild.
 *
 * Balances are a standing position over the entire ledger, so this widget deliberately does
 * NOT read the dashboard's time scope — a debt does not expire at month end.
 *
 * ⚠️ spec 056 — this body takes the PEOPLE axis by FILTERING ROWS, and must never be
 * "made consistent" with its five siblings by switching to `useScopedTransactions`.
 * A debt exists because one person PAID for something others CO-OWN, and
 * `projectForPerson` rewrites every row to `owner_ids: [personId]` with the amount
 * replaced by that person's share — deleting the co-owners the debt is derived from.
 * Fed projected rows, `outstandingBalances` would see a ledger of single-owner
 * expenses, net every pair to zero, and calmly render "All settled up." for a
 * household that owes money. So the ledger stays WHOLE and only the output narrows;
 * `test/widgets/household-balances.test.tsx` has a guard case for exactly this.
 *
 * Never red: a debt is a fact to settle, not an alarm (Constitution I).
 */
export function HouseholdBalancesBody() {
  const { transactions, householdMembers, resolveUser, formatMoney, t } = useApp()
  const scope = useMoneyScope()

  // The roster comes from the LEDGER, not the active roster, so a removed member's
  // outstanding balance stays visible and settle-able (FR-015).
  const rows = useMemo(() => {
    const all = outstandingBalances(peopleInLedger(transactions), transactions)
    if (scope.kind === 'household') return all
    // Amounts are untouched — a pair reads the same to its members and to a third
    // party (C-6); person scope only decides which pairs are worth showing.
    return all.filter((r) => r.fromId === scope.personId || r.toId === scope.personId)
  }, [transactions, scope])

  if (householdMembers.length < 2) {
    return (
      <div className="flex h-full flex-col">
        <p className="flex flex-1 items-center text-[13px] text-text-3">
          {t('Add someone to your household to track who owes whom.')}
        </p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <p className="flex flex-1 items-center text-[13px] text-text-3">{t('All settled up.')}</p>
      </div>
    )
  }

  return (
    <ul className="flex h-full flex-col gap-2.5">
      {rows.map((row) => {
        const creditor = resolveUser(row.fromId)
        const debtor = resolveUser(row.toId)
        return (
          <li key={`${row.fromId}-${row.toId}`} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] text-text-2">
              {t('{0} owes {1}', debtor.name, creditor.name)}
            </span>
            <span className="shrink-0 text-[15px] tabular-nums text-text">
              {formatMoney(row.amountCents)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
