'use client'

import { useState } from 'react'
import { useApp } from '@/lib/store'
import { Card } from '@/components/ui'
import { allPairBalances, simplifyDebts } from '@/lib/balances'
import type { TransferPrefill } from '@/components/web/TxForm'
import type { Transaction } from '@/lib/types'

/** Outstanding balances for all household pairs, shown on the dashboard.
 *  Hidden in solo mode and when all balances are zero.
 *  Includes settle-up shortcuts, settlement history, and (for 3+ members)
 *  a debt-simplification toggle. */
export function HouseholdBalancesWidget({
  onSettle,
  settleThresholdCents = 10000,
}: {
  onSettle: (p: TransferPrefill) => void
  /** Balance amount in cents above which a nudge is shown. Default $100. */
  settleThresholdCents?: number
}) {
  const { people, householdMembers, transactions, currentPersonId, formatMoney, resolveUser, t } = useApp()

  const [showSimplified, setShowSimplified] = useState(false)
  const [historyFor, setHistoryFor] = useState<{ a: string; b: string } | null>(null)

  if (!currentPersonId || householdMembers.length <= 1) return null

  // Use the store's people array (Person[]) for allPairBalances; fall back to
  // householdMembers (User[]) shape if people is not exposed (store compatibility).
  const activePeople = (people ?? householdMembers).map((p: { id: string; name: string }) => ({
    id: p.id,
    household_id: '',
    name: p.name,
    initial: ('initial' in p ? (p as { initial: string }).initial : p.name[0]) ?? '·',
    color_key: 'sage',
    linked_user_id: null,
    sort_order: 0,
    removed_at: null,
    created_at: '',
  }))

  const pairs = allPairBalances(activePeople, transactions)
  if (pairs.length === 0) return null

  // History panel: filter transfers involving both members of the selected pair.
  if (historyFor) {
    const { a, b } = historyFor
    const settlements = (transactions as Transaction[])
      .filter(
        (tx) =>
          tx.kind === 'transfer' &&
          tx.paid_by != null &&
          [a, b].includes(tx.paid_by) &&
          tx.owner_ids.length === 1 &&
          [a, b].includes(tx.owner_ids[0])
      )
      .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())

    const aName = resolveUser(a).name
    const bName = resolveUser(b).name

    return (
      <Card className="mb-4 p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setHistoryFor(null)}
            className="text-[13px] text-accent"
          >
            ← {t('Back')}
          </button>
          <span className="text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
            {t('{0} & {1}', aName, bName)}
          </span>
        </div>
        {settlements.length === 0 ? (
          <p className="py-3 text-[13px] text-text-3">{t('No settlements yet')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {settlements.map((tx) => {
              const senderName = resolveUser(tx.paid_by!).name
              const recipientName = resolveUser(tx.owner_ids[0]).name
              return (
                <div key={tx.id} className="flex items-center justify-between gap-2">
                  <span className="text-[14px] text-text-2">
                    {senderName} → {recipientName}
                  </span>
                  <span className="tabular-nums text-[14px] text-text">
                    {formatMoney(tx.amount_cents)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    )
  }

  // Determine display rows: simplified or full pairwise matrix.
  type DisplayRow =
    | { kind: 'pair'; a: string; b: string; netCents: number }
    | { kind: 'transfer'; from: string; to: string; amountCents: number }

  let rows: DisplayRow[]
  if (showSimplified && householdMembers.length >= 3) {
    rows = simplifyDebts(pairs, activePeople).map((r) => ({
      kind: 'transfer' as const,
      ...r,
    }))
  } else {
    rows = pairs.map((p) => ({ kind: 'pair' as const, ...p }))
  }

  // Net position for the current viewer.
  let netCents = 0
  for (const pair of pairs) {
    if (pair.a === currentPersonId) netCents += pair.netCents
    else if (pair.b === currentPersonId) netCents -= pair.netCents
  }

  return (
    <Card className="mb-4 p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">
          {t('Balances')}
        </span>
        {householdMembers.length >= 3 && (
          <button
            type="button"
            onClick={() => setShowSimplified((v) => !v)}
            className="rounded-full px-2.5 py-1 text-[12px] text-text-2"
            style={{ background: 'var(--chip-bg)' }}
          >
            {t('Simplified')}
          </button>
        )}
      </div>

      {/* Net viewer position */}
      {netCents !== 0 && (
        <div className="mb-3 text-[13px] text-text-2">
          {netCents > 0
            ? t('You are owed {0} net', formatMoney(netCents))
            : t('You owe {0} net', formatMoney(Math.abs(netCents)))}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {rows.map((row, idx) => {
          if (row.kind === 'transfer') {
            // Simplified view: directed transfers
            const fromName = resolveUser(row.from).name
            const toName = resolveUser(row.to).name
            return (
              <div key={idx} className="flex items-center justify-between gap-3">
                <span className="text-[15px] text-text">
                  {fromName} → {toName}{' '}
                  <span className="tabular-nums">{formatMoney(row.amountCents)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onSettle({ from: row.from, to: row.to, amountCents: row.amountCents })}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-normal text-accent ortho-interactive"
                  style={{ background: 'var(--chip-bg)' }}
                >
                  {t('Settle up')}
                </button>
              </div>
            )
          }

          // Full pairwise view: viewer-relative language
          const { a, b, netCents: pairNet } = row
          // From viewer's perspective: positive means someone owes viewer.
          let viewerNet: number
          let otherId: string
          if (a === currentPersonId) {
            viewerNet = pairNet
            otherId = b
          } else if (b === currentPersonId) {
            viewerNet = -pairNet
            otherId = a
          } else {
            // Neither side is the viewer: show neutral "A owes B"
            const aName = resolveUser(a).name
            const bName = resolveUser(b).name
            const theyOwe = pairNet > 0
            const amt = Math.abs(pairNet)
            const aboveThreshold = amt >= settleThresholdCents
            return (
              <div key={`${a}-${b}`} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] text-text">
                    {theyOwe ? t('{0} owes {1}', bName, aName) : t('{0} owes {1}', aName, bName)}{' '}
                    <span className="tabular-nums">{formatMoney(amt)}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryFor({ a, b })}
                      className="text-[13px] text-text-2"
                      aria-label={t('History')}
                    >
                      {t('History')} →
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSettle(
                          theyOwe
                            ? { from: b, to: a, amountCents: amt }
                            : { from: a, to: b, amountCents: amt }
                        )
                      }
                      className="rounded-full px-3 py-1.5 text-[13px] font-normal text-accent ortho-interactive"
                      style={{ background: 'var(--chip-bg)' }}
                    >
                      {t('Settle up')}
                    </button>
                  </div>
                </div>
                {aboveThreshold && (
                  <p className="text-[12px] text-text-2">
                    {theyOwe
                      ? t('{0} owes {1} {2} — settle up?', bName, aName, formatMoney(amt))
                      : t('{0} owes {1} {2} — settle up?', aName, bName, formatMoney(amt))}
                  </p>
                )}
              </div>
            )
          }

          const otherName = resolveUser(otherId).name
          const theyOwe = viewerNet > 0
          const amt = Math.abs(viewerNet)
          const aboveThreshold = amt >= settleThresholdCents

          return (
            <div key={`${a}-${b}`} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] text-text">
                  {theyOwe ? (
                    <>
                      {t('{0} owes you', otherName)}{' '}
                      <span className="tabular-nums">{formatMoney(amt)}</span>
                    </>
                  ) : (
                    <>
                      {t('You owe {0}', otherName)}{' '}
                      <span className="tabular-nums">{formatMoney(amt)}</span>
                    </>
                  )}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHistoryFor({ a, b })}
                    className="text-[13px] text-text-2"
                    aria-label={t('History')}
                  >
                    {t('History')} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSettle(
                        theyOwe
                          ? { from: otherId, to: currentPersonId, amountCents: amt }
                          : { from: currentPersonId, to: otherId, amountCents: amt }
                      )
                    }
                    className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-normal text-accent ortho-interactive"
                    style={{ background: 'var(--chip-bg)' }}
                    aria-label={t('Settle up')}
                  >
                    {t('Settle up')}
                  </button>
                </div>
              </div>
              {aboveThreshold && (
                <p className="text-[12px] text-text-2">
                  {theyOwe
                    ? t("You're owed {0} from {1} — settle up?", formatMoney(amt), otherName)
                    : t('You owe {0} {1} — settle up?', otherName, formatMoney(amt))}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
