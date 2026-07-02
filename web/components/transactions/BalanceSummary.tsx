'use client'

import { useApp } from '@/lib/store'
import { Card } from '@/components/ui'
import { balanceBetween } from '@/lib/balances'
import type { TransferPrefill } from '@/components/web/TxForm'

/**
 * "Who owes whom" between the viewer and each other household member, with a
 * Settle-up shortcut. Hidden when everyone is settled (net 0). Owing is shown in
 * neutral text — never red (Constitution: loss/cost is never red).
 */
export function BalanceSummary({ onSettle }: { onSettle: (p: TransferPrefill) => void }) {
  const { currentPersonId, transactions, formatMoney, resolveUser, t } = useApp()
  if (!currentPersonId) return null

  // Every other person who appears in the ledger — including REMOVED members — so
  // an outstanding balance with someone who has left is still shown and settle-able.
  const counterparties = new Set<string>()
  for (const t of transactions) {
    if (t.paid_by && t.paid_by !== currentPersonId) counterparties.add(t.paid_by)
    for (const id of t.owner_ids) if (id !== currentPersonId) counterparties.add(id)
  }

  const rows = [...counterparties]
    .map((id) => ({ id, name: resolveUser(id).name, net: balanceBetween(currentPersonId, id, transactions) }))
    .filter((r) => r.net !== 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  if (rows.length === 0) return null // all settled → nothing to show

  return (
    <Card className="mb-4 p-4">
      <div className="mb-2.5 text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">{t('Balances')}</div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const theyOwe = r.net > 0
          const amt = Math.abs(r.net)
          return (
            <div key={r.id} className="flex items-center justify-between gap-3">
              <span className="text-[15px] text-text">
                {r.net === 0 ? (
                  t('Settled with {0}', r.name)
                ) : theyOwe ? (
                  <>
                    {t('{0} owes you', r.name)} <span className="tabular-nums">{formatMoney(amt)}</span>
                  </>
                ) : (
                  <>
                    {t('You owe {0}', r.name)} <span className="tabular-nums">{formatMoney(amt)}</span>
                  </>
                )}
              </span>
              {r.net !== 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onSettle(
                      theyOwe
                        ? { from: r.id, to: currentPersonId, amountCents: amt }
                        : { from: currentPersonId, to: r.id, amountCents: amt }
                    )
                  }
                  className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-normal text-accent ortho-interactive"
                  style={{ background: 'var(--chip-bg)' }}
                >
                  {t('Settle up')}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
