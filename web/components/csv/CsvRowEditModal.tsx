'use client'
// Per-row editor for the CSV import review, pushed into the slide-out pane.
// Mirrors the new/edit transaction form: merchant, category, multiple owners,
// tags, and a note. Amount + date are read-only (they come from the statement).
// Edits live in session state (not the store) until the import is committed;
// "Skip" drops the row, and duplicate rows offer an "include anyway" toggle.
import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { Copy } from 'lucide-react'
import { useApp } from '@/lib/store'
import { categoryMeta, SPEND_CATEGORIES } from '@/lib/categories'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'
import type { TransactionCategory } from '@/lib/types'
import { mediumDate } from '@/lib/format'
import { rankedMerchants, suggestMerchants } from '@/lib/csv/merchantSuggest'
import { Avatar } from '@/components/ui'
import { CatTile } from '@/components/web/kit'
import { TagEditor } from '@/components/web/TagEditor'

interface Props {
  draft: CsvDraftRow
  onSave: (id: string, patch: Partial<Omit<CsvDraftRow, 'id' | 'source'>>) => void
  onSkip: (id: string) => void
  onClose: () => void
}

export function CsvRowEditModal({ draft, onSave, onSkip, onClose }: Props) {
  const { householdMembers, transactions, formatMoney, t } = useApp()
  const [merchant, setMerchant] = useState(draft.merchant)
  const [category, setCategory] = useState<TransactionCategory>(draft.category)
  const [ownerIds, setOwnerIds] = useState<string[]>(draft.ownerIds)
  const [tags, setTags] = useState<string[]>(draft.tags)
  const [notes, setNotes] = useState(draft.notes ?? '')
  // Reflect an already-included duplicate (checked despite being a dup) so the
  // toggle isn't shown unchecked when reopening a row the user already included.
  const [includeAnyway, setIncludeAnyway] = useState(!!draft.duplicateOf && draft.checked)

  useEffect(() => {
    setMerchant(draft.merchant)
    setCategory(draft.category)
    setOwnerIds(draft.ownerIds)
    setTags(draft.tags)
    setNotes(draft.notes ?? '')
    setIncludeAnyway(!!draft.duplicateOf && draft.checked)
  }, [draft.id])

  const isExpense = draft.source.kind === 'expense'
  const showOwners = householdMembers.length > 1

  // Merchant names the household already uses — for autocomplete + "you've used"
  // suggestions that normalize a messy CSV descriptor to a familiar name.
  const knownMerchants = useMemo(() => rankedMerchants(transactions), [transactions])
  const merchantSuggestions = useMemo(
    () => suggestMerchants(merchant, knownMerchants),
    [merchant, knownMerchants]
  )

  const toggleOwner = (id: string) =>
    setOwnerIds((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]
    )

  const handleSave = () => {
    const patch: Partial<Omit<CsvDraftRow, 'id' | 'source'>> = {
      merchant,
      category,
      ownerIds,
      tags,
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
    // Detail view pushed into the slide-out pane (not a full-screen overlay):
    // fills the tray body; the back button steps back to the list.
    <div
      role="group"
      aria-label="Edit transaction"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg)' }}
    >
      {/* Header: back chip · title · Save — mirrors the shared DrawerHeader. */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          padding: '18px 20px 14px',
          borderBottom: '0.5px solid var(--hairline)',
          flexShrink: 0,
        }}
      >
        <button className="ow-btn ow-chip-btn" aria-label="Back" onClick={onClose} style={{ width: 28, height: 28, zIndex: 1 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M7.5 2L3.5 6l4 4" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 15,
            fontWeight: 400,
            color: 'var(--text)',
            letterSpacing: '-0.3px',
            pointerEvents: 'none',
          }}
        >
          Review import
        </div>
        <button
          className="ow-btn"
          onClick={handleSave}
          style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.2px', zIndex: 1 }}
        >
          Save
        </button>
      </div>

      {/* Fields — same vocabulary as the new/edit transaction form. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 0 8px' }}>
        {/* Merchant — with autocomplete from the household's own merchant names
            and "you've used" chips to normalize a messy CSV descriptor. */}
        <div className="ow-card" style={{ margin: '0 20px 14px' }}>
          <Row label="Merchant" first>
            <input
              className="ow-row-input"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g. Whole Foods"
              aria-label="Merchant"
              list="csv-merchant-suggestions"
              autoComplete="off"
            />
          </Row>
          {merchantSuggestions.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
                padding: '0 20px 12px',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 2 }}>You’ve used</span>
              {merchantSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ow-btn"
                  onClick={() => setMerchant(s)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 13,
                    color: 'var(--accent)',
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <datalist id="csv-merchant-suggestions">
          {knownMerchants.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        {/* Category · amount · date */}
        <div className="ow-card" style={{ margin: '0 20px 14px' }}>
          {isExpense && (
            <Row label="Category" first>
              <CatTile category={category} size={22} />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                aria-label="Category"
                style={selectStyle}
              >
                {SPEND_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryMeta(c).label}
                  </option>
                ))}
              </select>
            </Row>
          )}
          <Row label="Amount" first={!isExpense}>
            <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(draft.amountCents)}
            </span>
          </Row>
          <Row label="Date">
            <span style={{ color: 'var(--text-2)' }}>{mediumDate(new Date(draft.dateISO))}</span>
          </Row>
        </div>

        {/* Owners — tap to toggle; leave the split even (computed on commit). */}
        {showOwners && (
          <div className="ow-card" style={{ margin: '0 20px 14px' }}>
            <Row label="Owners" first>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {householdMembers.map((u) => {
                  const on = ownerIds.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={on}
                      className="ow-btn"
                      onClick={() => toggleOwner(u.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 9px 3px 4px',
                        borderRadius: 999,
                        background: 'var(--chip-bg)',
                        boxShadow: on ? 'inset 0 0 0 1.5px var(--text)' : 'none',
                      }}
                    >
                      <Avatar user={u} size={20} />
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text)' }}>{u.name}</span>
                    </button>
                  )
                })}
              </div>
            </Row>
          </div>
        )}

        {/* Tags */}
        <div style={{ padding: '0 28px 4px', fontSize: 12.5, color: 'var(--text-3)' }}>{t('Tags')}</div>
        <TagEditor value={tags} onChange={setTags} />

        {/* Note */}
        <div className="ow-card" style={{ margin: '0 20px 14px' }}>
          <div style={{ padding: '13px 20px' }}>
            <textarea
              className="ow-row-input"
              aria-label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note (optional)"
              rows={2}
              style={{ width: '100%', resize: 'vertical', textAlign: 'left', minHeight: 44 }}
            />
          </div>
        </div>

        {draft.duplicateOf && (
          <div
            className="ow-card"
            style={{
              margin: '0 20px 14px',
              padding: '12px 16px',
              // Match the list's duplicate highlight: sand wash + left accent bar.
              background: 'color-mix(in srgb, var(--accent) 7%, transparent)',
              boxShadow: 'inset 3px 0 0 0 var(--accent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--accent)', fontSize: '13px' }}>
                  <Copy size={12} strokeWidth={2.2} />
                  Possible duplicate
                </div>
                <div style={{ color: 'var(--text-2)', fontSize: '12px', marginTop: 2 }}>
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
          </div>
        )}

        <div style={{ padding: '2px 20px 24px' }}>
          <button
            onClick={handleSkip}
            style={{
              width: '100%',
              padding: '12px',
              background: 'none',
              border: '0.5px solid var(--hairline)',
              borderRadius: '10px',
              color: 'var(--text-2)',
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

const selectStyle: React.CSSProperties = {
  appearance: 'none',
  border: 0,
  background: 'transparent',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 400,
  color: 'var(--text)',
  textAlign: 'right',
  letterSpacing: '-0.2px',
  cursor: 'pointer',
}

/** Label-on-left / control-on-right form row (matches the transaction form's Row). */
function Row({ label, children, first = false }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 20px',
        minHeight: 50,
        borderTop: first ? 'none' : '0.5px solid var(--hairline)',
      }}
    >
      <div style={{ flex: '0 0 92px', fontSize: 14, color: 'var(--text-2)', letterSpacing: '-0.1px' }}>{label}</div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 15, color: 'var(--text)' }}>
        {children}
      </div>
    </div>
  )
}
