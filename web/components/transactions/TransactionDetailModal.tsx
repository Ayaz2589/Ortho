'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { Modal } from '@/components/ui'
import { TransactionDetailBody } from './TransactionDetailBody'
import { TxModalWeb } from '@/components/web/TxModalWeb'

/**
 * Read-only detail view by transaction id (re-read from the store so it
 * reflects edits; auto-closes if the transaction is deleted). Used on mobile;
 * the desktop (≥1024px) view uses the ledger drawer in TransactionsDesktop.
 */
export function TransactionDetailModal({
  txId,
  open,
  onClose,
}: {
  txId: string | null
  open: boolean
  onClose: () => void
}) {
  const { transactions, deleteTransaction, currentHousehold, t } = useApp()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tx = txId ? transactions.find((t) => t.id === txId) ?? null : null

  // Auto-close when the transaction disappears (deleted) while open.
  useEffect(() => {
    if (open && txId && !tx && !editing) onClose()
  }, [open, txId, tx, editing, onClose])

  // Reset transient UI when reopening for a different tx.
  useEffect(() => {
    if (open) setConfirmDelete(false)
  }, [open, txId])

  if (!tx) return null

  const isIncome = tx.kind === 'income'
  // Kind + household name, like iOS ("Expense · Home"); kind alone when the
  // household can't be resolved.
  const kindLabel = tx.kind === 'transfer' ? t('Reimbursement') : isIncome ? t('Income') : t('Expense')
  const title =
    currentHousehold && tx.household_id === currentHousehold.id
      ? `${kindLabel} · ${currentHousehold.name}`
      : kindLabel

  return (
    <>
      <Modal
        open={open && !editing}
        onClose={onClose}
        title={title}
        left={
          <button type="button" onClick={onClose} className="text-accent">
            {t('Done')}
          </button>
        }
        right={
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-normal text-accent"
          >
            {t('Edit')}
          </button>
        }
      >
        <div className="flex flex-col gap-5">
          <TransactionDetailBody tx={tx} />

          {confirmDelete ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
              <p className="text-center text-[14px] text-text-2">
                {t('Delete this transaction?')} {t("This can't be undone.")}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-full py-2.5 text-[15px] font-normal text-text"
                  style={{ background: 'rgba(0,0,0,0.05)' }}
                >
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteTransaction(tx.id)
                    onClose()
                  }}
                  className="flex-1 rounded-full bg-destructive py-2.5 text-[15px] font-normal text-white"
                >
                  {t('Delete')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-2xl bg-surface py-3.5 text-center text-[15px] font-normal text-destructive"
            >
              {t('Delete transaction')}
            </button>
          )}
        </div>
      </Modal>

      {editing && <TxModalWeb open editing={tx} onClose={() => setEditing(false)} />}
    </>
  )
}
