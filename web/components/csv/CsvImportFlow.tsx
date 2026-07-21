'use client'
// Phase dispatcher for the CSV import session, rendered in the shared slide-out
// tray — a right-side drawer on desktop and a full-screen panel on mobile, the
// same affordance add/edit transaction uses (replaces the old bottom sheet).
// idle → renders nothing (triggered externally via loadFile)
// list-view → CsvImportList, or the per-row editor pushed into the same pane
// importing → brief loading state
// summary → CsvImportSummary
// undetected → supported banks list
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { useCsvImport } from '@/lib/csv/useCsvImport'
import { DrawerHeader } from '@/components/web/Drawer'
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
      <CsvTray label="Unsupported CSV format" onClose={handleClose}>
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
      </CsvTray>
    )
  }

  if (phase === 'importing') {
    return (
      <CsvTray label="Importing CSV" onClose={handleClose}>
        <DrawerHeader title="Import CSV" onClose={handleClose} />
        <TrayBody>
          <div role="status" aria-live="polite" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-2)' }}>
            Adding transactions…
          </div>
        </TrayBody>
      </CsvTray>
    )
  }

  if (phase === 'summary' && summary) {
    return (
      <CsvTray label="Import complete" onClose={handleClose}>
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
      </CsvTray>
    )
  }

  if (phase === 'list-view') {
    const editingDraft = editingId ? drafts.find((d) => d.id === editingId) ?? null : null

    // The per-row editor is pushed into the SAME pane (master → detail) with a
    // back button, rather than covering the screen. Esc steps back to the list.
    return (
      <CsvTray
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
      </CsvTray>
    )
  }

  return null
}

/**
 * The shared slide-out shell for every CSV import phase. On desktop (≥1024px)
 * it's the right-side `ow-drawer` + scrim; on mobile it's a full-screen panel —
 * mirroring how add/edit transaction renders (desktop drawer vs. full mobile
 * page). Portals to <body>, locks background scroll, and closes on Escape (and,
 * on desktop, scrim-click). Header-agnostic: each phase supplies its own header
 * (a standard close header, or the row editor's back header) so a detail view
 * can push into the same pane.
 */
function CsvTray({
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
  const isExpanded = useIsExpanded()
  const trapRef = useFocusTrap<HTMLElement>(true)

  useEffect(() => {
    const handleEscape = onEscape ?? onClose
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleEscape()
    }
    document.addEventListener('keydown', onKey)
    // Lock whichever element scrolls: <main> on desktop, <body> on mobile.
    const main = document.querySelector('main') as HTMLElement | null
    const prevBody = document.body.style.overflow
    const prevMain = main?.style.overflow
    document.body.style.overflow = 'hidden'
    if (main) main.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevBody
      if (main) main.style.overflow = prevMain ?? ''
    }
  }, [onClose, onEscape])

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {isExpanded && <div className="ow-drawer-scrim" onClick={onClose} aria-hidden="true" />}
      <aside
        ref={trapRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={isExpanded ? 'ow-drawer' : undefined}
        style={isExpanded ? { overflow: 'hidden' } : mobileSheetStyle}
      >
        {children}
      </aside>
    </>,
    document.body
  )
}

/** Flex-fill scroll area under a tray header. Gives the phase content a bounded
 *  height so an inner list + sticky footer (CsvImportList) works. */
function TrayBody({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {children}
    </div>
  )
}

const mobileSheetStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  background: 'var(--bg)',
  display: 'flex',
  flexDirection: 'column',
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
