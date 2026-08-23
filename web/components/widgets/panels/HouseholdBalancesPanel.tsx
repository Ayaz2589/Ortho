'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { isTransfer, transferParties } from '@/lib/transaction'
import {
  allPairBalances,
  outstandingBalances,
  peopleInLedger,
  simplifyDebts,
  type PairBalance,
} from '@/lib/finance/balances'
import { usePanelDetail } from '@/components/widgets/WidgetPanel'
import { PanelEmpty, PanelSectionLabel, PanelRow } from '@/components/widgets/panels/kit'
import type { Transaction } from '@/lib/types'

/**
 * Household balances detail panel (spec 057, US7 — who owes whom, why, and
 * the shortest way to end it). Answers three things the card cannot: the
 * fewest transfers that clear every balance at once (`simplifyDebts`, which
 * has no UI consumer anywhere else), every person's overall net position —
 * not only the pairs they are in — and, per pair, the transactions that
 * created the debt.
 *
 * Ignores BOTH scope axes (D5, FR-014): a debt is a standing position, not
 * windowed to a month, and the whole-household picture is the point (US7
 * acceptance scenario 3 — "every person's ... not only the pairs they are
 * in"). No caption is declared.
 *
 * ⚠️ contract §5 / FR-015 — this panel reads the WHOLE household ledger and
 * narrows only its OUTPUT, exactly like `HouseholdBalancesBody`. It must
 * NEVER call `useScopedTransactions`: `projectForPerson` rewrites every row
 * to a single owner and deletes the payer-to-co-owner relationship a debt is
 * derived from, which would make `outstandingBalances` calmly report "All
 * settled up." for a household that owes money.
 * `test/widgets/panels/household-balances-panel.test.tsx` has a guard case.
 *
 * FR-019: no settle-up action here — spec 043 removed that plumbing and
 * restoring it is separate scope.
 */

interface Contribution {
  key: string
  label: string
  amountCents: number
  captionKey: 'Paid by {0}' | 'Received by {0}'
  actorName: string
}

function pairContributions(
  creditorId: string,
  debtorId: string,
  transactions: readonly Transaction[],
  t: (key: string, ...args: Array<string | number>) => string,
  resolveUser: (id: string) => { name: string }
): Contribution[] {
  const out: Contribution[] = []
  for (const tx of transactions) {
    if (tx.kind === 'expense') {
      const payer = tx.paid_by
      if (!payer) continue
      if (payer === creditorId && tx.shares[debtorId]) {
        out.push({
          key: tx.id,
          label: tx.merchant,
          amountCents: tx.shares[debtorId],
          captionKey: 'Paid by {0}',
          actorName: resolveUser(creditorId).name,
        })
      } else if (payer === debtorId && tx.shares[creditorId]) {
        out.push({
          key: tx.id,
          label: tx.merchant,
          amountCents: tx.shares[creditorId],
          captionKey: 'Paid by {0}',
          actorName: resolveUser(debtorId).name,
        })
      }
    } else if (tx.kind === 'income') {
      // Mirror of expense (lib/finance/balances.ts): receiving co-owned
      // money creates a debt TO the co-owner, not a claim on them.
      const recipient = tx.paid_by
      if (!recipient) continue
      if (recipient === creditorId && tx.shares[debtorId]) {
        out.push({
          key: tx.id,
          label: tx.merchant,
          amountCents: tx.shares[debtorId],
          captionKey: 'Received by {0}',
          actorName: resolveUser(creditorId).name,
        })
      } else if (recipient === debtorId && tx.shares[creditorId]) {
        out.push({
          key: tx.id,
          label: tx.merchant,
          amountCents: tx.shares[creditorId],
          captionKey: 'Received by {0}',
          actorName: resolveUser(debtorId).name,
        })
      }
    } else if (isTransfer(tx)) {
      const { from, to } = transferParties(tx)
      if (!from || !to) continue
      if ((from === creditorId && to === debtorId) || (from === debtorId && to === creditorId)) {
        out.push({
          key: tx.id,
          label: t('Transfer'),
          amountCents: tx.amount_cents,
          captionKey: 'Paid by {0}',
          actorName: resolveUser(from).name,
        })
      }
    }
  }
  return out
}

export function HouseholdBalancesPanel() {
  const { transactions, householdMembers, formatMoney, t, resolveUser } = useApp()
  const { push } = usePanelDetail()

  const pairs = useMemo(() => {
    const ids = peopleInLedger(transactions)
    return outstandingBalances(ids, transactions)
  }, [transactions])

  const settlement = useMemo(() => simplifyDebts(pairs), [pairs])

  const netByPerson = useMemo(() => {
    const ids = peopleInLedger(transactions)
    const matrix = allPairBalances(ids, transactions)
    return ids
      .map((id) => ({
        id,
        name: resolveUser(id).name,
        netCents: [...matrix.get(id)!.values()].reduce((sum, v) => sum + v, 0),
      }))
      .sort((a, b) => b.netCents - a.netCents || a.name.localeCompare(b.name))
  }, [transactions, resolveUser])

  if (householdMembers.length < 2) {
    return <PanelEmpty>{t('Add someone to your household to track who owes whom.')}</PanelEmpty>
  }

  if (pairs.length === 0) {
    return <PanelEmpty>{t('All settled up.')}</PanelEmpty>
  }

  const openPair = (pair: PairBalance) => {
    const creditorName = resolveUser(pair.fromId).name
    const debtorName = resolveUser(pair.toId).name
    const contributions = pairContributions(pair.fromId, pair.toId, transactions, t, resolveUser)
    push(
      t('{0} owes {1}', debtorName, creditorName),
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[24px] font-light leading-none tabular-nums text-text">
            {formatMoney(pair.amountCents)}
          </span>
          <span className="text-xs text-text-2">{t('{0} owes {1}', debtorName, creditorName)}</span>
        </div>
        <div className="flex flex-col gap-2.5">
          <PanelSectionLabel>{t('Contributing transactions')}</PanelSectionLabel>
          {contributions.map((c) => (
            <div key={c.key} className="flex flex-col gap-0.5">
              <PanelRow label={c.label} value={formatMoney(c.amountCents)} />
              <span className="text-xs text-text-3">{t(c.captionKey, c.actorName)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      {settlement.length > 0 ? (
        <div className="flex flex-col gap-2">
          <PanelSectionLabel>{t('Suggested settle-up')}</PanelSectionLabel>
          {settlement.map((row) => (
            <PanelRow
              key={`${row.fromId}-${row.toId}`}
              label={t('{0} pays {1}', resolveUser(row.toId).name, resolveUser(row.fromId).name)}
              value={formatMoney(row.amountCents)}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <PanelSectionLabel>{t('Every balance')}</PanelSectionLabel>
        <ul className="flex flex-col gap-2">
          {pairs.map((pair) => (
            <li key={`${pair.fromId}-${pair.toId}`}>
              <button
                type="button"
                onClick={() => openPair(pair)}
                className="w-full rounded-xl p-3 text-left"
                style={{ background: 'var(--surface)' }}
              >
                <PanelRow
                  label={t('{0} owes {1}', resolveUser(pair.toId).name, resolveUser(pair.fromId).name)}
                  value={formatMoney(pair.amountCents)}
                />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <PanelSectionLabel>{t('Net position')}</PanelSectionLabel>
        {netByPerson.map((person) => (
          <PanelRow
            key={person.id}
            label={person.name}
            value={
              person.netCents > 0
                ? t('owed {0}', formatMoney(person.netCents))
                : person.netCents < 0
                  ? t('owes {0}', formatMoney(-person.netCents))
                  : t('Settled')
            }
          />
        ))}
      </div>
    </div>
  )
}
