'use client'
// Post-import summary: added count, spend total, skipped/excluded breakdown.
import { useApp } from '@/lib/store'

interface Props {
  addedCount: number
  totalSpendCents: number
  skippedCount: number
  excludedCount: number
  duplicatesCount: number
  onDone: () => void
}

export function CsvImportSummary({
  addedCount,
  totalSpendCents,
  skippedCount,
  excludedCount,
  duplicatesCount,
  onDone,
}: Props) {
  const { formatMoney } = useApp()

  return (
    <div
      style={{
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '32px', color: 'var(--positive)', fontWeight: 700 }}>✓</div>

      <div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>
          {addedCount} transaction{addedCount === 1 ? '' : 's'} added
        </div>
        <div style={{ fontSize: '18px', color: 'var(--text-2)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(totalSpendCents)}
        </div>
      </div>

      <div
        style={{
          borderTop: '0.5px solid var(--hairline)',
          paddingTop: '16px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {skippedCount > 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: '14px' }}>
            {skippedCount} skipped
          </div>
        )}
        {excludedCount > 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: '14px' }}>
            {excludedCount} payment rows excluded
          </div>
        )}
        {duplicatesCount > 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: '14px' }}>
            {duplicatesCount} duplicates left out
          </div>
        )}
      </div>

      <button
        onClick={onDone}
        style={{
          marginTop: '8px',
          padding: '12px 32px',
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '16px',
          cursor: 'pointer',
        }}
      >
        Done
      </button>
    </div>
  )
}
