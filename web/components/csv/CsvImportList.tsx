'use client'
// Date-grouped ledger preview of parsed CSV rows before commit, styled to match
// the app's Activity rows: category glyph tile · merchant + meta · amount.
// Normal rows: tappable, will be added. Payment rows: dimmed, non-tappable.
// Duplicate rows: muted, excluded by default but tappable to include.
import { ChevronRight, Copy, Pencil } from 'lucide-react'
import { useApp } from '@/lib/store'
import { categoryMeta } from '@/lib/categories'
import type { CsvDraftRow } from '@/lib/csv/csvImportModels'
import { checkedDrafts } from '@/lib/csv/csvImportModels'
import { shortDate } from '@/lib/format'
import { CatTile } from '@/components/web/kit'
import { NoSourceTag } from '@/components/ui'
import { OwnerPicker } from './OwnerPicker'
import type { User } from '@/lib/types'

interface Props {
  drafts: CsvDraftRow[]
  onEdit: (id: string) => void
  onToggle: (id: string) => void
  onConfirm: () => void
  /** Assign owners to a row inline (from the list), without opening the editor. */
  onSetOwners: (id: string, ownerIds: string[]) => void
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

export function CsvImportList({ drafts, onEdit, onConfirm, onSetOwners }: Props) {
  const app = useApp()
  const { formatMoney } = app
  // Owners only matter when the household has more than one person; a solo
  // household hides the picker (mirrors CsvRowEditModal's `showOwners`).
  const householdMembers: User[] = app.householdMembers ?? []
  const resolveUser = app.resolveUser
  const showOwners = householdMembers.length > 1
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
              <DraftRow
                key={draft.id}
                draft={draft}
                onEdit={onEdit}
                formatMoney={formatMoney}
                showOwners={showOwners}
                householdMembers={householdMembers}
                resolveUser={resolveUser}
                onSetOwners={onSetOwners}
              />
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
  showOwners,
  householdMembers,
  resolveUser,
  onSetOwners,
}: {
  draft: CsvDraftRow
  onEdit: (id: string) => void
  formatMoney: (cents: number) => string
  showOwners: boolean
  householdMembers: User[]
  resolveUser: (id: string) => User
  onSetOwners: (id: string, ownerIds: string[]) => void
}) {
  const isPayment = draft.isPaymentRow
  const isDuplicate = draft.duplicateOf !== null && !draft.checked
  const meta = categoryMeta(draft.category)
  // Payment rows are never imported, so they carry no owner. Everything else
  // gets a tappable owner avatar in the tile's corner (like the ledger row).
  const ownerControl = showOwners && !isPayment

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
      {ownerControl ? (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <CatTile category={draft.category} size={38} />
          <div style={{ position: 'absolute', bottom: -4, right: -4 }}>
            <OwnerPicker
              ownerIds={draft.ownerIds}
              members={householdMembers}
              resolveUser={resolveUser}
              onChange={(ids) => onSetOwners(draft.id, ids)}
            />
          </div>
        </div>
      ) : (
        <CatTile category={draft.category} size={38} />
      )}

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
          <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {draft.paymentSource === '' && <NoSourceTag />}
            {draft.edited && (
              <span
                data-testid={`csv-edited-${draft.id}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  flexShrink: 0,
                  padding: '1px 7px 1px 5px',
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  color: 'var(--accent)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                }}
              >
                <Pencil size={9.5} strokeWidth={2.2} />
                Edited
              </span>
            )}
            <span
              style={{
                minWidth: 0,
                fontSize: '13px',
                color: 'var(--text-3)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </span>
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
