'use client'
// Phase dispatcher for the CSV import session, rendered in the shared slide-out
// Drawer (right-side drawer on desktop, full-screen on mobile — the same
// affordance add/edit transaction uses). The uploader lives INSIDE the tray:
// idle → upload view (dropzone + supported banks); pick/drop a file and the
// same tray switches to the parsed list.
// idle → CsvUploadView (or a loading state when opened with a preset file)
// list-view → CsvImportList, or the per-row editor pushed into the same pane
// importing → brief loading state
// summary → CsvImportSummary
// undetected → upload view with an "unrecognized format" note
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { useApp } from '@/lib/store'
import { useCsvImport } from '@/lib/csv/useCsvImport'
import { clearCsvSession } from '@/lib/csv/csvImportPersistence'
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
  /** Optional preset file — bypasses the in-tray uploader and parses straight
   *  away. Left over for callers that already have a File; the primary flow now
   *  opens on the upload view and takes the file from there. */
  initialFile?: File | null
}

export function CsvImportFlow({ onClose, initialFile }: Props) {
  const { t } = useApp()
  const { phase, drafts, bankLabel, summary, loadFile, toggleChecked, updateDraft, skipDraft, startImport, reset } =
    useCsvImport()
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (initialFile) void loadFile(initialFile)
  }, [initialFile, loadFile])

  const handleClose = () => {
    reset()
    setEditingId(null)
    // clearCsvSession() must be called here — the useEffect in useCsvImport races with unmount and loses.
    clearCsvSession()
    onClose()
  }

  // idle: show the in-tray uploader (unless a preset file is mid-parse).
  if (phase === 'idle') {
    if (initialFile) {
      return (
        <CsvDrawer label={t('Importing CSV')} onClose={handleClose}>
          <DrawerHeader title={t('Import CSV')} onClose={handleClose} />
          <TrayBody>
            <div role="status" aria-live="polite" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-2)' }}>
              {t('Reading file…')}
            </div>
          </TrayBody>
        </CsvDrawer>
      )
    }
    return (
      <CsvDrawer label={t('Import CSV')} onClose={handleClose}>
        <DrawerHeader title={t('Import CSV')} onClose={handleClose} />
        <TrayBody>
          <CsvUploadView onFile={(f) => void loadFile(f)} />
        </TrayBody>
      </CsvDrawer>
    )
  }

  if (phase === 'undetected') {
    return (
      <CsvDrawer label={t('Unsupported CSV format')} onClose={handleClose}>
        <DrawerHeader title={t('Import CSV')} onClose={handleClose} />
        <TrayBody>
          <CsvUploadView
            onFile={(f) => void loadFile(f)}
            error={t('We don’t recognise this bank’s CSV format yet. Try one of the supported banks below.')}
          />
        </TrayBody>
      </CsvDrawer>
    )
  }

  if (phase === 'importing') {
    return (
      <CsvDrawer label={t('Importing CSV')} onClose={handleClose}>
        <DrawerHeader title={t('Import CSV')} onClose={handleClose} />
        <TrayBody>
          <div role="status" aria-live="polite" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-2)' }}>
            {t('Adding transactions…')}
          </div>
        </TrayBody>
      </CsvDrawer>
    )
  }

  if (phase === 'summary' && summary) {
    return (
      <CsvDrawer label={t('Import complete')} onClose={handleClose}>
        <DrawerHeader title={t('Import complete')} onClose={handleClose} />
        <TrayBody>
          <CsvImportSummary
            addedCount={summary.addedCount}
            failedCount={summary.failedCount}
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
        label={editingDraft ? t('Edit transaction') : t('CSV import preview')}
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
              {/* Changing owners from the list resets any custom split back to
                  even (same rule as the row editor) so it can't reference a
                  dropped owner. */}
              <CsvImportList
                drafts={drafts}
                onEdit={(id) => setEditingId(id)}
                onToggle={toggleChecked}
                onConfirm={startImport}
                onSetOwners={(id, ownerIds) => updateDraft(id, { ownerIds, split: null })}
                onSetPayer={(id, personId) => updateDraft(id, { paidById: personId })}
              />
            </TrayBody>
          </>
        )}
      </CsvDrawer>
    )
  }

  return null
}

/** The in-tray uploader: a click/drag dropzone plus the list of supported banks.
 *  Picking or dropping a .csv hands the File to `onFile` (→ parse → list view). */
function CsvUploadView({ onFile, error }: { onFile: (file: File) => void; error?: string }) {
  const { t } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const pick = () => inputRef.current?.click()
  const take = (files: FileList | null) => {
    const f = files?.[0]
    if (f) onFile(f)
  }

  return (
    <div style={{ padding: '20px' }}>
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            lineHeight: 1.45,
            color: 'var(--text-2)',
            background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
            boxShadow: 'inset 3px 0 0 0 var(--accent)',
          }}
        >
          {error}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label={t('Upload a CSV file')}
        onClick={pick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            pick()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          take(e.dataTransfer.files)
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '36px 20px',
          borderRadius: 16,
          cursor: 'pointer',
          textAlign: 'center',
          border: '1.5px dashed var(--hairline)',
          background: dragOver ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface)',
          boxShadow: dragOver ? 'inset 0 0 0 1.5px var(--accent)' : 'none',
          transition: 'background var(--duration-fast) var(--ease-out)',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 999,
            background: 'var(--chip-bg)',
            color: 'var(--accent)',
          }}
        >
          <Upload size={20} />
        </span>
        <div style={{ fontSize: 15, color: 'var(--text)' }}>{t('Upload a CSV')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('Drag a file here, or click to browse')}</div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        aria-hidden="true"
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
      />

      <div style={{ marginTop: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            color: 'var(--text-2)',
            marginBottom: 8,
          }}
        >
          <FileSpreadsheet size={14} />
          {t('Supported CSVs')}
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SUPPORTED_BANKS.map((b) => (
            <li
              key={b}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 4px',
                fontSize: 14,
                color: 'var(--text)',
                borderBottom: '0.5px solid var(--hairline)',
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--accent)', flexShrink: 0 }} />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
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
