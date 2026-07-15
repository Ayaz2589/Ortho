import { createClient } from '@/lib/supabase/client'
import type { TransactionCategory } from '@/lib/types'

/**
 * Thin wrappers over the Postgres aggregation RPCs
 * (`supabase/migrations/20260611120000_aggregates.sql`, at the monorepo root).
 * One SQL definition serves both web and iOS,
 * so the dashboard rollups are no longer duplicated per-client.
 *
 * ADDITIVE / not yet wired: the dashboard widgets still compute these locally so
 * the app keeps working before the migration is applied.
 *
 * spec 023 (D15): DELIBERATELY LEFT UNWIRED. Wiring these RPCs is a net
 * performance LOSS as things stand — they'd add network round-trips (refetched on
 * every range/month change) to replace in-memory loops the client already holds
 * after loadAll(), and would break offline. This module is kept (0 bundle cost —
 * tree-shaken while unreferenced) as the documented cut-over path, which only
 * becomes worthwhile PAIRED WITH loadAll() windowing (a future feature, when the
 * client no longer holds full history). Do not wire it for perf alone.
 *
 * Cut-over (per widget, once windowing + the migration are live):
 *   - PerOwnerBreakdownCard:  spentBy(...) per person  → fetchOwnerSpend()
 *   - SpendByCategoryCard:    category sums            → fetchCategoryTotals()
 *   - MonthSummaryCard:       income/expense/net       → fetchMonthSummary()
 *   - DailySpendTrendCard:    daily buckets            → fetchDailyExpense()
 *
 * These cover the whole household ledger (spec 007 removed personal/shared
 * scope). All values are USD cents; convert for display on the client.
 */

const iso = (d: Date) => d.toISOString()

export interface OwnerSpendRow {
  person_id: string
  cents: number
}
export async function fetchOwnerSpend(
  householdId: string,
  start: Date,
  end: Date
): Promise<OwnerSpendRow[]> {
  const { data, error } = await createClient().rpc('household_owner_spend', {
    p_household_id: householdId,
    p_start: iso(start),
    p_end: iso(end),
  })
  if (error) throw error
  return (data ?? []) as OwnerSpendRow[]
}

export interface CategoryTotalRow {
  category: TransactionCategory
  cents: number
}
export async function fetchCategoryTotals(
  householdId: string,
  start: Date,
  end: Date
): Promise<CategoryTotalRow[]> {
  const { data, error } = await createClient().rpc('household_category_totals', {
    p_household_id: householdId,
    p_start: iso(start),
    p_end: iso(end),
  })
  if (error) throw error
  return (data ?? []) as CategoryTotalRow[]
}

export interface MonthSummary {
  income: number
  expense: number
  net: number
}
export async function fetchMonthSummary(
  householdId: string,
  start: Date,
  end: Date
): Promise<MonthSummary> {
  const { data, error } = await createClient().rpc('household_month_summary', {
    p_household_id: householdId,
    p_start: iso(start),
    p_end: iso(end),
  })
  if (error) throw error
  const row = (data ?? [])[0] as MonthSummary | undefined
  return row ?? { income: 0, expense: 0, net: 0 }
}

export interface DailyExpenseRow {
  day: string
  cents: number
}
export async function fetchDailyExpense(
  householdId: string,
  start: Date,
  end: Date
): Promise<DailyExpenseRow[]> {
  const { data, error } = await createClient().rpc('household_daily_expense', {
    p_household_id: householdId,
    p_start: iso(start),
    p_end: iso(end),
  })
  if (error) throw error
  return (data ?? []) as DailyExpenseRow[]
}
