'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
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
 * Never red: a debt is a fact to settle, not an alarm (Constitution I).
 */
export function HouseholdBalancesBody() {
  const { transactions, householdMembers, resolveUser, formatMoney, t } = useApp()

  // The roster comes from the LEDGER, not the active roster, so a removed member's
  // outstanding balance stays visible and settle-able (FR-015).
  const rows = useMemo(
    () => outstandingBalances(peopleInLedger(transactions), transactions),
    [transactions]
  )

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
