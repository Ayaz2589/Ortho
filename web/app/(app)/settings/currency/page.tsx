'use client'

import Link from 'next/link'
import { ChevronLeft, Globe } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard } from '@/components/settings/rows'
import { ChoiceRow } from '@/components/settings/ChoiceRows'
import { CURRENCIES, CURRENCY_NAMES, currencyCode } from '@/lib/finance/currency'
import type { Translate } from '@/lib/i18n'

function ratesCaption({
  isLoading,
  lastFetched,
  error,
  hasRates,
  locale,
  t,
}: {
  isLoading: boolean
  lastFetched: number | null
  error: string | null
  hasRates: boolean
  locale: string
  t: Translate
}): string {
  if (isLoading && !hasRates) return t('Updating rates…')
  if (lastFetched != null) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    const seconds = Math.round((lastFetched - Date.now()) / 1000)
    const abs = Math.abs(seconds)
    let label: string
    if (abs < 60) label = rtf.format(seconds, 'second')
    else if (abs < 3600) label = rtf.format(Math.round(seconds / 60), 'minute')
    else if (abs < 86400) label = rtf.format(Math.round(seconds / 3600), 'hour')
    else label = rtf.format(Math.round(seconds / 86400), 'day')
    return t('Rates updated {0}', label)
  }
  if (error != null) return t('Rates unavailable; using approximate values.')
  return t('Loading rates…')
}

export default function CurrencyPage() {
  const { currency, setCurrency, rates, ratesLastFetched, ratesIsLoading, ratesError, locale, t } = useApp()

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Currency')} />
      <SectionCard>
        {CURRENCIES.map((c) => (
          <ChoiceRow
            key={c}
            icon={<Globe size={16} />}
            label={`${t(CURRENCY_NAMES[c])} (${currencyCode(c)})`}
            active={c === currency}
            onClick={() => setCurrency(c)}
          />
        ))}
      </SectionCard>
      <p className="mt-2 px-1 text-[13px] leading-relaxed text-text-3">
        {ratesCaption({
          isLoading: ratesIsLoading,
          lastFetched: ratesLastFetched,
          error: ratesError,
          hasRates: Object.keys(rates).length > 0,
          locale,
          t,
        })}
      </p>
    </ReadingColumn>
  )
}
