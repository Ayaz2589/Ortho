'use client'

// spec 032 — export panel: pick a language + currency for the human-readable
// pages (defaulting to the app's current pair), then download a single PDF that
// also carries the machine-readable payload for lossless re-import.

import { useState } from 'react'
import { Download } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PrimaryButton, SectionLabel } from '@/components/ui'
import { SectionCard } from '@/components/settings/rows'
import { buildDataFile } from '@/lib/dataFile/export'
import { LANGUAGES, type Language } from '@/lib/language'
import { CURRENCIES, CURRENCY_NAMES, currencyCode } from '@/lib/finance/currency'
import type { CurrencyKey } from '@/lib/finance/money'

/** Concrete languages only — "System" isn't a fixed choice for a saved file. */
const EXPORT_LANGUAGES = LANGUAGES.filter((l): l is Exclude<Language, 'System'> => l !== 'System')

function downloadBlob(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const selectClass =
  'h-11 w-full rounded-[10px] px-3 text-[15px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function DataExportPanel() {
  const app = useApp()
  const { t, language: current, currency: currentCurrency } = app
  const [language, setLanguage] = useState<Exclude<Language, 'System'>>(
    current === 'System' ? 'English' : current
  )
  const [currency, setCurrency] = useState<CurrencyKey>(currentCurrency)
  const [busy, setBusy] = useState(false)

  const onDownload = async () => {
    setBusy(true)
    try {
      const { bytes, filename } = await buildDataFile(
        app,
        { language, currency, now: new Date().toISOString() },
        t,
        app.rate
      )
      downloadBlob(bytes, filename)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>{t('Download your data')}</SectionLabel>
      <p className="px-1 text-[13px] leading-relaxed text-text-3">
        {t('A PDF of your transactions and housing you can keep or re-import later.')}
      </p>
      <SectionCard>
        <div className="flex flex-col gap-4 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-text-2">{t('Language')}</span>
            <select
              aria-label={t('Export language')}
              value={language}
              onChange={(e) => setLanguage(e.target.value as Exclude<Language, 'System'>)}
              className={selectClass}
              style={{ background: 'var(--chip-bg)' }}
            >
              {EXPORT_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-text-2">{t('Currency')}</span>
            <select
              aria-label={t('Export currency')}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyKey)}
              className={selectClass}
              style={{ background: 'var(--chip-bg)' }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {`${t(CURRENCY_NAMES[c])} (${currencyCode(c)})`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>
      <PrimaryButton onClick={onDownload} disabled={busy}>
        <span className="inline-flex items-center gap-2">
          <Download size={16} />
          {busy ? t('Preparing…') : t('Download PDF')}
        </span>
      </PrimaryButton>
    </section>
  )
}
