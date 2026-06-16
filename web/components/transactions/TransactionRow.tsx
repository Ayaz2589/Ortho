'use client'

import { useState } from 'react'
import { MoreHorizontal, Copy, Trash2 } from 'lucide-react'
import { useApp } from '@/lib/store'
import { categoryMeta } from '@/lib/categories'
import { Avatar, StackedAvatars } from '@/components/ui'
import type { Transaction } from '@/lib/types'

/**
 * One transaction row. Category tile on the left with an owner avatar
 * overlapping the bottom-right corner; merchant + meta in the middle;
 * amount on the right. A trailing context menu (revealed on hover) offers
 * Copy + Delete. Clicking the row body opens the detail sheet.
 */
export function TransactionRow({
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
  const { formatMoney, resolveUser } = useApp()
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

  return (
    <div
      className="group ortho-interactive relative flex items-center gap-3 px-4 py-3"
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
        className="flex flex-1 items-center gap-3 text-left"
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

        {/* Merchant + meta */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-normal text-text">{tx.merchant}</div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-text-3">
            <span className="truncate">{ownerLabel}</span>
            <span className="opacity-50">·</span>
            <span className="truncate">{tx.source}</span>
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

      {/* Context menu trigger */}
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Transaction actions"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-3 opacity-0 transition-opacity hover:bg-[var(--hairline)] focus:opacity-100 group-hover:opacity-100"
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
                Copy
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-lg px-2 py-1.5 text-[13px] text-text-2 hover:bg-[var(--hairline)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu()
                      onDelete()
                    }}
                    className="flex-1 rounded-lg px-2 py-1.5 text-[13px] text-destructive hover:bg-[var(--hairline)]"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-destructive hover:bg-[var(--hairline)]"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
