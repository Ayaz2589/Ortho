import { type ComponentType } from 'react'
import { SpendingPaceBody } from '@/components/widgets/bodies/SpendingPaceBody'
import { BudgetsBody } from '@/components/widgets/bodies/BudgetsBody'
import { GoalsBody } from '@/components/widgets/bodies/GoalsBody'
import { TopMerchantsBody } from '@/components/widgets/bodies/TopMerchantsBody'
import { ActivityBody } from '@/components/widgets/bodies/ActivityBody'
import { SavingsTrendsBody } from '@/components/widgets/bodies/SavingsTrendsBody'

/**
 * Widget registry (spec 034 — foundation). The SINGLE source of truth for the
 * dashboard's widget board. A future widget author adds one entry here and the
 * widget automatically appears in Settings → Widgets (toggleable) and, when
 * enabled, on the board — no board or settings code changes required
 * (FR-002, FR-008).
 *
 * Every widget renders at the SAME height (spec 037): the board is a uniform CSS
 * grid, so there is no per-widget size/footprint — the declaration is just id +
 * copy + default + body.
 */

export interface WidgetDefinition {
  /** Stable, unique, kebab-case id. Persisted in preferences — never rename/reuse. */
  id: string
  /** Display name (English source key; translated via i18n). */
  title: string
  /** One-line description shown in the Settings toggle list. */
  description: string
  /** Enabled state for a member who has never toggled this widget. */
  defaultEnabled: boolean
  /** Propless body — reads data via `useApp()` + `useDashboardScopeContext()`. */
  Body: ComponentType
}

/**
 * The shipped widgets. Declaration order is the board order (deterministic). Every
 * widget is the same height on a uniform grid (spec 037), so there are no size
 * footprints to balance.
 *
 * Net summary is NOT here: it is baked into the overview as a prominent hero
 * (`components/dashboard/NetSummaryHero.tsx`), always shown, never toggleable.
 * `savings-trends` (spec 036) replaces the removed Reports mode — the savings rate
 * over recent months, computed locally like every other widget. `activity` ships
 * default-off so the first-run board stays a clean set of tiles.
 */
export const WIDGETS: readonly WidgetDefinition[] = [
  {
    id: 'savings-trends',
    title: 'Savings trends',
    description: 'Your savings rate over recent months.',
    defaultEnabled: true,
    Body: SavingsTrendsBody,
  },
  {
    id: 'spending-pace',
    title: 'Spending pace',
    description: 'How your spending is tracking against the month.',
    defaultEnabled: true,
    Body: SpendingPaceBody,
  },
  {
    id: 'budgets',
    title: 'Budgets',
    description: 'Category budgets and what is left in each.',
    defaultEnabled: true,
    Body: BudgetsBody,
  },
  {
    id: 'goals',
    title: 'Goals',
    description: 'Progress toward your savings goals.',
    defaultEnabled: true,
    Body: GoalsBody,
  },
  {
    id: 'top-merchants',
    title: 'Top merchants',
    description: 'Where you spend the most, most often.',
    defaultEnabled: true,
    Body: TopMerchantsBody,
  },
  {
    id: 'activity',
    title: 'Recent activity',
    description: 'Your latest transactions across the household.',
    defaultEnabled: false,
    Body: ActivityBody,
  },
]

/** Look up a widget definition by id (undefined if unknown). */
export function getWidget(id: string): WidgetDefinition | undefined {
  return WIDGETS.find((w) => w.id === id)
}
