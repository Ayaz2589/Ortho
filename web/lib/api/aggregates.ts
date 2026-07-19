import { createClient } from '@/lib/supabase/client'
import type { TransactionCategory } from '@/lib/types'

/**
 * Thin wrappers over the Postgres aggregation RPCs
 * (`supabase/migrations/20260611120000_aggregates.sql`, at the monorepo root).
 * One SQL definition serves both web and iOS,
 * so the dashboard rollups are no longer duplicated per-client.
 *
 * The dashboard WIDGETS still compute these locally. spec 023 (D15): wiring the
 * RPCs into the widgets is a net performance LOSS — they'd add network round-trips
 * (refetched on every range/month change) to replace in-memory loops the client
 * already holds after loadAll(), and would break offline. That stays the stance;
 * do not wire the widgets for perf alone (only worthwhile PAIRED WITH loadAll()
 * windowing, a future feature, when the client no longer holds full history).
 *
 * WIRED SINCE spec 027 by the Reports surface — the first live consumer, via
 * lib/useReportsData.ts — which is the documented cut-over case, NOT a per-widget
 * cut-over: a *new* surface aggregating over a user-chosen window (up to 12 months,
 * fetched on demand only when Reports is open) the client does not already hold
 * pre-summarized. Reports uses fetchMonthSummary + fetchCategoryTotals only.
 *
 * Still unwired: fetchOwnerSpend, fetchDailyExpense. NOTE fetchOwnerSpend types its
 * rows as `person_id`, but the RPC returns a `user_id` column — a latent mismatch
 * to fix before it is wired (see PARITY.md). Cut-over map for the widgets, once
 * loadAll() windowing + the migration are live:
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
