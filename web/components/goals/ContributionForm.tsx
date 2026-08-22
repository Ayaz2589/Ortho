'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { Modal, FormGroup, FieldRow } from '@/components/ui'
import { TextInput, MoneyInput, parseMoney, DatePicker } from '@/components/inputs'
import { fractionDigits } from '@/lib/finance/currency'
import type { Goal, GoalContribution } from '@/lib/types'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Stored USD cents rendered in the display currency, for pre-filling the field. */
function centsToDisplay(cents: number, rate: number, fd: number): string {
  return ((cents / 100) * rate).toFixed(fd)
}

/** Add a contribution toward a goal (spec 027), or correct an existing one
 *  (spec 045 US3). `goal` drives visibility (null = closed); `editing` selects the
 *  mode. Money is entered in the display currency and stored as USD cents. */
export function ContributionForm({
  goal,
  editing,
  onClose,
}: {
  goal: Goal | null
  /** The contribution being corrected, or null/undefined to add a new one. */
  editing?: GoalContribution | null
  onClose: () => void
}) {
  const { currency, rate, currentUserId, addContribution, updateContribution, t } = useApp()
  const r = rate(currency)
  const fd = fractionDigits(currency)

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  // The amount text as it was pre-filled. If the user never touches the field,
  // Save writes the STORED cents verbatim rather than re-parsing — a
  // cents→display→cents round trip is lossy in several currencies (at GBP 0.78,
  // 11¢ renders "0.09" and re-parses to 12¢), and silently shifting a contribution
  // would shift the goal's whole saved total. Mirrors `useTxForm`'s
  // `originalAmountText` guard (spec 023 B1).
  const [originalAmountText, setOriginalAmountText] = useState('')

  useEffect(() => {
    if (!goal) return
    if (editing) {
      const text = centsToDisplay(editing.amount_cents, r, fd)
      setAmount(text)
      setOriginalAmountText(text)
      setDate(editing.date)
      setNote(editing.note ?? '')
      return
    }
    setAmount('')
    setOriginalAmountText('')
    setDate(todayISO())
    setNote('')
    // `editing?.id` (not the object) so a re-render with an equal-but-new object
    // doesn't clobber what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, editing?.id, r, fd])

  const parsed = parseMoney(amount, currency, r)
  const untouched = editing != null && amount === originalAmountText
  const cents = untouched ? editing!.amount_cents : parsed
  const canSave = cents != null && cents > 0 && !!goal

  const handleSave = () => {
    if (!canSave || cents == null || !goal) return
    if (editing) {
      updateContribution({
        ...editing,
        amount_cents: cents,
        date: date || editing.date,
        note: note.trim() || null,
      })
      onClose()
      return
    }
    const contribution: GoalContribution = {
      id: crypto.randomUUID(),
      goal_id: goal.id,
      amount_cents: cents,
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
      title={editing ? t('Edit contribution') : goal ? t('Add to {0}', goal.name) : t('Add contribution')}
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
          <MoneyInput value={amount} onChange={setAmount} autoFocus ariaLabel={t('Amount')} />
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
