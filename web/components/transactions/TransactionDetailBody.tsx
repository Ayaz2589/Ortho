'use client'

import { useApp } from '@/lib/store'
import { transferParties } from '@/lib/transaction'
import { FormGroup, FieldRow, Avatar } from '@/components/ui'
import { categoryMeta } from '@/lib/categories'
import { effectiveShares, mediumDate } from '@/lib/format'
import { sharePercent } from '@/lib/splits'
import type { Transaction } from '@/lib/types'

/** Read-only presentational detail for a transaction. Shared by the mobile
 *  modal and the desktop master–detail pane. */
export function TransactionDetailBody({ tx }: { tx: Transaction }) {
  const { formatMoney, resolveUser, locale, t, tags: tagRoster = [] } = useApp()
  const isIncome = tx.kind === 'income'
  const isTransfer = tx.kind === 'transfer'
  const tagName = (id: string) => tagRoster.find((tg) => tg.id === id)?.name ?? id
  // Tags + notes (spec 027) — additive, shown only when present.
  const tagsNotes = (
    <>
      {tx.tags && tx.tags.length > 0 && (
        <FormGroup>
          <FieldRow label={t('Tags')}>
            <span className="flex flex-wrap justify-end gap-1.5">
              {tx.tags.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] text-text"
                  style={{ background: 'var(--surface)', boxShadow: '0 0 0 0.5px var(--hairline)' }}
                >
                  {tagName(id)}
                </span>
              ))}
            </span>
          </FieldRow>
        </FormGroup>
      )}
      {tx.notes && (
        <FormGroup>
          <div className="flex flex-col gap-1 px-4 py-3">
            <span className="text-[13px] text-text-2">{t('Notes')}</span>
            <span className="whitespace-pre-wrap text-[15px] font-normal text-text">{tx.notes}</span>
          </div>
        </FormGroup>
      )}
    </>
  )

  // A reimbursement: directional From (paid_by/sender) → To (recipient). Neutral
  // amount (not spend/income), no category/split/source.
  if (isTransfer) {
    const { from, to } = transferParties(tx)
    const fromU = from ? resolveUser(from) : null
    const toU = to ? resolveUser(to) : null
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-center py-2">
          <span className="text-[40px] font-light tabular-nums text-text">{formatMoney(tx.amount_cents)}</span>
        </div>
        <FormGroup>
          <FieldRow label={t('From')}>
            <span className="flex items-center gap-2 text-[15px] font-normal text-text">
              {fromU && <Avatar user={fromU} size={22} />}
              {fromU?.name ?? '—'}
            </span>
          </FieldRow>
          <FieldRow label={t('To')}>
            <span className="flex items-center gap-2 text-[15px] font-normal text-text">
              {toU && <Avatar user={toU} size={22} />}
              {toU?.name ?? '—'}
            </span>
          </FieldRow>
        </FormGroup>
        <FormGroup>
          <FieldRow label={t('Type')}>
            <span className="text-[15px] font-normal text-text">{t('Reimbursement')}</span>
          </FieldRow>
          <FieldRow label={t('Date')}>
            <span className="text-[15px] font-normal text-text">{mediumDate(new Date(tx.date), locale)}</span>
          </FieldRow>
        </FormGroup>
        {tagsNotes}
      </div>
    )
  }

  const meta = categoryMeta(tx.category)
  const CatIcon = meta.icon
  const shares = effectiveShares(tx)
  const multi = tx.owner_ids.length > 1
  const payer = tx.paid_by ? resolveUser(tx.paid_by) : null
  // "Paid by" is redundant on a solo expense — the single owner row already names
  // that person as the one who paid. Show it only when it adds information: a
  // split (multiple owners) or a payer who isn't the sole owner.
  const showPaidBy = !!payer && !(tx.owner_ids.length === 1 && tx.paid_by === tx.owner_ids[0])

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
        <FieldRow label={isIncome ? t('Source') : t('Merchant')}>
          <span className="text-[15px] font-normal text-text">{tx.merchant}</span>
        </FieldRow>
        {!isIncome && (
          <FieldRow label={t('Category')}>
            <span className="flex items-center gap-1.5 text-[15px] font-normal text-text">
              <CatIcon size={15} />
              {t(meta.label)}
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
        {!isIncome && showPaidBy && payer && (
          <FieldRow label={t('Paid by')}>
            <span className="flex items-center gap-2 text-[15px] font-normal text-text">
              <Avatar user={payer} size={22} />
              {payer.name}
            </span>
          </FieldRow>
        )}
        <FieldRow label={isIncome ? t('Deposit to') : t('Paid with')}>
          <span className="text-[15px] font-normal text-text">{tx.source}</span>
        </FieldRow>
        <FieldRow label={t('Date')}>
          <span className="text-[15px] font-normal text-text">
            {mediumDate(new Date(tx.date), locale)}
          </span>
        </FieldRow>
      </FormGroup>
      {tagsNotes}
    </div>
  )
}
