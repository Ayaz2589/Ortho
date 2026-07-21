'use client'
// Date-grouped ledger preview of parsed CSV rows before commit, styled to match
// the app's Activity rows: category glyph tile · merchant + meta · amount.
// Normal rows: tappable, will be added. Payment rows: dimmed, non-tappable.
// Duplicate rows: muted, excluded by default but tappable to include.
import { ChevronRight, Copy } from 'lucide-react'
import { useApp } from '@/lib/store'
import { categoryMeta } from '@/lib/categories'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'
import { checkedDrafts } from '@/lib/csv/csvImportModels'
import { shortDate } from '@/lib/format'
import { CatTile } from '@/components/web/kit'

interface Props {
  drafts: CsvDraftRow[]
  onEdit: (id: string) => void
  onToggle: (id: string) => void
  onConfirm: () => void
}

interface DraftDayGroup {
  day: string
  dateLabel: string
  items: CsvDraftRow[]
}

function groupDraftsByDay(drafts: CsvDraftRow[]): DraftDayGroup[] {
  const buckets = new Map<string, CsvDraftRow[]>()
  for (const d of drafts) {
    if (d.skipped) continue // skipped rows drop out of the review list
    const key = d.dateISO.slice(0, 10)
    const arr = buckets.get(key) ?? []
    arr.push(d)
    buckets.set(key, arr)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, items]) => ({
      day,
      dateLabel: shortDate(new Date(day + 'T12:00:00.000Z')),
      items,
    }))
}

export function CsvImportList({ drafts, onEdit, onConfirm }: Props) {
  const { formatMoney } = useApp()
  const groups = groupDraftsByDay(drafts)
  const toAdd = checkedDrafts(drafts)

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <section key={group.day}>
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                padding: '16px 20px 6px',
                background: 'var(--bg)',
                fontSize: '13px',
                fontWeight: 400,
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                color: 'var(--text-2)',
              }}
            >
              {group.dateLabel}
            </div>
            {group.items.map((draft) => (
              <DraftRow key={draft.id} draft={draft} onEdit={onEdit} formatMoney={formatMoney} />
            ))}
          </section>
        ))}
      </div>

      {toAdd.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--hairline)', flexShrink: 0 }}>
          <button
            onClick={onConfirm}
            style={{
              width: '100%',
              height: '48px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '999px',
              fontSize: '15px',
              fontWeight: 400,
              cursor: 'pointer',
            }}
          >
            Add {toAdd.length} transaction{toAdd.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  )
}

function DraftRow({
  draft,
  onEdit,
  formatMoney,
}: {
  draft: CsvDraftRow
  onEdit: (id: string) => void
  formatMoney: (cents: number) => string
}) {
  const isPayment = draft.isPaymentRow
  const isDuplicate = draft.duplicateOf !== null && !draft.checked
  const meta = categoryMeta(draft.category)

  const subtitle = isPayment ? "Payment — won't be added" : meta.label

  const className = [
    'cv-row',
    isPayment ? 'payment-row' : 'ortho-interactive',
    isDuplicate ? 'duplicate' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleClick = () => {
    if (!isPayment) onEdit(draft.id)
  }

  return (
    <div
      role={isPayment ? undefined : 'button'}
      data-testid={`csv-row-${draft.id}`}
      className={className}
      onClick={handleClick}
      tabIndex={isPayment ? undefined : 0}
      onKeyDown={(e) => {
        if (!isPayment && (e.key === 'Enter' || e.key === ' ')) onEdit(draft.id)
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 20px',
        borderBottom: '0.5px solid var(--hairline)',
        cursor: isPayment ? 'default' : 'pointer',
        opacity: isPayment ? 0.45 : 1,
        // Highlight likely duplicates with a calm sand wash + left accent bar —
        // they're excluded by default, so they need to catch the eye for review.
        background: isDuplicate ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : undefined,
        boxShadow: isDuplicate ? 'inset 3px 0 0 0 var(--accent)' : undefined,
      }}
    >
      <CatTile category={draft.category} size={38} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '15px',
            color: 'var(--text)',
            letterSpacing: '-0.1px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {draft.merchant}
        </div>
        {isDuplicate ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 4,
              padding: '1px 8px 1px 6px',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
              color: 'var(--accent)',
              fontSize: 11.5,
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            <Copy size={11} strokeWidth={2.2} />
            Possible duplicate
          </span>
        ) : (
          <div
            style={{
              marginTop: '2px',
              fontSize: '13px',
              color: 'var(--text-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      <span
        style={{
          fontSize: '15px',
          color: 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.2px',
          whiteSpace: 'nowrap',
        }}
      >
        {formatMoney(draft.amountCents)}
      </span>
      {!isPayment && <ChevronRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
    </div>
  )
}
