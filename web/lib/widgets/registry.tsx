import { type ComponentType } from 'react'
import {
  NetSummaryPlaceholder,
  SpendingPacePlaceholder,
  BudgetsPlaceholder,
  GoalsPlaceholder,
  TopMerchantsPlaceholder,
  ActivityPlaceholder,
} from '@/components/widgets/placeholders'

/**
 * Widget registry (spec 034 — foundation). The SINGLE source of truth for the
 * dashboard's widget board. A future widget author adds one entry here and the
 * widget automatically appears in Settings → Widgets (toggleable) and, when
 * enabled, on the board at its declared size — no board or settings code changes
 * required (FR-002, FR-008).
 *
 * This foundation ships calm PLACEHOLDER widgets (no live data); wiring real
 * household figures into individual widgets is future work layered on top.
 */

/** Cell footprint. Maps to grid spans in `globals.css` (`.ow-w-*`); on compact
 *  (phone) every size collapses to a single full-width column. */
export type WidgetSize = 'sm' | 'md' | 'lg' | 'wide'

export const WIDGET_SIZES: readonly WidgetSize[] = ['sm', 'md', 'lg', 'wide']

export interface WidgetDefinition {
  /** Stable, unique, kebab-case id. Persisted in preferences — never rename/reuse. */
  id: string
  /** Display name (English source key; translated via i18n). */
  title: string
  /** One-line description shown in the Settings toggle list. */
  description: string
  /** Cell footprint used by the board to size + pack the widget. */
  size: WidgetSize
  /** Enabled state for a member who has never toggled this widget. */
  defaultEnabled: boolean
  /** Calm placeholder body. No props in the foundation (no live data yet). */
  Body: ComponentType
}

/**
 * The shipped widgets. Declaration order is the board order (deterministic). The
 * set deliberately spans every `WidgetSize` so the packing logic is exercised.
 */
export const WIDGETS: readonly WidgetDefinition[] = [
  {
    id: 'net-summary',
    title: 'Net summary',
    description: 'Income minus spending for the month at a glance.',
    size: 'lg',
    defaultEnabled: true,
    Body: NetSummaryPlaceholder,
  },
  {
    id: 'spending-pace',
    title: 'Spending pace',
    description: 'How your spending is tracking against the month.',
    size: 'md',
    defaultEnabled: true,
    Body: SpendingPacePlaceholder,
  },
  {
    id: 'budgets',
    title: 'Budgets',
    description: 'Category budgets and what is left in each.',
    size: 'md',
    defaultEnabled: true,
    Body: BudgetsPlaceholder,
  },
  {
    id: 'goals',
    title: 'Goals',
    description: 'Progress toward your savings goals.',
    size: 'sm',
    defaultEnabled: true,
    Body: GoalsPlaceholder,
  },
  {
    id: 'top-merchants',
    title: 'Top merchants',
    description: 'Where you spend the most, most often.',
    size: 'sm',
    defaultEnabled: false,
    Body: TopMerchantsPlaceholder,
  },
  {
    id: 'activity',
    title: 'Recent activity',
    description: 'Your latest transactions across the household.',
    size: 'wide',
    defaultEnabled: true,
    Body: ActivityPlaceholder,
  },
]

/** Look up a widget definition by id (undefined if unknown). */
export function getWidget(id: string): WidgetDefinition | undefined {
  return WIDGETS.find((w) => w.id === id)
}
