'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Pencil, Trash2 } from 'lucide-react'
import { useApp } from '@/lib/store'
import { mediumDate, parseLocalDate } from '@/lib/format'
import type { GoalContribution } from '@/lib/types'

/**
 * The contribution list (spec 059 US3). Used twice: capped at 12 behind a card's
 * disclosure on the Savings & Debts section, and uncapped as the detail page's
 * fifth block.
 *
 * Editing in place is the point. Once the card stops showing three rows on its
 * front, correcting a wrong amount must not become a page navigation — so the
 * per-row actions live here rather than only on the detail page.
 *
 * A total row closes the list so the ledger visibly reconciles against the
 * headline number above it.
 *
 * The row actions are drawn at the handoff's 26×34px but carry a 44×44px
 * invisible `::after` hit area, so the compact layout does not cost the
 * constitution's touch-target minimum.
 */
export function ContributionLedger({
  contributions,
  onEdit,
  onDelete,
  maxRows,
  seeAllHref,
}: {
  contributions: GoalContribution[]
  onEdit?: (c: GoalContribution) => void
  onDelete?: (c: GoalContribution) => void
  /** Cap the visible rows. Undefined shows every one. */
  maxRows?: number
  /** Where "See all in detail" points, when the list is capped and overflowing. */
  seeAllHref?: string
}) {
  const { formatMoney, t, locale } = useApp()

  // Newest first, with `created_at` as a stable tie-break so two contributions
  // on the same day keep a deterministic order.
  const sorted = useMemo(
    () =>
      [...contributions].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
      }),
    [contributions]
  )

  const total = useMemo(() => sorted.reduce((s, c) => s + c.amount_cents, 0), [sorted])
  const rows = maxRows != null ? sorted.slice(0, maxRows) : sorted
  const overflowing = sorted.length > rows.length

  if (sorted.length === 0) {
    return <p className="pt-2.5 text-[13px] text-text-3">{t('No contributions yet')}</p>
  }

  return (
    <div className="mt-3 border-t pt-2.5" style={{ borderColor: 'var(--hairline)' }}>
      <ul>
        {rows.map((c) => (
          <li
            key={c.id}
            data-testid="ledger-row"
            className="grid h-[34px] items-center gap-2 border-b text-[13.5px] tabular-nums text-text-2 last:border-b-0"
            style={{
              gridTemplateColumns: '1fr auto 26px 26px',
              // Lighter than the card hairline — this is a nested list.
              borderColor: 'color-mix(in srgb, var(--text) 4%, transparent)',
            }}
          >
            <span className="min-w-0 truncate">
              {mediumDate(parseLocalDate(c.date), locale)}
              {c.note ? <span className="text-text-3"> · {c.note}</span> : null}
            </span>
            <span className="shrink-0 text-right text-text">{formatMoney(c.amount_cents)}</span>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(c)}
                aria-label={t('Edit contribution')}
                className="ortho-interactive relative flex h-full items-center justify-center rounded text-text-3 after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <Pencil size={12} />
              </button>
            ) : (
              <span />
            )}
            {onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(c)}
                aria-label={t('Delete contribution')}
                className="ortho-interactive relative flex h-full items-center justify-center rounded text-text-3 after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <Trash2 size={12} />
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>

      {overflowing && seeAllHref ? (
        <Link href={seeAllHref} className="mt-2.5 inline-block text-[13px] text-accent">
          {t('See all in detail')}
        </Link>
      ) : null}

      <div
        data-testid="ledger-total"
        className="mt-0.5 grid h-10 items-center gap-2 border-t text-[13.5px] tabular-nums text-text"
        style={{ gridTemplateColumns: '1fr auto 26px 26px', borderColor: 'var(--hairline)' }}
      >
        <span>{t('Total contributed')}</span>
        <span className="text-right font-semibold">{formatMoney(total)}</span>
        <span />
        <span />
      </div>
    </div>
  )
}
