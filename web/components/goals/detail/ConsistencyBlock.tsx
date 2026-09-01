'use client'

import { useApp } from '@/lib/store'
import type { GoalProjection } from '@/lib/finance/goalProjection'
import { DetailBlock, BlockValueStrong, MonthStrip, BlockReading } from './DetailBlock'
import { shortMonth } from './PaceAgainstPlanBlock'

/**
 * Block 4 — consistency (spec 059 US4). One cell per month of the item's life:
 * filled when on plan, dimmed when under, outlined and empty when missed.
 *
 * A missed month is read by ABSENCE and a dashed outline — never by a warning
 * colour (FR-032). That is the whole design of this block: it shows a gap
 * without telling anyone off for it.
 */
export function ConsistencyBlock({ projection }: { projection: GoalProjection }) {
  const { t, locale } = useApp()

  if (projection.months.length === 0) return null

  const missedCount = projection.missedMonthKeys.length

  return (
    <DetailBlock
      label={t('Consistency')}
      testId="consistency"
      value={
        missedCount > 0 ? (
          <>
            <BlockValueStrong>{t('{0}-month', projection.streakMonths)}</BlockValueStrong>{' '}
            {t('streak')} ·{' '}
            {missedCount === 1 ? t('1 missed') : t('{0} missed', missedCount)}
          </>
        ) : (
          <>
            <BlockValueStrong>{t('{0}-month', projection.streakMonths)}</BlockValueStrong> {t('streak')}
          </>
        )
      }
    >
      <div className="flex gap-[7px]">
        {projection.months.map((m) => (
          <div
            key={m.monthKey}
            data-testid="consistency-cell"
            className="h-[34px] flex-1 rounded-md"
            style={
              m.status === 'missed'
                ? {
                    background: 'transparent',
                    border: '0.5px dashed color-mix(in srgb, var(--text) 22%, transparent)',
                    opacity: 1,
                  }
                : {
                    background: 'var(--positive)',
                    opacity: m.status === 'under' ? 0.4 : 0.75,
                  }
            }
          />
        ))}
      </div>

      <MonthStrip labels={projection.months.map((m) => shortMonth(m.monthKey, locale))} />

      <BlockReading testId="consistency-reading" muted>
        {consistencySentence(projection, locale, t)}
      </BlockReading>
    </DetailBlock>
  )
}

function consistencySentence(
  projection: GoalProjection,
  locale: string,
  t: (k: string, ...a: Array<string | number>) => string
): string {
  const missed = projection.missedMonthKeys.map((k) => shortMonth(k, locale))
  const under = projection.months.filter((m) => m.status === 'under').map((m) => shortMonth(m.monthKey, locale))

  if (missed.length === 0 && under.length === 0) {
    return t('No missed months since this started.')
  }
  if (missed.length > 0 && under.length > 0) {
    return t('Missed {0} · under plan in {1}.', list(missed, t), list(under, t))
  }
  if (missed.length > 0) return t('Missed {0}.', list(missed, t))
  return t('Under plan in {0}.', list(under, t))
}

/** "March and July" / "March, May and July" — a plain list, no Oxford comma
 *  gymnastics, translated through the same `t` as everything else. */
function list(items: string[], t: (k: string, ...a: Array<string | number>) => string): string {
  if (items.length === 1) return items[0]
  if (items.length === 2) return t('{0} and {1}', items[0], items[1])
  return t('{0} and {1}', items.slice(0, -1).join(', '), items[items.length - 1])
}
