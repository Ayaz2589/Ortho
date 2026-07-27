'use client'

// spec 032 — import panel: pick a previously-exported PDF, preview what it will
// add (per section, with duplicates already recognized), confirm, then see a
// summary. Additive + idempotent; a non-Ortho or unreadable file changes
// nothing and explains why.

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PrimaryButton, SectionLabel } from '@/components/ui'
import { SectionCard } from '@/components/settings/rows'
import { readEnvelope } from '@/lib/dataFile/readPdf'
import { applyImport, planImport, type ImportPlan, type ImportResult } from '@/lib/dataFile/import'
import type { ValidateReason } from '@/lib/dataFile/envelope'
import type { Translate } from '@/lib/i18n'

function rejectMessage(reason: ValidateReason, t: Translate): string {
  switch (reason) {
    case 'unsupported-version':
      return t('This file was made by a newer version of Ortho. Update the app to import it.')
    case 'corrupt':
      return t('This file looks damaged and can’t be read.')
    default:
      return t('That doesn’t look like an Ortho data file.')
  }
}

function sectionLabel(key: string, t: Translate): string {
  if (key === 'transactions') return t('Transactions')
  if (key === 'housing') return t('Housing')
  return key
}

export function DataImportPanel() {
  const app = useApp()
  const { t } = app
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPlan | null>(null)
  const [reject, setReject] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setPreview(null)
    setReject(null)
    setSummary(null)
  }

  const onFile = async (file: File) => {
    reset()
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const read = await readEnvelope(bytes)
      if (!read.ok) {
        setReject(rejectMessage(read.reason, t))
        return
      }
      setPreview(planImport(read.envelope, app))
    } catch {
      setReject(rejectMessage('corrupt', t))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onConfirm = () => {
    if (!preview) return
    applyImport(preview.plans, app, { now: new Date().toISOString() })
    setSummary(preview.result)
    setPreview(null)
  }

  const totalToAdd = preview?.result.sections.reduce((n, s) => n + s.added, 0) ?? 0

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>{t('Restore from a file')}</SectionLabel>
      <p className="px-1 text-[13px] leading-relaxed text-text-3">
        {t('Upload a PDF you exported before. Anything already in your data is skipped.')}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        aria-label={t('Choose a PDF to import')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-[15px] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
        style={{ background: 'var(--chip-bg)' }}
      >
        <Upload size={16} />
        {busy ? t('Reading…') : t('Choose a PDF')}
      </button>

      {reject && (
        <SectionCard>
          <p className="p-4 text-[15px] text-text-2">{reject}</p>
        </SectionCard>
      )}

      {preview && (
        <SectionCard>
          <div className="flex flex-col gap-2 p-4">
            {preview.result.fileLabel && (
              <p className="text-[13px] text-text-3">{preview.result.fileLabel}</p>
            )}
            {preview.result.sections.map((s) => (
              <div key={s.key} className="flex items-baseline justify-between text-[15px]">
                <span className="text-text">
                  {s.known ? sectionLabel(s.key, t) : t('{0} (from a newer version)', s.key)}
                </span>
                <span className="text-text-2">
                  {s.known
                    ? t('add {0} · already there {1}', s.added, s.skippedById + s.skippedByContent)
                    : t('skipped')}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {preview && (
        <PrimaryButton onClick={onConfirm} disabled={totalToAdd === 0}>
          {totalToAdd === 0 ? t('Nothing new to add') : t('Add {0} items', totalToAdd)}
        </PrimaryButton>
      )}

      {summary && (
        <SectionCard>
          <div className="flex flex-col gap-2 p-4">
            <p className="text-[15px] text-text">{t('Done')}</p>
            {summary.sections
              .filter((s) => s.known)
              .map((s) => (
                <div key={s.key} className="flex items-baseline justify-between text-[15px]">
                  <span className="text-text">{sectionLabel(s.key, t)}</span>
                  <span className="text-text-2">
                    {t('added {0} · already there {1}', s.added, s.skippedById + s.skippedByContent)}
                  </span>
                </div>
              ))}
          </div>
        </SectionCard>
      )}
    </section>
  )
}
