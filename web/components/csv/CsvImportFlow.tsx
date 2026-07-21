'use client'
// Phase dispatcher for the CSV import session, rendered in the shared slide-out
// Drawer (right-side drawer on desktop, full-screen on mobile — the same
// affordance add/edit transaction uses).
// idle → renders nothing (triggered externally via loadFile)
// list-view → CsvImportList, or the per-row editor pushed into the same pane
// importing → brief loading state
// summary → CsvImportSummary
// undetected → supported banks list
import { useEffect, useState, type ReactNode } from 'react'
import { useCsvImport } from '@/lib/csv/useCsvImport'
import { Drawer, DrawerHeader } from '@/components/web/Drawer'
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
  }, [initialFile, loadFile])

  const handleClose = () => {
    reset()
    setEditingId(null)
    onClose()
  }

  if (phase === 'idle') return null

  if (phase === 'undetected') {
    return (
      <CsvDrawer label="Unsupported CSV format" onClose={handleClose}>
        <DrawerHeader title="Import CSV" onClose={handleClose} />
        <TrayBody>
          <div style={{ padding: '24px' }}>
            <p style={{ color: 'var(--text)', marginBottom: '16px' }}>
              We don&apos;t recognise this bank&apos;s CSV format yet.
            </p>
            <p style={{ color: 'var(--text-2)', fontSize: '14px', marginBottom: '8px', fontWeight: 600 }}>
              Supported banks:
            </p>
            <ul style={{ color: 'var(--text-2)', fontSize: '14px', paddingLeft: '16px' }}>
              {SUPPORTED_BANKS.map((b) => (
                <li key={b} style={{ marginBottom: '4px' }}>{b}</li>
              ))}
            </ul>
            <button onClick={handleClose} style={{ ...confirmBtnStyle, marginTop: '24px', width: '100%' }}>
              Close
            </button>
          </div>
        </TrayBody>
      </CsvDrawer>
    )
  }

  if (phase === 'importing') {
    return (
      <CsvDrawer label="Importing CSV" onClose={handleClose}>
        <DrawerHeader title="Import CSV" onClose={handleClose} />
        <TrayBody>
          <div role="status" aria-live="polite" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-2)' }}>
            Adding transactions…
          </div>
        </TrayBody>
      </CsvDrawer>
    )
  }

  if (phase === 'summary' && summary) {
    return (
      <CsvDrawer label="Import complete" onClose={handleClose}>
        <DrawerHeader title="Import complete" onClose={handleClose} />
        <TrayBody>
          <CsvImportSummary
            addedCount={summary.addedCount}
            totalSpendCents={summary.totalSpendCents}
            skippedCount={summary.skippedCount}
            excludedCount={summary.excludedCount}
            duplicatesCount={summary.duplicatesCount}
            onDone={handleClose}
          />
        </TrayBody>
      </CsvDrawer>
    )
  }

  if (phase === 'list-view') {
    const editingDraft = editingId ? drafts.find((d) => d.id === editingId) ?? null : null

    // The per-row editor is pushed into the SAME pane (master → detail) with a
    // back button, rather than covering the screen. Esc steps back to the list.
    return (
      <CsvDrawer
        label={editingDraft ? 'Edit transaction' : 'CSV import preview'}
        onClose={handleClose}
        onEscape={editingDraft ? () => setEditingId(null) : handleClose}
      >
        {editingDraft ? (
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
        ) : (
          <>
            <DrawerHeader title={bankLabel} onClose={handleClose} />
            <TrayBody>
              <CsvImportList
                drafts={drafts}
                onEdit={(id) => setEditingId(id)}
                onToggle={toggleChecked}
                onConfirm={startImport}
              />
            </TrayBody>
          </>
        )}
      </CsvDrawer>
    )
  }

  return null
}

/** The CSV import shell: the shared Drawer, always open (the phase gates whether
 *  it renders at all) and full-screen on mobile like the add/edit form. */
function CsvDrawer({
  label,
  onClose,
  onEscape,
  children,
}: {
  label: string
  onClose: () => void
  onEscape?: () => void
  children: ReactNode
}) {
  return (
    <Drawer open onClose={onClose} onEscape={onEscape} label={label} fullBleedOnMobile>
      {children}
    </Drawer>
  )
}

/** Flex-fill scroll area under a drawer header. Gives the phase content a bounded
 *  height so an inner list + sticky footer (CsvImportList) works. */
function TrayBody({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {children}
    </div>
  )
}

const confirmBtnStyle: React.CSSProperties = {
  padding: '12px 24px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 600,
  cursor: 'pointer',
}
