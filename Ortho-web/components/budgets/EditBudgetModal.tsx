'use client'

import { useEffect, useState } from 'react'
import { MinusCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Modal, FormGroup, FieldRow, PrimaryButton } from '@/components/ui'
import { MoneyInput, parseMoney } from '@/components/inputs'
import { fractionDigits } from '@/lib/finance/currency'
import { CATEGORIES } from '@/lib/categories'
import type { Budget, TransactionCategory } from '@/lib/types'

function centsToDisplay(cents: number, currency: ReturnType<typeof useApp>['currency'], rate: number): string {
  const digits = fractionDigits(currency)
  const divisor = digits === 0 ? 1 : 100
  return ((cents / divisor) * rate).toFixed(digits)
}

export function EditBudgetModal({
  open,
  onClose,
  category,
}: {
  open: boolean
  onClose: () => void
  category: TransactionCategory
}) {
  const { currency, rate, currentHousehold, budgets, addOrUpdateBudget, deleteBudget } = useApp()
  const existing = budgets.find((b) => b.category === category) ?? null
  const [amount, setAmount] = useState('')

  useEffect(() => {
    if (!open) return
    setAmount(existing ? centsToDisplay(existing.monthly_limit_cents, currency, rate(currency)) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category, currency])

  const parsed = parseMoney(amount, currency, rate(currency))
  const canSave = parsed != null && parsed >= 0

  const handleSave = () => {
    if (parsed == null || parsed < 0 || !currentHousehold) return
    const budget: Budget = {
      id: existing?.id ?? crypto.randomUUID(),
      household_id: currentHousehold.id,
      category,
      monthly_limit_cents: parsed,
    }
    addOrUpdateBudget(budget)
    onClose()
  }

  const handleRemove = () => {
    if (existing) deleteBudget(existing.id)
    onClose()
  }

  const meta = CATEGORIES[category]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${meta.label} budget`}
      right={
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="font-semibold text-accent disabled:opacity-40"
        >
          Save
        </button>
      }
    >
      <FormGroup>
        <FieldRow label="Monthly limit">
          <MoneyInput value={amount} onChange={setAmount} placeholder="0.00" autoFocus />
        </FieldRow>
      </FormGroup>

      <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
        Spending in {meta.label} is tracked from the 1st of each calendar month. Insights compare
        actual spend against this limit.
      </p>

      <div className="mt-5">
        <PrimaryButton onClick={handleSave} disabled={!canSave}>
          Save budget
        </PrimaryButton>
      </div>

      {existing && (
        <button
          type="button"
          onClick={handleRemove}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface py-3.5 text-[17px] font-medium text-destructive"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
        >
          <MinusCircle size={16} />
          Remove budget
        </button>
      )}
    </Modal>
  )
}
