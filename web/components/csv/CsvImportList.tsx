'use client'
// Date-grouped ledger preview of parsed CSV rows before commit.
// Normal rows: tappable, will be added. Payment rows: dimmed, non-tappable.
// Duplicate rows: muted, excluded by default but tappable.
import { useApp } from '@/lib/store'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'
import { checkedDrafts } from '@/lib/csv/csvImportModels'
import { shortDate } from '@/lib/format'

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
    const key = d.dateISO.slice(0, 10)
    const arr = buckets.get(key) ?? []
    arr.push(d)
    buckets.set(key, arr)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, items]) => ({
      day,
      dateLabel: shortDate(new Date(day + 'T12:00:00.000Z')).toUpperCase(),
      items,
    }))
}

export function CsvImportList({ drafts, onEdit, onToggle, onConfirm }: Props) {
  const { formatMoney } = useApp()
  const groups = groupDraftsByDay(drafts)
  const toAdd = checkedDrafts(drafts)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <section key={group.day}>
            <div
              style={{
                padding: '8px 16px 4px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                color: 'var(--text-secondary)',
                borderBottom: '0.5px solid var(--hairline)',
              }}
            >
              {group.dateLabel}
            </div>
            {group.items.map((draft) => (
              <DraftRow
                key={draft.id}
                draft={draft}
                onEdit={onEdit}
                formatMoney={formatMoney}
              />
            ))}
          </section>
        ))}
      </div>

      {toAdd.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '0.5px solid var(--hairline)',
          }}
        >
          <button
            onClick={onConfirm}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--accent)',
              color: 'var(--background)',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
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

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '11px 16px',
    borderBottom: '0.5px solid var(--hairline)',
    cursor: isPayment ? 'default' : 'pointer',
    opacity: isPayment ? 0.4 : 1,
    background: 'transparent',
    gap: '8px',
  }

  const className = [isPayment ? 'payment-row' : '', isDuplicate ? 'duplicate muted opacity-60' : '']
    .filter(Boolean)
    .join(' ')

  const handleClick = () => {
    if (!isPayment) onEdit(draft.id)
  }

  return (
    <div
      role={isPayment ? undefined : 'button'}
      data-testid={`csv-row-${draft.id}`}
      style={rowStyle}
      className={className}
      onClick={handleClick}
      tabIndex={isPayment ? undefined : 0}
      onKeyDown={(e) => {
        if (!isPayment && (e.key === 'Enter' || e.key === ' ')) onEdit(draft.id)
      }}
    >
      {isDuplicate && (
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', minWidth: '12px' }}>~</span>
      )}
      <span style={{ flex: 1, fontSize: '15px', color: 'var(--text)' }}>{draft.merchant}</span>
      <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginRight: '8px' }}>
        {draft.category}
      </span>
      <span style={{ fontSize: '15px', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {formatMoney(draft.amountCents)}
      </span>
      {!isPayment && (
        <span style={{ color: 'var(--text-secondary)', fontSize: '16px', marginLeft: '4px' }}>›</span>
      )}
    </div>
  )
}
