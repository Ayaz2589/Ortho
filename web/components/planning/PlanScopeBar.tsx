'use client'

import { useApp } from '@/lib/store'
import { HOUSEHOLD_SCOPE, personScope, type MoneyScope } from '@/lib/scope/moneyScope'

/**
 * spec 051 — the PEOPLE axis, beside the month bar's TIME axis. "Everyone" or one person;
 * choosing a person re-computes every figure below from that person's share of shared
 * spending. Hidden entirely for a one-person household, where the two are the same thing.
 *
 * Deliberately a plain row of chips rather than a dropdown: a 2–4 person household fits, and
 * a visible roster makes "whose money am I looking at?" answerable at a glance instead of
 * requiring a tap to find out.
 */
export function PlanScopeBar({
  scope,
  onChange,
}: {
  scope: MoneyScope
  onChange: (scope: MoneyScope) => void
}) {
  const { householdMembers, t } = useApp()
  if (householdMembers.length < 2) return null

  const isEveryone = scope.kind === 'household'

  return (
    <div
      role="tablist"
      aria-label={t('Whose money')}
      className="mb-6 flex flex-wrap items-center gap-1.5"
    >
      <Chip active={isEveryone} label={t('Everyone')} onClick={() => onChange(HOUSEHOLD_SCOPE)} />
      {householdMembers.map((m) => (
        <Chip
          key={m.id}
          active={scope.kind === 'person' && scope.personId === m.id}
          label={m.name}
          onClick={() => onChange(personScope(m.id))}
        />
      ))}
    </div>
  )
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        active ? 'bg-[var(--surface)] text-text' : 'text-text-2 hover:bg-[var(--chip-bg)]'
      }`}
      style={active ? { boxShadow: '0 0 0 0.5px var(--hairline)' } : undefined}
    >
      {label}
    </button>
  )
}
