'use client'

import { useApp } from '@/lib/store'
import { FormGroup, FieldRow, Avatar } from '@/components/ui'
import { categoryMeta } from '@/lib/categories'
import { effectiveShares, mediumDate } from '@/lib/format'
import { sharePercent } from '@/lib/splits'
import type { Transaction } from '@/lib/types'

/** Read-only presentational detail for a transaction. Shared by the mobile
 *  modal and the desktop master–detail pane. */
export function TransactionDetailBody({ tx }: { tx: Transaction }) {
  const { formatMoney, resolveUser, locale } = useApp()
  const isIncome = tx.kind === 'income'
  const meta = categoryMeta(tx.category)
  const CatIcon = meta.icon
  const shares = effectiveShares(tx)
  const multi = tx.owner_ids.length > 1

  return (
    <div className="flex flex-col gap-5">
      {/* Amount hero */}
      <div className="flex items-center justify-center py-2">
        <span
          className={
            'text-[40px] font-light tabular-nums ' + (isIncome ? 'text-positive' : 'text-text')
          }
        >
          {formatMoney(tx.amount_cents, { leadingPlus: isIncome })}
        </span>
      </div>

      {/* Merchant + category */}
      <FormGroup>
        <FieldRow label={isIncome ? 'Source' : 'Merchant'}>
          <span className="text-[15px] font-normal text-text">{tx.merchant}</span>
        </FieldRow>
        {!isIncome && (
          <FieldRow label="Category">
            <span className="flex items-center gap-1.5 text-[15px] font-normal text-text">
              <CatIcon size={15} />
              {meta.label}
            </span>
          </FieldRow>
        )}
      </FormGroup>

      {/* Owners */}
      <FormGroup>
        {tx.owner_ids.map((id) => {
          const u = resolveUser(id)
          return (
            <div key={id} className="flex min-h-[52px] items-center gap-3 px-4">
              <Avatar user={u} size={28} />
              <span className="flex-1 text-[15px] font-normal text-text">{u.name}</span>
              {multi && (
                <span className="flex items-baseline gap-1.5 text-[15px] font-normal tabular-nums text-text">
                  {formatMoney(shares[id] ?? 0)}
                  <span className="text-[13px] text-text-3">
                    {sharePercent(shares[id] ?? 0, tx.amount_cents)}%
                  </span>
                </span>
              )}
            </div>
          )
        })}
      </FormGroup>

      {/* Meta */}
      <FormGroup>
        <FieldRow label={isIncome ? 'Deposit to' : 'Paid with'}>
          <span className="text-[15px] font-normal text-text">{tx.source}</span>
        </FieldRow>
        <FieldRow label="Date">
          <span className="text-[15px] font-normal text-text">
            {mediumDate(new Date(tx.date), locale)}
          </span>
        </FieldRow>
      </FormGroup>
    </div>
  )
}
