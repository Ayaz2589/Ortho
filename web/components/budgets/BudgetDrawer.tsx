'use client'

import { useEffect, useState } from 'react'
import { MinusCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import { FormGroup, FieldRow } from '@/components/ui'
import { MoneyInput, parseMoney } from '@/components/inputs'
import { fractionDigits } from '@/lib/finance/currency'
import { CATEGORIES } from '@/lib/categories'
import { Drawer, DrawerHeader } from '@/components/web/Drawer'
import type { Budget, TransactionCategory } from '@/lib/types'

function centsToDisplay(cents: number, currency: ReturnType<typeof useApp>['currency'], rate: number): string {
  const digits = fractionDigits(currency)
  // USD-cents storage invariant: always divide by 100, then apply the FX rate.
  return ((cents / 100) * rate).toFixed(digits)
}

/**
 * Budget detail/edit in the shared slide-out drawer (replaces the old centered
 * modal). `category` drives open state; null = closed.
 */
export function BudgetDrawer({
  category,
  onClose,
}: {
  category: TransactionCategory | null
  onClose: () => void
}) {
  const { currency, rate, currentHousehold, budgets, addOrUpdateBudget, deleteBudget, t } = useApp()
  const existing = category ? budgets.find((b) => b.category === category) ?? null : null
  const [amount, setAmount] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!category) return
    setConfirmRemove(false)
    setAmount(existing ? centsToDisplay(existing.monthly_limit_cents, currency, rate(currency)) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, currency])

  const parsed = parseMoney(amount, currency, rate(currency))
  const canSave = parsed != null && parsed >= 0

  const handleSave = () => {
    if (parsed == null || parsed < 0 || !currentHousehold || !category) return
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

  const meta = category ? CATEGORIES[category] : null
  const Icon = meta?.icon

  return (
    <Drawer open={category !== null} onClose={onClose} label={meta ? t('{0} budget', t(meta.label)) : t('Budget')}>
      <DrawerHeader
        title={meta ? t('{0} budget', t(meta.label)) : t('Budget')}
        onClose={onClose}
        right={
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="text-[15px] text-accent disabled:opacity-40"
          >
            {t('Save')}
          </button>
        }
      />

      <div style={{ overflow: 'auto', padding: '20px 20px 24px' }}>
        {meta && Icon && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingBottom: 18 }}>
            <span
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-white"
              style={{ background: meta.tint }}
            >
              <Icon size={24} />
            </span>
            <div className="text-[17px] text-text">{t(meta.label)}</div>
          </div>
        )}

        <FormGroup>
          <FieldRow label={t('Monthly limit')}>
            <MoneyInput value={amount} onChange={setAmount} placeholder="0.00" autoFocus />
          </FieldRow>
        </FormGroup>

        <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
          {t(
            'Spending in {0} is tracked from the 1st of each calendar month. Insights compare actual spend against this limit.',
            meta ? t(meta.label) : ''
          )}
        </p>

        {existing &&
          (confirmRemove ? (
            <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-surface p-4" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <p className="text-[14px] text-text-2">{t('Remove this budget? Insights for this category will stop.')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="flex-1 rounded-full py-2.5 text-[15px] text-text-2"
                  style={{ background: 'var(--chip-bg)' }}
                >
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="flex-1 rounded-full py-2.5 text-[15px] text-white"
                  style={{ background: 'var(--destructive)' }}
                >
                  {t('Remove')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface py-3.5 text-[17px] text-destructive"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
            >
              <MinusCircle size={16} />
              {t('Remove budget')}
            </button>
          ))}
      </div>
    </Drawer>
  )
}
