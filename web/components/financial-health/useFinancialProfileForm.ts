'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { parseMoney } from '@/components/inputs'
import { toDisplayAmount } from '@/lib/finance/money'
import { contributionsByGoal } from '@/lib/finance/goals'
import { scoreFinancialHealth, deriveProfile } from '@/lib/finance/financialHealth'
import { FINANCIAL_HEALTH_THRESHOLDS as T } from '@/lib/finance/financial-health-thresholds'
import type {
  EmergencyFundLevel,
  FixedCostKind,
  HealthDimension,
  HousingType,
} from '@/lib/types'

export interface CostDraft {
  label: string
  amountRaw: string
  kind: FixedCostKind
}

export interface ProfileDraft {
  incomeRaw: string
  incomeVariable: boolean
  lowEstimateRaw: string
  housingType: HousingType
  housingCostRaw: string
  shared: boolean
  sharePct: string
  savingsPct: number // 0..30 in steps of 5
  emergency: EmergencyFundLevel
  costs: CostDraft[]
  weights: Record<HealthDimension, number>
}

const DEFAULT_WEIGHTS = (): Record<HealthDimension, number> =>
  Object.fromEntries(T.DIMENSION_ORDER.map((d) => [d, T.DEFAULT_WEIGHT])) as Record<HealthDimension, number>

/** Neutral defaults written when the user skips the questionnaire (FR-012). */
export function neutralDraft(): ProfileDraft {
  return {
    incomeRaw: '',
    incomeVariable: false,
    lowEstimateRaw: '',
    housingType: 'rent',
    housingCostRaw: '',
    shared: false,
    sharePct: '',
    savingsPct: 10,
    emergency: 'none',
    costs: [],
    weights: DEFAULT_WEIGHTS(),
  }
}

/**
 * Draft state + save orchestration for the Financial Health questionnaire, shared
 * by the first-run flow and the Settings edit page. Initializes from the stored
 * profile (edit mode) or neutral defaults (first run). `submit()` derives the live
 * score, then persists profile + fixed costs + weights + a fresh baseline snapshot
 * via the store's `saveFinancialHealth` (FR-009, FR-010).
 */
export function useFinancialProfileForm() {
  const {
    currency,
    rate,
    userFinancialProfile,
    userFixedCosts,
    userDimensionWeights,
    transactions,
    budgets,
    goals,
    goalContributions,
    saveFinancialHealth,
  } = useApp()

  const r = rate(currency)
  const toRaw = (cents: number | null | undefined): string =>
    cents == null ? '' : String(toDisplayAmount(cents, currency, r))

  const initial = useMemo<ProfileDraft>(() => {
    const p = userFinancialProfile
    if (!p) return neutralDraft()
    const weights = DEFAULT_WEIGHTS()
    for (const w of userDimensionWeights) weights[w.dimension] = w.weight
    return {
      incomeRaw: toRaw(p.monthly_income_cents),
      incomeVariable: p.income_is_variable,
      lowEstimateRaw: toRaw(p.income_low_estimate_cents),
      housingType: p.housing_type,
      housingCostRaw: toRaw(p.housing_cost_cents),
      shared: p.housing_share_fraction < 1,
      sharePct: p.housing_share_fraction < 1 ? String(Math.round(p.housing_share_fraction * 100)) : '',
      savingsPct: Math.round(p.savings_target_fraction * 100),
      emergency: p.emergency_fund_level,
      costs: userFixedCosts.map((c) => ({ label: c.label, amountRaw: toRaw(c.amount_cents), kind: c.kind })),
      weights,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFinancialProfile, userFixedCosts, userDimensionWeights])

  const [draft, setDraft] = useState<ProfileDraft>(initial)
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...p }))

  const money = (raw: string): number | null => parseMoney(raw, currency, r)

  /** Income must be a positive amount before the flow can complete (FR-001). */
  const incomeValid = (money(draft.incomeRaw) ?? 0) > 0

  function toPersistable(d: ProfileDraft) {
    const income = money(d.incomeRaw) ?? 0
    const low = d.incomeVariable ? money(d.lowEstimateRaw) : null
    const housingCost = d.housingType === 'rent' || d.housingType === 'own' ? money(d.housingCostRaw) : null
    // Number.isFinite (not `|| 100`) so an explicit 0% share isn't read as 100%.
    const sharePctNum = parseFloat(d.sharePct)
    const shareFraction = d.shared
      ? Math.min(1, Math.max(0.01, (Number.isFinite(sharePctNum) ? sharePctNum : 100) / 100))
      : 1
    const profile = {
      monthly_income_cents: income,
      income_is_variable: d.incomeVariable,
      income_low_estimate_cents: low,
      housing_type: d.housingType,
      housing_cost_cents: housingCost,
      housing_share_fraction: shareFraction,
      savings_target_fraction: d.savingsPct / 100,
      emergency_fund_level: d.emergency,
    }
    const costs = d.costs
      .map((c) => ({ label: c.label.trim(), amount_cents: money(c.amountRaw) ?? 0, kind: c.kind }))
      .filter((c) => c.label.length > 0 && c.amount_cents > 0)
    const weights = T.DIMENSION_ORDER.map((dim) => ({ dimension: dim, weight: d.weights[dim] ?? T.DEFAULT_WEIGHT }))
    return { profile, costs, weights }
  }

  /** Persist the given draft (defaults to the current one) and its baseline snapshot. */
  async function submit(d: ProfileDraft = draft) {
    setSaving(true)
    const { profile, costs, weights } = toPersistable(d)
    // Derive the live score for the baseline snapshot.
    const derived = deriveProfile(
      { id: '', user_id: '', created_at: '', updated_at: '', ...profile },
      costs.map((c, i) => ({ id: String(i), user_id: '', created_at: '', ...c }))
    )
    const result = scoreFinancialHealth({
      profile: derived,
      transactions,
      budgets,
      goals,
      contributionsByGoal: contributionsByGoal(goalContributions),
      weights: Object.fromEntries(weights.map((w) => [w.dimension, w.weight])),
      now: new Date(),
    })
    await saveFinancialHealth({ profile, costs, weights, score: result.score, band: result.band })
    setSaving(false)
  }

  return { draft, setDraft, patch, saving, incomeValid, submit, isEditing: userFinancialProfile != null }
}
