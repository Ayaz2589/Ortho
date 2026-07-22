'use client'

import { memo, useState } from 'react'
import { MoreHorizontal, Copy, Trash2 } from 'lucide-react'
import { useAppServices } from '@/lib/store'
import { transferParties } from '@/lib/transaction'
import { categoryMeta } from '@/lib/categories'
import { Avatar, StackedAvatars } from '@/components/ui'
import type { Transaction } from '@/lib/types'

/**
 * One transaction row. Category tile on the left with an owner avatar
 * overlapping the bottom-right corner; merchant + meta in the middle;
 * amount on the right. A trailing context menu (revealed on hover) offers
 * Copy + Delete. Clicking the row body opens the detail sheet.
 */
function TransactionRowImpl({
  tx,
  onOpen,
  onCopy,
  onDelete,
  selected = false,
}: {
  tx: Transaction
  onOpen: () => void
  onCopy: () => void
  onDelete: () => void
  selected?: boolean
}) {
  const { formatMoney, resolveUser, t } = useAppServices()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const closeMenu = () => {
    setMenuOpen(false)
    setConfirmDelete(false)
  }
  const meta = categoryMeta(tx.category)
  const Icon = meta.icon
  const ownerUsers = tx.owner_ids.map(resolveUser)
  const ownerLabel = ownerUsers.map((u) => u.name).join(', ')
  const isIncome = tx.kind === 'income'
  const isTransfer = tx.kind === 'transfer'
  const parties = transferParties(tx)
  const transferTitle = isTransfer
    ? `${parties.from ? resolveUser(parties.from).name : '—'} → ${parties.to ? resolveUser(parties.to).name : '—'}`
    : null

  return (
    <div
      className="group ortho-interactive cv-row relative flex items-center gap-3 px-4 py-3"
      aria-current={selected ? 'true' : undefined}
      style={
        selected
          ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }
          : undefined
      }
    >
      <button
        type="button"
        onClick={onOpen}
        // min-w-0 lets this flex child shrink below its content width so the
        // merchant/meta `truncate` engages — otherwise a long name pushes the
        // amount past the row edge and clips it.
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {/* Category tile + owner avatar overlap */}
        <div className="relative shrink-0">
          <div
            className="flex h-[42px] w-[42px] items-center justify-center rounded-xl"
            style={{ background: meta.tint, opacity: 0.92 }}
          >
            <Icon size={18} className="text-white" strokeWidth={2.2} />
          </div>
          <div className="absolute -bottom-1 -right-1">
            {ownerUsers.length <= 1 ? (
              <div className="rounded-full ring-2 ring-surface" style={{ background: 'var(--surface)' }}>
                <Avatar user={ownerUsers[0] ?? resolveUser('')} size={20} />
              </div>
            ) : (
              <StackedAvatars users={ownerUsers} size={18} ring="var(--surface)" />
            )}
          </div>
        </div>

        {/* Merchant + meta (or "From → To · Reimbursement" for a transfer) */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-normal text-text">{transferTitle ?? tx.merchant}</div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-text-3">
            {isTransfer ? (
              <span className="truncate">{t('Reimbursement')}</span>
            ) : (
              <>
                <span className="truncate">{ownerLabel}</span>
                <span className="opacity-50">·</span>
                <span className="truncate">{tx.source}</span>
              </>
            )}
          </div>
        </div>

        {/* Amount */}
        <span
          className={
            'shrink-0 text-[15px] font-normal tabular-nums ' +
            (isIncome ? 'text-positive' : 'text-text')
          }
        >
          {formatMoney(tx.amount_cents, { leadingPlus: isIncome })}
        </span>
      </button>

      {/* Context menu trigger — absolutely positioned so it doesn't reserve a
          slot in the flow (which left dead space to the right of the amount).
          A mouse-only affordance: it fades in on row hover/focus as a surface
          chip floating over the row's right edge; on touch it stays hidden and
          the amount sits flush right. */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <button
          type="button"
          aria-label={t('Transaction actions')}
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-text-3 opacity-0 shadow-[0_0_0_0.5px_var(--hairline),0_1px_2px_rgba(0,0,0,0.06)] transition-opacity hover:bg-[var(--hairline)] focus:opacity-100 group-hover:opacity-100"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={closeMenu}
            />
            <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-hairline bg-surface py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  closeMenu()
                  onCopy()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-text hover:bg-[var(--hairline)]"
              >
                <Copy size={15} />
                {t('Copy')}
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-lg px-2 py-1.5 text-[13px] text-text-2 hover:bg-[var(--hairline)]"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu()
                      onDelete()
                    }}
                    className="flex-1 rounded-lg px-2 py-1.5 text-[13px] text-destructive hover:bg-[var(--hairline)]"
                  >
                    {t('Delete')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-destructive hover:bg-[var(--hairline)]"
                >
                  <Trash2 size={15} />
                  {t('Delete')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Memoized on the data props only (`tx` identity + `selected`). The callbacks
 * (`onOpen`/`onCopy`/`onDelete`) are recreated on every parent render but are
 * pure functions of `tx` (compared here) and stable store setters, so ignoring
 * their identity churn is safe — and lets an unrelated mutation (e.g. adding a
 * different transaction) skip re-rendering this row (US6/P4, spec 023). The row
 * reads only the stable services context (`useAppServices`), so an unrelated
 * data change doesn't re-render it through context either.
 */
export const TransactionRow = memo(
  TransactionRowImpl,
  (a, b) => a.tx === b.tx && a.selected === b.selected
)
