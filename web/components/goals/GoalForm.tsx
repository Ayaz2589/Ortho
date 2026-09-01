'use client'

import { useEffect, useState } from 'react'
import { MinusCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Modal, FormGroup, FieldRow, Segmented } from '@/components/ui'
import { TextInput, MoneyInput, parseMoney, DatePicker } from '@/components/inputs'
import { fractionDigits } from '@/lib/finance/currency'
import { CATEGORY_GROUPS, CATEGORIES } from '@/lib/categories'
import type { Goal, GoalKind, TransactionCategory } from '@/lib/types'

function centsToDisplay(cents: number, currency: ReturnType<typeof useApp>['currency'], rate: number): string {
  const digits = fractionDigits(currency)
  return ((cents / 100) * rate).toFixed(digits)
}

/**
 * Create/edit a goal (spec 027). `open` drives visibility; `editing` is the goal
 * being edited (null = create). Uses the mobile Modal, matching the calm
 * secondary-route surfaces (budgets/settings). Association is optional
 * context-only: a category, or a linked account when the household has one.
 */
export function GoalForm({
  open,
  editing,
  onClose,
  onDelete,
}: {
  open: boolean
  editing: Goal | null
  onClose: () => void
  onDelete?: (goal: Goal) => void
}) {
  const { currency, rate, currentHousehold, currentUserId, linkedAccounts, addGoal, updateGoal, t } = useApp()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<GoalKind>('savings')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  // Association value: '' | `cat:<category>` | `acct:<id>`.
  const [link, setLink] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!open) return
    setConfirmRemove(false)
    setName(editing?.name ?? '')
    setKind(editing?.kind ?? 'savings')
    setAmount(editing ? centsToDisplay(editing.target_cents, currency, rate(currency)) : '')
    setDate(editing?.target_date ?? '')
    setLink(
      editing?.linked_category
        ? `cat:${editing.linked_category}`
        : editing?.linked_account_id
          ? `acct:${editing.linked_account_id}`
          : ''
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, currency])

  const parsed = parseMoney(amount, currency, rate(currency))
  const canSave = name.trim().length > 0 && parsed != null && parsed > 0 && !!currentHousehold

  const handleSave = () => {
    if (!canSave || parsed == null || !currentHousehold) return
    const linkedCategory = link.startsWith('cat:') ? (link.slice(4) as TransactionCategory) : null
    const linkedAccountId = link.startsWith('acct:') ? link.slice(5) : null
    const goal: Goal = {
      id: editing?.id ?? crypto.randomUUID(),
      household_id: currentHousehold.id,
      name: name.trim(),
      kind,
      target_cents: parsed,
      target_date: date || null,
      linked_account_id: linkedAccountId,
      linked_category: linkedCategory,
      created_by: editing?.created_by ?? currentUserId,
      created_at: editing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (editing) updateGoal(goal)
    else addGoal(goal)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('Edit item') : t('New item')}
      right={
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="text-accent disabled:opacity-40"
        >
          {t('Save')}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormGroup>
          <FieldRow label={t('Name')}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Emergency fund')}
            />
          </FieldRow>
          <FieldRow label={t('Type')}>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'savings', label: t('Savings') },
                { value: 'debt_payoff', label: t('Debt payoff') },
              ]}
            />
          </FieldRow>
          <FieldRow label={t('Target')}>
            <MoneyInput value={amount} onChange={setAmount} />
          </FieldRow>
          <FieldRow label={t('Target date')}>
            <div className="flex items-center gap-2">
              <DatePicker value={date} onChange={setDate} ariaLabel={t('Target date')} />
              {date ? (
                <button
                  type="button"
                  onClick={() => setDate('')}
                  className="text-[13px] text-text-3"
                  aria-label={t('Clear target date')}
                >
                  {t('Clear')}
                </button>
              ) : null}
            </div>
          </FieldRow>
          <FieldRow label={t('Link (optional)')}>
            <select
              value={link}
              onChange={(e) => setLink(e.target.value)}
              aria-label={t('Link (optional)')}
              className="max-w-[200px] bg-transparent text-right text-[15px] text-text outline-none"
            >
              <option value="">{t('None')}</option>
              {CATEGORY_GROUPS.expense.map((group) => (
                <optgroup key={group.key} label={t(group.label)}>
                  {group.children.map((c) => (
                    <option key={c} value={`cat:${c}`}>
                      {t(CATEGORIES[c].label)}
                    </option>
                  ))}
                </optgroup>
              ))}
              {linkedAccounts.length > 0 ? (
                <optgroup label={t('Account')}>
                  {linkedAccounts.map((a) => (
                    <option key={a.id} value={`acct:${a.id}`}>
                      {a.name}
                      {a.mask ? ` ••${a.mask}` : ''}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </FieldRow>
        </FormGroup>

        {editing && onDelete ? (
          confirmRemove ? (
            <button
              type="button"
              onClick={() => {
                onDelete(editing)
                onClose()
              }}
              className="flex items-center justify-center gap-2 rounded-2xl bg-surface py-3 text-[15px] text-destructive"
            >
              <MinusCircle size={18} />
              {t('Delete')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="py-2 text-center text-[15px] text-text-3"
            >
              {t('Delete')}
            </button>
          )
        ) : null}
      </div>
    </Modal>
  )
}
