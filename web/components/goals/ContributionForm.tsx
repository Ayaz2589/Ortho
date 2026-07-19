'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { Modal, FormGroup, FieldRow } from '@/components/ui'
import { TextInput, MoneyInput, parseMoney, DatePicker } from '@/components/inputs'
import type { Goal, GoalContribution } from '@/lib/types'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Add a contribution toward a goal (spec 027). `goal` drives visibility
 *  (null = closed). Money in the display currency → stored as USD cents. */
export function ContributionForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { currency, rate, currentUserId, addContribution, t } = useApp()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!goal) return
    setAmount('')
    setDate(todayISO())
    setNote('')
  }, [goal])

  const parsed = parseMoney(amount, currency, rate(currency))
  const canSave = parsed != null && parsed > 0 && !!goal

  const handleSave = () => {
    if (!canSave || parsed == null || !goal) return
    const contribution: GoalContribution = {
      id: crypto.randomUUID(),
      goal_id: goal.id,
      amount_cents: parsed,
      date: date || todayISO(),
      note: note.trim() || null,
      created_by: currentUserId,
      created_at: new Date().toISOString(),
    }
    addContribution(contribution)
    onClose()
  }

  return (
    <Modal
      open={goal !== null}
      onClose={onClose}
      title={goal ? t('Add to {0}', goal.name) : t('Add contribution')}
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
      <FormGroup>
        <FieldRow label={t('Amount')}>
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </FieldRow>
        <FieldRow label={t('Date')}>
          <DatePicker value={date} onChange={setDate} ariaLabel={t('Contribution date')} />
        </FieldRow>
        <FieldRow label={t('Note')}>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('Optional')}
          />
        </FieldRow>
      </FormGroup>
    </Modal>
  )
}
