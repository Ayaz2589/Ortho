'use client'

import { useApp } from '@/lib/store'
import { MoneyInput, TextInput } from '@/components/inputs'
import { FormGroup, FieldRow } from '@/components/ui'
import { Plus, X } from 'lucide-react'
import { FINANCIAL_HEALTH_THRESHOLDS as T } from '@/lib/finance/financial-health-thresholds'
import type { EmergencyFundLevel, FixedCostKind, HealthDimension, HousingType } from '@/lib/types'
import type { ProfileDraft } from './useFinancialProfileForm'

export const SECTION_TITLES = ['Income', 'Housing', 'Monthly commitments', 'Safety net', 'What matters to you']
export const SECTION_COUNT = SECTION_TITLES.length

const HOUSING: Array<{ value: HousingType; label: string }> = [
  { value: 'rent', label: 'Rent' },
  { value: 'own', label: 'Own' },
  { value: 'family', label: 'With family' },
  { value: 'none', label: 'No housing cost' },
]
const EMERGENCY: Array<{ value: EmergencyFundLevel; label: string }> = [
  { value: 'none', label: 'None yet' },
  { value: 'under_1m', label: 'Less than 1 month' },
  { value: '1_3m', label: '1–3 months' },
  { value: '3_6m', label: '3–6 months' },
  { value: '6m_plus', label: '6 months or more' },
]
const KINDS: Array<{ value: FixedCostKind; label: string }> = [
  { value: 'remittance', label: 'Family support / remittance' },
  { value: 'loan', label: 'Loan' },
  { value: 'phone', label: 'Phone' },
  { value: 'transit', label: 'Transit' },
  { value: 'childcare', label: 'Childcare' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'other', label: 'Other' },
]
const DIMENSION_LABEL: Record<HealthDimension, string> = {
  cash_flow: 'Cash flow',
  safety_net: 'Safety net',
  commitment_load: 'Commitment load',
  savings_momentum: 'Savings momentum',
  plan_engagement: 'Planning',
  routine_awareness: 'Routine awareness',
}

type Props = { draft: ProfileDraft; patch: (p: Partial<ProfileDraft>) => void }

function Toggle({ pressed, onToggle, label }: { pressed: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pressed}
      aria-label={label}
      onClick={onToggle}
      className="flex h-7 w-12 items-center rounded-full px-0.5 transition-colors"
      style={{ background: pressed ? 'var(--accent)' : 'var(--hairline)' }}
    >
      <span
        className="h-6 w-6 rounded-full transition-transform"
        style={{ background: 'var(--bg)', transform: pressed ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  )
}

function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: V; label: string }>
  value: V
  onChange: (v: V) => void
  ariaLabel: string
}) {
  const { t } = useApp()
  return (
    <div role="radiogroup" aria-label={t(ariaLabel)} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className="rounded-full px-3 py-1.5 text-[13px] transition-colors"
            style={{
              background: active ? 'var(--accent)' : 'var(--chip-bg)',
              color: active ? 'var(--bg)' : 'var(--text)',
            }}
          >
            {t(o.label)}
          </button>
        )
      })}
    </div>
  )
}

export function IncomeSection({ draft, patch }: Props) {
  const { t } = useApp()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-2">{t('We use this to understand how much room you have each month.')}</p>
      <FormGroup>
        <FieldRow label={t('Monthly take-home')}>
          <MoneyInput value={draft.incomeRaw} onChange={(v) => patch({ incomeRaw: v })} />
        </FieldRow>
        <FieldRow label={t('Income varies')}>
          <Toggle pressed={draft.incomeVariable} onToggle={() => patch({ incomeVariable: !draft.incomeVariable })} label={t('Income varies')} />
        </FieldRow>
        {draft.incomeVariable ? (
          <FieldRow label={t('On a slow month')}>
            <MoneyInput value={draft.lowEstimateRaw} onChange={(v) => patch({ lowEstimateRaw: v })} />
          </FieldRow>
        ) : null}
      </FormGroup>
    </div>
  )
}

export function HousingSection({ draft, patch }: Props) {
  const { t } = useApp()
  const hasCost = draft.housingType === 'rent' || draft.housingType === 'own'
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-2">{t('Housing is usually the biggest fixed cost.')}</p>
      <Segmented options={HOUSING} value={draft.housingType} onChange={(v) => patch({ housingType: v })} ariaLabel="Living situation" />
      {hasCost ? (
        <FormGroup>
          <FieldRow label={t('Monthly housing cost')}>
            <MoneyInput value={draft.housingCostRaw} onChange={(v) => patch({ housingCostRaw: v })} />
          </FieldRow>
          <FieldRow label={t('Split with others')}>
            <Toggle pressed={draft.shared} onToggle={() => patch({ shared: !draft.shared })} label={t('Split with others')} />
          </FieldRow>
          {draft.shared ? (
            <FieldRow label={t('Your share (%)')}>
              <TextInput
                inputMode="numeric"
                value={draft.sharePct}
                onChange={(e) => patch({ sharePct: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="50"
                className="w-16"
              />
            </FieldRow>
          ) : null}
        </FormGroup>
      ) : null}
    </div>
  )
}

export function CommitmentsSection({ draft, patch }: Props) {
  const { t } = useApp()
  const update = (i: number, p: Partial<ProfileDraft['costs'][number]>) =>
    patch({ costs: draft.costs.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  const add = () => patch({ costs: [...draft.costs, { label: '', amountRaw: '', kind: 'remittance' }] })
  const remove = (i: number) => patch({ costs: draft.costs.filter((_, j) => j !== i) })
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-2">
        {t('Loan payments, family support, subscriptions you can’t cancel — your baseline commitments.')}
      </p>
      {draft.costs.map((c, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-2xl p-3" style={{ background: 'var(--surface)' }}>
          <div className="flex items-center gap-2">
            <TextInput
              value={c.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder={t('Label')}
              className="flex-1 text-left"
            />
            <button type="button" aria-label={t('Remove')} onClick={() => remove(i)} className="shrink-0 p-1">
              <X size={16} style={{ color: 'var(--text-3)' }} />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <select
              aria-label={t('Kind')}
              value={c.kind}
              onChange={(e) => update(i, { kind: e.target.value as FixedCostKind })}
              className="rounded-lg bg-transparent text-[13px] text-text-2 outline-none"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {t(k.label)}
                </option>
              ))}
            </select>
            <MoneyInput value={c.amountRaw} onChange={(v) => update(i, { amountRaw: v })} />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[14px]"
        style={{ background: 'var(--chip-bg)', color: 'var(--text)' }}
      >
        <Plus size={16} /> {t('Add a commitment')}
      </button>
    </div>
  )
}

const SAVINGS_STEPS = [0, 5, 10, 15, 20, 25, 30]

export function SafetyNetSection({ draft, patch }: Props) {
  const { t } = useApp()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-2">{t('This helps us know how cautiously to score purchases.')}</p>
      <span className="text-[13px] text-text-2">{t('Emergency fund')}</span>
      <div role="radiogroup" aria-label={t('Emergency fund')} className="flex flex-col gap-2">
        {EMERGENCY.map((o) => {
          const active = o.value === draft.emergency
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => patch({ emergency: o.value })}
              className="flex items-center justify-between rounded-2xl px-4 py-3 text-left text-[15px] transition-colors"
              style={{
                background: active ? 'var(--accent)' : 'var(--surface)',
                color: active ? 'var(--bg)' : 'var(--text)',
              }}
            >
              {t(o.label)}
            </button>
          )
        })}
      </div>

      <span className="mt-1 text-[13px] text-text-2">{t('Monthly savings goal')}</span>
      <div role="radiogroup" aria-label={t('Monthly savings goal')} className="flex flex-wrap gap-2">
        {SAVINGS_STEPS.map((pct) => {
          const active = draft.savingsPct === pct
          return (
            <button
              key={pct}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${pct}%`}
              onClick={() => patch({ savingsPct: pct })}
              className="min-w-[52px] rounded-full px-3 py-1.5 text-[13px] tabular-nums transition-colors"
              style={{
                background: active ? 'var(--accent)' : 'var(--chip-bg)',
                color: active ? 'var(--bg)' : 'var(--text)',
              }}
            >
              {pct}%
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function WeightsSection({ draft, patch }: Props) {
  const { t } = useApp()
  const setWeight = (dim: HealthDimension, w: number) => patch({ weights: { ...draft.weights, [dim]: w } })
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-2">{t('How much does each area matter to you? This shapes your score.')}</p>
      <div className="flex flex-col gap-4">
        {T.DIMENSION_ORDER.map((dim) => (
          <div key={dim} className="flex flex-col gap-1.5">
            <span className="text-[14px] text-text">{t(DIMENSION_LABEL[dim])}</span>
            <div role="radiogroup" aria-label={t(DIMENSION_LABEL[dim])} className="flex gap-2">
              {[1, 2, 3, 4, 5].map((w) => {
                const active = (draft.weights[dim] ?? T.DEFAULT_WEIGHT) === w
                return (
                  <button
                    key={w}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={t('{0} out of 5', w)}
                    onClick={() => setWeight(dim, w)}
                    className="h-9 flex-1 rounded-lg text-[14px] tabular-nums transition-colors"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--chip-bg)',
                      color: active ? 'var(--bg)' : 'var(--text-2)',
                    }}
                  >
                    {w}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const SECTIONS = [IncomeSection, HousingSection, CommitmentsSection, SafetyNetSection, WeightsSection]

/** Render a single section by index (used by the first-run stepper). */
export function ProfileSection({ index, draft, patch }: { index: number } & Props) {
  const Section = SECTIONS[index]
  return <Section draft={draft} patch={patch} />
}

/** Render all sections stacked (used by the Settings edit page). */
export function FinancialProfileForm({ draft, patch }: Props) {
  const { t } = useApp()
  return (
    <div className="flex flex-col gap-8">
      {SECTIONS.map((Section, i) => (
        <section key={i} className="flex flex-col gap-3">
          <h2 className="text-[17px] font-normal text-text">{t(SECTION_TITLES[i])}</h2>
          <Section draft={draft} patch={patch} />
        </section>
      ))}
    </div>
  )
}
