'use client'

import { type InputHTMLAttributes } from 'react'
import { useApp } from '@/lib/store'
import { currencySymbol, type CurrencyKey } from '@/lib/finance/currency'
import { toUSDCents } from '@/lib/finance/money'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'w-full bg-transparent text-right text-[15px] text-text outline-none placeholder:text-text-3 ' +
        (props.className ?? '')
      }
    />
  )
}

/** Amount entry in the user's display currency. Value is the raw string. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  big,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  big?: boolean
}) {
  const { currency } = useApp()
  return (
    <div className="flex items-center gap-1">
      <span className={big ? 'text-[40px] font-bold text-text-2' : 'text-[15px] text-text-2'}>
        {currencySymbol(currency)}
      </span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
        placeholder={placeholder ?? '0.00'}
        className={
          big
            ? 'w-full bg-transparent text-[40px] font-bold text-text outline-none placeholder:text-text-3'
            : 'w-28 bg-transparent text-right text-[15px] text-text outline-none placeholder:text-text-3'
        }
      />
    </div>
  )
}

/** Parse the display-currency string back to USD cents. Returns null if empty/invalid. */
export function parseMoney(raw: string, currency: CurrencyKey, rate: number): number | null {
  const cleaned = raw.replace(/[,\s]/g, '')
  if (cleaned === '') return null
  const value = parseFloat(cleaned)
  if (isNaN(value)) return null
  return toUSDCents(value, currency, rate)
}
