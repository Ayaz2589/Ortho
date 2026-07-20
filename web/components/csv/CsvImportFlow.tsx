'use client'
// Phase dispatcher for the CSV import session.
// idle → renders nothing (triggered externally via loadFile)
// list-view → CsvImportList + optional CsvRowEditModal overlay
// importing → brief loading overlay
// summary → CsvImportSummary
// undetected → supported banks list
import { useState, useEffect } from 'react'
import { useCsvImport } from '@/lib/csv/useCsvImport'
import { CsvImportList } from './CsvImportList'
import { CsvImportSummary } from './CsvImportSummary'
import { CsvRowEditModal } from './CsvRowEditModal'

const SUPPORTED_BANKS = [
  'Chase (Credit Card)',
  'American Express',
  'Citi',
  'Capital One',
  'Bank of America',
  'Wells Fargo',
  'TD Bank (Checking)',
]

interface Props {
  onClose: () => void
  initialFile?: File | null
}

export function CsvImportFlow({ onClose, initialFile }: Props) {
  const { phase, drafts, bankLabel, summary, loadFile, toggleChecked, updateDraft, skipDraft, startImport, reset } =
    useCsvImport()
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (initialFile) void loadFile(initialFile)
  }, [initialFile])

  const handleClose = () => {
    reset()
    setEditingId(null)
    onClose()
  }

  if (phase === 'idle') return null

  if (phase === 'undetected') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Unsupported CSV format"
        className="ow-drawer-scrim"
        style={overlayStyle}
      >
        <div style={sheetStyle}>
          <div style={headerStyle}>
            <span style={{ fontWeight: 600 }}>Import CSV</span>
            <button onClick={handleClose} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ padding: '24px' }}>
            <p style={{ color: 'var(--text)', marginBottom: '16px' }}>
              We don&apos;t recognise this bank&apos;s CSV format yet.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px', fontWeight: 600 }}>
              Supported banks:
            </p>
            <ul style={{ color: 'var(--text-secondary)', fontSize: '14px', paddingLeft: '16px' }}>
              {SUPPORTED_BANKS.map((b) => (
                <li key={b} style={{ marginBottom: '4px' }}>{b}</li>
              ))}
            </ul>
            <button onClick={handleClose} style={{ ...confirmBtnStyle, marginTop: '24px', width: '100%' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'importing') {
    return (
      <div role="status" aria-live="polite" className="ow-drawer-scrim" style={overlayStyle}>
        <div style={sheetStyle}>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Adding transactions…
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'summary' && summary) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Import complete" className="ow-drawer-scrim" style={overlayStyle}>
        <div style={sheetStyle}>
          <div style={headerStyle}>
            <span style={{ fontWeight: 600 }}>Import complete</span>
            <button onClick={handleClose} style={closeBtnStyle}>✕</button>
          </div>
          <CsvImportSummary
            addedCount={summary.addedCount}
            totalSpendCents={summary.totalSpendCents}
            skippedCount={summary.skippedCount}
            excludedCount={summary.excludedCount}
            duplicatesCount={summary.duplicatesCount}
            onDone={handleClose}
          />
        </div>
      </div>
    )
  }

  if (phase === 'list-view') {
    const editingDraft = editingId ? drafts.find((d) => d.id === editingId) ?? null : null

    return (
      <div role="dialog" aria-modal="true" aria-label="CSV import preview" className="ow-drawer-scrim" style={overlayStyle}>
        <div style={sheetStyle}>
          <div style={headerStyle}>
            <div>
              <span style={{ fontWeight: 600 }}>{bankLabel}</span>
            </div>
            <button onClick={handleClose} style={closeBtnStyle}>✕</button>
          </div>

          <CsvImportList
            drafts={drafts}
            onEdit={(id) => setEditingId(id)}
            onToggle={toggleChecked}
            onConfirm={startImport}
          />

          {editingDraft && (
            <CsvRowEditModal
              draft={editingDraft}
              onSave={(id, patch) => {
                updateDraft(id, patch)
                setEditingId(null)
              }}
              onSkip={(id) => {
                skipDraft(id)
                setEditingId(null)
              }}
              onClose={() => setEditingId(null)}
            />
          )}
        </div>
      </div>
    )
  }

  return null
}

const overlayStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  zIndex: 100,
}

const sheetStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '640px',
  maxHeight: '85vh',
  background: 'var(--background)',
  borderRadius: '12px 12px 0 0',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px',
  borderBottom: '0.5px solid var(--hairline)',
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontSize: '18px',
  padding: '4px',
}

const confirmBtnStyle: React.CSSProperties = {
  padding: '12px 24px',
  background: 'var(--accent)',
  color: 'var(--background)',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 600,
  cursor: 'pointer',
}
