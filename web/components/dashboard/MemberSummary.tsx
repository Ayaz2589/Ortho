'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useApp } from '@/lib/store'
import { useDashboardScopeContext } from '@/lib/widgets/DashboardScopeContext'
import { personSummary } from '@/lib/finance/personSummary'

/**
 * Dashboard individual-member view (spec 043 US2). A person selector (default
 * "Everyone") sitting below the household net hero; picking a member reveals a
 * quiet personal summary — their income, their SHARE of shared expenses, net
 * transfers (received − sent), and net — for the shared dashboard scope. Reuses
 * the pure `personSummary` (which reuses the golden-locked `effectiveShares`).
 * "Everyone" shows nothing; the household hero is separate and never changes.
 * Calm: a shortfall reads via sign/position — never red.
 */
export function MemberSummary() {
  const { transactions, householdMembers, formatMoney, t } = useApp()
  const { interval } = useDashboardScopeContext()
  const [personId, setPersonId] = useState<string | null>(null)

  const summary = useMemo(
    () => (personId ? personSummary(transactions, personId, interval.start, interval.end) : null),
    [personId, transactions, interval.start, interval.end]
  )
  const transfersNet = summary ? summary.transfersReceived - summary.transfersSent : 0

  return (
    <section aria-label={t('Member view')} className="mb-7">
      <div className="flex items-center gap-2">
        <label htmlFor="member-select" className="text-[13px] uppercase tracking-[0.6px] text-text-2">
          {t('Member')}
        </label>
        <select
          id="member-select"
          value={personId ?? ''}
          onChange={(e) => setPersonId(e.target.value || null)}
          className="ortho-interactive rounded-full px-3 py-1.5 text-[14px] text-text"
          style={{ background: 'var(--chip-bg)' }}
        >
          <option value="">{t('Everyone')}</option>
          {householdMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {summary ? (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <Figure label={t('Income')} value={formatMoney(summary.income)} testid="member-income" color="var(--positive)" />
          <Figure label={t('Expenses')} value={formatMoney(summary.expenses)} testid="member-expenses" color="var(--text)" />
          <Figure label={t('Transfers')} value={formatMoney(transfersNet)} testid="member-transfers" color="var(--text)" />
          <Figure
            label={t('Net')}
            value={formatMoney(summary.net)}
            testid="member-net"
            // Never red: a shortfall keeps the neutral text tint, a surplus the sage positive.
            color={summary.net >= 0 ? 'var(--positive)' : 'var(--text)'}
          />
        </div>
      ) : null}
    </section>
  )
}

function Figure({
  label,
  value,
  testid,
  color,
}: {
  label: string
  value: string
  testid: string
  color: CSSProperties['color']
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-2">{label}</span>
      <span data-testid={testid} className="text-[17px] tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  )
}
