'use client'

import { useEffect, useState } from 'react'
import { MinusCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import { FormGroup, FieldRow } from '@/components/ui'
import { MoneyInput, parseMoney } from '@/components/inputs'
import { fractionDigits } from '@/lib/finance/currency'
import { CATEGORIES } from '@/lib/categories'
import { Drawer, DrawerHeader } from '@/components/web/Drawer'
import type { Budget, BudgetType, TransactionCategory } from '@/lib/types'

function centsToDisplay(cents: number, currency: ReturnType<typeof useApp>['currency'], rate: number): string {
  const digits = fractionDigits(currency)
  // USD-cents storage invariant: always divide by 100, then apply the FX rate.
  return ((cents / 100) * rate).toFixed(digits)
}

// The three bucket types, with a one-line description each (spec 027).
const TYPE_OPTIONS: { value: BudgetType; label: string; blurb: string }[] = [
  { value: 'fixed', label: 'Fixed', blurb: 'Resets every month.' },
  { value: 'flex', label: 'Flex', blurb: 'Unused budget rolls forward.' },
  { value: 'non_monthly', label: 'Non-monthly', blurb: 'A fund for irregular costs.' },
]

/**
 * Budget detail/edit in the shared slide-out drawer. `category` drives open
 * state; null = closed. Spec 027 adds a bucket-type selector and, for Flex, an
 * optional rollover cap. Spec 054 adds `personId`: null edits the HOUSEHOLD
 * budget (the pre-054 behavior), a person id edits that person's own limit for
 * the same category — a separate row, never a re-attribution of the shared one.
 */
export function BudgetDrawer({
  category,
  personId = null,
  personName = null,
  onClose,
}: {
  category: TransactionCategory | null
  /** Whose budget to edit. `null` = the household's. */
  personId?: string | null
  /** Display name for the person, used in the drawer copy. */
  personName?: string | null
  onClose: () => void
}) {
  const { currency, rate, currentHousehold, budgets, addOrUpdateBudget, deleteBudget, t } = useApp()
  // Match on the owner as well as the category: a household and a personal budget can
  // both exist for Dining, and each must edit its own row.
  const existing = category
    ? budgets.find((b) => b.category === category && (b.person_id ?? null) === personId) ?? null
    : null
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<BudgetType>('fixed')
  const [cap, setCap] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  // Snapshot of the prefilled display strings (spec 023 B1 pattern): saving an
  // UNTOUCHED field writes the stored cents verbatim, so a lossy display rate
  // can't drift the limit/cap by a cent on a no-op save (review 2026-08-24).
  const [prefill, setPrefill] = useState<{ amount: string; cap: string } | null>(null)

  useEffect(() => {
    if (!category) return
    setConfirmRemove(false)
    const amountText = existing ? centsToDisplay(existing.monthly_limit_cents, currency, rate(currency)) : ''
    const capText =
      existing?.budget_type === 'flex' && existing.rollover_cap_cents != null
        ? centsToDisplay(existing.rollover_cap_cents, currency, rate(currency))
        : ''
    setAmount(amountText)
    setType(existing?.budget_type ?? 'fixed')
    setCap(capText)
    setPrefill(existing ? { amount: amountText, cap: capText } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, currency, personId])

  const parsed = parseMoney(amount, currency, rate(currency))
  const canSave = parsed != null && parsed >= 0
  // Cap is optional; a blank value means uncapped.
  const parsedCap = cap.trim() === '' ? null : parseMoney(cap, currency, rate(currency))

  const handleSave = () => {
    if (parsed == null || parsed < 0 || !currentHousehold || !category) return
    const limitCents = existing && prefill && amount === prefill.amount ? existing.monthly_limit_cents : parsed
    const capCents =
      existing && prefill && cap === prefill.cap && existing.budget_type === 'flex'
        ? existing.rollover_cap_cents
        : parsedCap != null && parsedCap >= 0
          ? parsedCap
          : null
    const budget: Budget = {
      id: existing?.id ?? crypto.randomUUID(),
      household_id: currentHousehold.id,
      category,
      monthly_limit_cents: limitCents,
      person_id: personId,
      budget_type: type,
      // Cap is flex-only; the other types always store null.
      rollover_cap_cents: type === 'flex' ? capCents : null,
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
            {personName && (
              <div className="text-[13px] text-text-3">{t("{0}'s budget", personName)}</div>
            )}
          </div>
        )}

        <FormGroup>
          <FieldRow label={t('Monthly limit')}>
            <MoneyInput value={amount} onChange={setAmount} placeholder="0.00" autoFocus />
          </FieldRow>
        </FormGroup>

        {/* Bucket type selector (spec 027) */}
        <div className="pt-5" role="radiogroup" aria-label={t('Budget type')}>
          <div className="px-1 pb-2 text-[13px] font-normal text-text-3">{t('Budget type')}</div>
          <div className="flex flex-col gap-2">
            {TYPE_OPTIONS.map((opt) => {
              const selected = type === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-pressed={selected}
                  onClick={() => setType(opt.value)}
                  className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-left"
                  style={{
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    outline: selected ? '1.5px solid var(--accent)' : 'none',
                    outlineOffset: -1.5,
                  }}
                >
                  <span className="flex flex-col">
                    <span className="text-[15px] text-text">{t(opt.label)}</span>
                    <span className="text-[13px] text-text-3">{t(opt.blurb)}</span>
                  </span>
                  {selected && (
                    <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Flex-only rollover cap */}
        {type === 'flex' && (
          <div className="mt-4">
            <FormGroup>
              <FieldRow label={t('Rollover cap')}>
                <MoneyInput value={cap} onChange={setCap} placeholder={t('Uncapped')} />
              </FieldRow>
            </FormGroup>
          </div>
        )}

        <p className="px-1 pt-3 text-[13px] leading-relaxed text-text-3">
          {type === 'fixed'
            ? t(
                'Spending in {0} is tracked from the 1st of each calendar month. Insights compare actual spend against this limit.',
                meta ? t(meta.label) : '',
              )
            : type === 'flex'
              ? t('Unused {0} budget rolls into next month (an overspend is forgiven). Set a cap to limit how much accumulates.', meta ? t(meta.label) : '')
              : t('{0} accumulates every month like a fund for irregular costs; both surplus and shortfall carry forward.', meta ? t(meta.label) : '')}
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
