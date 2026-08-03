import { type ComponentType } from 'react'
import { NetSummaryBody } from '@/components/widgets/bodies/NetSummaryBody'
import { SpendingPaceBody } from '@/components/widgets/bodies/SpendingPaceBody'
import { BudgetsBody } from '@/components/widgets/bodies/BudgetsBody'
import { GoalsBody } from '@/components/widgets/bodies/GoalsBody'
import { TopMerchantsBody } from '@/components/widgets/bodies/TopMerchantsBody'
import { ActivityBody } from '@/components/widgets/bodies/ActivityBody'

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
 * The shipped widgets. Declaration order is the board order (deterministic), and
 * the set spans every `WidgetSize` so packing is genuinely exercised.
 *
 * Ordering/default rationale (keeps the board interior-gap-free): a full-width
 * `wide` widget is declared FIRST so, when enabled, it forms a leading full-row
 * strip that can never leave a hole beside it. The remaining default-enabled
 * widgets are sized to tile the 4-track desktop grid — lg (2×2) + md + md fill
 * the first two rows, then sm + sm — so `grid-auto-flow: dense` leaves no cell
 * between widgets (only a possible trailing partial row, which reads as the board
 * simply ending). `activity` (wide) ships default-off so the first-run board is a
 * clean tile; turning it on adds the leading strip without introducing a gap.
 */
export const WIDGETS: readonly WidgetDefinition[] = [
  {
    id: 'activity',
    title: 'Recent activity',
    description: 'Your latest transactions across the household.',
    size: 'wide',
    defaultEnabled: false,
    Body: ActivityBody,
  },
  {
    id: 'net-summary',
    title: 'Net summary',
    description: 'Income minus spending for the month at a glance.',
    size: 'lg',
    defaultEnabled: true,
    Body: NetSummaryBody,
  },
  {
    id: 'spending-pace',
    title: 'Spending pace',
    description: 'How your spending is tracking against the month.',
    size: 'md',
    defaultEnabled: true,
    Body: SpendingPaceBody,
  },
  {
    id: 'budgets',
    title: 'Budgets',
    description: 'Category budgets and what is left in each.',
    size: 'md',
    defaultEnabled: true,
    Body: BudgetsBody,
  },
  {
    id: 'goals',
    title: 'Goals',
    description: 'Progress toward your savings goals.',
    size: 'sm',
    defaultEnabled: true,
    Body: GoalsBody,
  },
  {
    id: 'top-merchants',
    title: 'Top merchants',
    description: 'Where you spend the most, most often.',
    size: 'sm',
    defaultEnabled: true,
    Body: TopMerchantsBody,
  },
]

/** Look up a widget definition by id (undefined if unknown). */
export function getWidget(id: string): WidgetDefinition | undefined {
  return WIDGETS.find((w) => w.id === id)
}
