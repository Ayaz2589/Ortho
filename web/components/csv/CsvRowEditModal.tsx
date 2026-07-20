'use client'
// Per-row edit modal. Saves changes to session state (not the store) on "Save".
// "Skip" removes the row from the import. Duplicate rows show a re-include toggle.
import { useState, useEffect } from 'react'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'
import type { TransactionCategory } from '@/lib/types'
import { PICKABLE_CATEGORIES } from '@/lib/types'
import { mediumDate } from '@/lib/format'

interface Props {
  draft: CsvDraftRow
  onSave: (id: string, patch: Partial<Omit<CsvDraftRow, 'id' | 'source'>>) => void
  onSkip: (id: string) => void
  onClose: () => void
}

export function CsvRowEditModal({ draft, onSave, onSkip, onClose }: Props) {
  const [merchant, setMerchant] = useState(draft.merchant)
  const [category, setCategory] = useState<TransactionCategory>(draft.category)
  const [notes, setNotes] = useState(draft.notes ?? '')
  const [includeAnyway, setIncludeAnyway] = useState(false)

  useEffect(() => {
    setMerchant(draft.merchant)
    setCategory(draft.category)
    setNotes(draft.notes ?? '')
    setIncludeAnyway(false)
  }, [draft.id])

  const handleSave = () => {
    const patch: Partial<Omit<CsvDraftRow, 'id' | 'source'>> = {
      merchant,
      category,
      notes: notes.trim() || null,
    }
    if (draft.duplicateOf && includeAnyway) {
      patch.checked = true
    }
    onSave(draft.id, patch)
    onClose()
  }

  const handleSkip = () => {
    onSkip(draft.id)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit transaction"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          borderBottom: '0.5px solid var(--hairline)',
        }}
      >
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', color: 'var(--text)' }}
        >
          ←
        </button>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Review import</span>
        <button
          onClick={handleSave}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--accent)',
            fontWeight: 600,
            padding: '4px 8px',
          }}
        >
          Save
        </button>
      </div>

      {/* Fields */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Field label="Merchant">
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            style={inputStyle}
            aria-label="Merchant"
          />
        </Field>

        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory)}
            style={inputStyle}
            aria-label="Category"
          >
            {PICKABLE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Amount">
          <span style={{ color: 'var(--text)', fontSize: '15px' }}>
            ${(draft.amountCents / 100).toFixed(2)}
          </span>
        </Field>

        <Field label="Date">
          <span style={{ color: 'var(--text)', fontSize: '15px' }}>
            {mediumDate(new Date(draft.dateISO))}
          </span>
        </Field>

        <Field label="Notes">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note…"
            style={inputStyle}
            aria-label="Notes"
          />
        </Field>

        {draft.duplicateOf && (
          <div
            style={{
              padding: '12px',
              background: 'var(--surface)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '13px' }}>
                Possible duplicate
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                A similar transaction may already be in your ledger
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeAnyway}
                onChange={(e) => setIncludeAnyway(e.target.checked)}
                aria-label="Include anyway"
              />
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>Include anyway</span>
            </label>
          </div>
        )}

        <div style={{ borderTop: '0.5px solid var(--hairline)', paddingTop: '16px' }}>
          <button
            onClick={handleSkip}
            style={{
              width: '100%',
              padding: '12px',
              background: 'none',
              border: '0.5px solid var(--hairline)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '15px',
            }}
          >
            Skip this transaction
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--surface)',
  border: '0.5px solid var(--hairline)',
  borderRadius: '6px',
  fontSize: '15px',
  color: 'var(--text)',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
        {label.toUpperCase()}
      </span>
      {children}
    </div>
  )
}
