'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { useHideTabBar } from '@/lib/tabBarVisibility'
import type { Transaction } from '@/lib/types'
import { IconButton } from '@/components/ui'
import { TransactionDetailBody } from './TransactionDetailBody'

/**
 * Full-page mobile transaction detail (spec 025) — the read-only view reached by
 * tapping a list row. A minimal nav bar (back · kind·household title · Edit) over
 * the shared <TransactionDetailBody> (whose amount is the hero, with the merchant
 * name in its Merchant row) + an inline delete/confirm footer. Extracted from
 * transactions/page.tsx so the list component stays focused on the list; owns only
 * its confirm-delete toggle, while the list page owns navigation (onBack/onEdit)
 * and the actual delete (onDelete).
 *
 * The nav title is the kind·household label (mirroring the desktop detail pane),
 * NOT the merchant name — the merchant belongs to the body, so it isn't crammed
 * into the navigation as a wrapping hero. Side inset is a single ~16px: the nav
 * and the cards sit directly on the app shell's content padding.
 */
export function TransactionDetailView({
  tx,
  onBack,
  onEdit,
  onDelete,
}: {
  tx: Transaction
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { currentHousehold, t } = useApp()
  const [confirmDelete, setConfirmDelete] = useState(false)
  useHideTabBar()

  const kindLabel =
    tx.kind === 'transfer' ? t('Reimbursement') : tx.kind === 'income' ? t('Income') : t('Expense')
  const navTitle =
    currentHousehold && tx.household_id === currentHousehold.id
      ? `${kindLabel} · ${currentHousehold.name}`
      : kindLabel

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <header className="relative mb-3 flex items-center pt-2">
        <IconButton onClick={onBack} ariaLabel={t('Back')}>
          <ChevronLeft size={18} />
        </IconButton>
        <h1 className="pointer-events-none absolute inset-x-14 truncate text-center text-[15px] font-normal tracking-[-0.2px] text-text">
          {navTitle}
        </h1>
        <button type="button" onClick={onEdit} className="ml-auto pl-3 text-[15px] font-normal text-accent">
          {t('Edit')}
        </button>
      </header>

      <div className="flex flex-col gap-5">
        <TransactionDetailBody tx={tx} />
        {confirmDelete ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <p className="text-center text-[14px] text-text-2">
              {t('Delete this transaction?')} {t("This can't be undone.")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-full py-2.5 text-[15px] font-normal text-text"
                style={{ background: 'var(--chip-bg)' }}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex-1 rounded-full bg-destructive py-2.5 text-[15px] font-normal text-white"
              >
                {t('Delete')}
              </button>
            </div>
          </div>
        ) : (
          // Calm destructive footer: a plain centered red text action rather than a
          // filled card, so the resting state doesn't shout for a tap (the card
          // shape is reserved for the confirm step above).
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-1 py-2.5 text-center text-[15px] font-normal text-destructive"
          >
            {t('Delete transaction')}
          </button>
        )}
      </div>
    </div>
  )
}
