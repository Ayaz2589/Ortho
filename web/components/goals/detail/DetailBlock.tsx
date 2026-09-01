'use client'

import type { ReactNode } from 'react'

/**
 * The shared frame for the goal detail page's blocks (spec 059 US4): an
 * uppercase label, a right-aligned value reading, and the block's content, each
 * separated from the last by a hairline rule.
 *
 * Extracted because five blocks share exactly this chrome and nothing else —
 * keeping the rhythm in one place is what stops the fifth block from drifting a
 * few pixels off the first.
 */
export function DetailBlock({
  label,
  value,
  testId,
  children,
}: {
  label: string
  /** The short reading beside the label, e.g. "**July 2028** · 23 months". */
  value?: ReactNode
  /** Suffix for the block's `data-testid` hooks. */
  testId?: string
  children: ReactNode
}) {
  return (
    <section className="mt-[26px] border-t pt-5" style={{ borderColor: 'var(--hairline)' }}>
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.8px] text-text-3">{label}</h2>
        {value ? (
          <span
            data-testid={testId ? `block-${testId}-value` : undefined}
            className="shrink-0 text-[13px] tabular-nums text-text-2"
          >
            {value}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/** The bold half of a block's value reading — a date or a count. */
export function BlockValueStrong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-text">{children}</strong>
}

/** The month strip that sits under the pace bars and the consistency cells. */
export function MonthStrip({ labels }: { labels: string[] }) {
  return (
    <div className="mt-2 flex gap-2.5">
      {labels.map((label, i) => (
        <span key={`${label}-${i}`} className="flex-1 text-center text-[11px] text-text-3">
          {label}
        </span>
      ))}
    </div>
  )
}

/** The one-sentence reading that closes a chart block. */
export function BlockReading({
  testId,
  muted,
  children,
}: {
  testId: string
  muted?: boolean
  children: ReactNode
}) {
  return (
    <p
      data-testid={testId}
      className="mt-2.5 text-[13px] tabular-nums"
      style={{ color: muted ? 'var(--text-3)' : 'var(--text-2)' }}
    >
      {children}
    </p>
  )
}
