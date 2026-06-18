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
  const isTransfer = tx.kind === 'transfer'

  // A reimbursement: directional From (paid_by/sender) → To (recipient). Neutral
  // amount (not spend/income), no category/split/source.
  if (isTransfer) {
    const fromU = tx.paid_by ? resolveUser(tx.paid_by) : null
    const toU = tx.owner_ids[0] ? resolveUser(tx.owner_ids[0]) : null
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-center py-2">
          <span className="text-[40px] font-light tabular-nums text-text">{formatMoney(tx.amount_cents)}</span>
        </div>
        <FormGroup>
          <FieldRow label="From">
            <span className="flex items-center gap-2 text-[15px] font-normal text-text">
              {fromU && <Avatar user={fromU} size={22} />}
              {fromU?.name ?? '—'}
            </span>
          </FieldRow>
          <FieldRow label="To">
            <span className="flex items-center gap-2 text-[15px] font-normal text-text">
              {toU && <Avatar user={toU} size={22} />}
              {toU?.name ?? '—'}
            </span>
          </FieldRow>
        </FormGroup>
        <FormGroup>
          <FieldRow label="Type">
            <span className="text-[15px] font-normal text-text">Reimbursement</span>
          </FieldRow>
          <FieldRow label="Date">
            <span className="text-[15px] font-normal text-text">{mediumDate(new Date(tx.date), locale)}</span>
          </FieldRow>
        </FormGroup>
      </div>
    )
  }

  const meta = categoryMeta(tx.category)
  const CatIcon = meta.icon
  const shares = effectiveShares(tx)
  const multi = tx.owner_ids.length > 1
  const payer = tx.paid_by ? resolveUser(tx.paid_by) : null

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
        {!isIncome && payer && (
          <FieldRow label="Paid by">
            <span className="flex items-center gap-2 text-[15px] font-normal text-text">
              <Avatar user={payer} size={22} />
              {payer.name}
            </span>
          </FieldRow>
        )}
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
