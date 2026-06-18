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
  const { currentPersonId, householdMembers, transactions, formatMoney } = useApp()
  if (!currentPersonId || householdMembers.length < 2) return null

  const rows = householdMembers
    .filter((m) => m.id !== currentPersonId)
    .map((m) => ({ id: m.id, name: m.name, net: balanceBetween(currentPersonId, m.id, transactions) }))

  if (rows.every((r) => r.net === 0)) return null // all settled → nothing to show

  return (
    <Card className="mb-4 p-4">
      <div className="mb-2.5 text-[13px] font-normal uppercase tracking-[0.6px] text-text-2">Balances</div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const theyOwe = r.net > 0
          const amt = Math.abs(r.net)
          return (
            <div key={r.id} className="flex items-center justify-between gap-3">
              <span className="text-[15px] text-text">
                {r.net === 0 ? (
                  <>Settled with {r.name}</>
                ) : theyOwe ? (
                  <>
                    {r.name} owes you <span className="tabular-nums">{formatMoney(amt)}</span>
                  </>
                ) : (
                  <>
                    You owe {r.name} <span className="tabular-nums">{formatMoney(amt)}</span>
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
                  Settle up
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
