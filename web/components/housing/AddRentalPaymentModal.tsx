'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { FormGroup, FieldRow, PrimaryButton } from '@/components/ui'
import { Drawer, DrawerHeader } from '@/components/web/Drawer'
import { TextInput, MoneyInput, parseMoney, DatePicker } from '@/components/inputs'
import { fractionDigits } from '@/lib/finance/currency'
import type { Property, RentalPayment } from '@/lib/types'

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Convert USD cents to a display-currency string for prefilling MoneyInput. */
function centsToDisplay(cents: number, currency: ReturnType<typeof useApp>['currency'], rate: number): string {
  const digits = fractionDigits(currency)
  // USD-cents storage invariant: always divide by 100, then apply the FX rate.
  const value = (cents / 100) * rate
  return value.toFixed(digits)
}

export function AddRentalPaymentModal({
  open,
  onClose,
  property,
}: {
  open: boolean
  onClose: () => void
  property: Property
}) {
  const { currency, rate, addRentalPayment, t } = useApp()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    const rentCents = property.lease?.monthly_rent_cents ?? 0
    setAmount(rentCents > 0 ? centsToDisplay(rentCents, currency, rate(currency)) : '')
    setDate(todayISO())
    setNote('')
    // Reset only when the modal opens — currency/rate are read at run time so
    // mid-edit parent re-renders don't wipe the user's input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, property.id])

  const parsed = parseMoney(amount, currency, rate(currency))
  const canAdd = parsed != null && parsed > 0

  const handleAdd = () => {
    if (parsed == null || parsed <= 0) return
    const payment: RentalPayment = {
      id: crypto.randomUUID(),
      property_id: property.id,
      amount_cents: parsed,
      date,
      // Empty → null, otherwise stored as typed (iOS parity: no trimming).
      note: note === '' ? null : note,
      created_at: new Date().toISOString(),
    }
    addRentalPayment(payment)
    onClose()
  }

  return (
    <Drawer open={open} onClose={onClose} label={t('Log payment')}>
      <DrawerHeader
        title={t('Log payment')}
        onClose={onClose}
        right={
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="text-[15px] text-accent disabled:opacity-40"
          >
            {t('Add')}
          </button>
        }
      />
      <div className="overflow-auto p-4 pb-6">
      <FormGroup>
        <FieldRow label={t('Amount')} labelWidth={96}>
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </FieldRow>
        <FieldRow label={t('Date')} labelWidth={96}>
          <DatePicker value={date} onChange={setDate} ariaLabel={t('Payment date')} />
        </FieldRow>
        <FieldRow label={t('Note')} labelWidth={96}>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('Optional')}
          />
        </FieldRow>
      </FormGroup>
      <div className="mt-5">
        <PrimaryButton onClick={handleAdd} disabled={!canAdd}>
          {t('Add payment')}
        </PrimaryButton>
      </div>
      </div>
    </Drawer>
  )
}
