import { type ComponentType } from 'react'
import { SpendingPaceBody } from '@/components/widgets/bodies/SpendingPaceBody'
import { SpendingPacePanel } from '@/components/widgets/panels/SpendingPacePanel'
import { BudgetsBody } from '@/components/widgets/bodies/BudgetsBody'
import { BudgetsPanel } from '@/components/widgets/panels/BudgetsPanel'
import { GoalsBody } from '@/components/widgets/bodies/GoalsBody'
import { TopMerchantsBody } from '@/components/widgets/bodies/TopMerchantsBody'
import { TopMerchantsPanel } from '@/components/widgets/panels/TopMerchantsPanel'
import { HouseholdBalancesBody } from '@/components/widgets/bodies/HouseholdBalancesBody'
import { ActivityBody } from '@/components/widgets/bodies/ActivityBody'
import { ActivityPanel } from '@/components/widgets/panels/ActivityPanel'
import { SavingsTrendsBody } from '@/components/widgets/bodies/SavingsTrendsBody'
import { SavingsTrendsPanel } from '@/components/widgets/panels/SavingsTrendsPanel'
import { HousingCostsBody } from '@/components/widgets/bodies/HousingCostsBody'
import { HousingCostsPanel } from '@/components/widgets/panels/HousingCostsPanel'
import { HomeEquityBody } from '@/components/widgets/bodies/HomeEquityBody'
import { HomeEquityPanel } from '@/components/widgets/panels/HomeEquityPanel'
import { FinancialHealthBody } from '@/components/widgets/bodies/FinancialHealthBody'
import {
  DownloadDataBody,
  WidgetSettingsBody,
  ChangeCurrencyBody,
  ChangeLanguageBody,
} from '@/components/widgets/bodies/settingsShortcuts'

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
  /**
   * Optional propless detail panel (spec 057, D1). A bare `ComponentType`
   * mirroring `Body` for the same reason `Body` takes no props: a `PanelConfig`
   * union expressive enough for all nine panels' shapes would put every widget's
   * requirements into one type. Absent ⇒ the existing "Details coming soon."
   * placeholder (FR-003) — this is what lets panels ship a few at a time.
   * Renders inside the shared `WidgetPanel` frame; reads scope directly via
   * `useDashboardScopeContext()` / `useScopedTransactions()`, never via props.
   */
  Panel?: ComponentType
  /** Optional route (spec 039). When set, the widget's card is a link to this path
   *  and clicking it navigates instead of opening the details drawer. A widget
   *  with `href` set never renders a `Panel`, even if one is declared (FR-006). */
  href?: string
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
    id: 'financial-health',
    title: 'Financial health',
    description: 'Your baseline financial-health score and next step.',
    defaultEnabled: true,
    Body: FinancialHealthBody,
  },
  {
    id: 'savings-trends',
    title: 'Savings trends',
    description: 'Your savings rate over recent months.',
    defaultEnabled: true,
    Body: SavingsTrendsBody,
    Panel: SavingsTrendsPanel,
  },
  {
    id: 'spending-pace',
    title: 'Spending pace',
    description: 'How your spending is tracking against the month.',
    defaultEnabled: true,
    Body: SpendingPaceBody,
    Panel: SpendingPacePanel,
  },
  {
    id: 'budgets',
    title: 'Budgets',
    description: 'Category budgets and what is left in each.',
    defaultEnabled: true,
    Body: BudgetsBody,
    Panel: BudgetsPanel,
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
    Panel: TopMerchantsPanel,
  },
  // spec 053 — who owes whom, for three or more people. Default-off like every other
  // additive widget since spec 034; a solo household sees a calm prompt instead.
  {
    id: 'household-balances',
    title: 'Who owes whom',
    description: 'Outstanding balances between the people in your household.',
    defaultEnabled: false,
    Body: HouseholdBalancesBody,
  },
  {
    id: 'activity',
    title: 'Recent activity',
    description: 'Your latest transactions across the household.',
    defaultEnabled: false,
    Body: ActivityBody,
    Panel: ActivityPanel,
  },
  {
    id: 'housing-costs',
    title: 'Housing costs',
    description: 'Your total monthly housing cost across all properties.',
    defaultEnabled: false,
    Body: HousingCostsBody,
    Panel: HousingCostsPanel,
  },
  {
    id: 'home-equity',
    title: 'Home equity',
    description: "Principal you've paid down across all mortgages.",
    defaultEnabled: false,
    Body: HomeEquityBody,
    Panel: HomeEquityPanel,
  },
  // Navigation shortcuts (spec 039) — jump straight to a Settings page. Default-off.
  {
    id: 'download-data',
    title: 'Download your data',
    description: 'A shortcut to download or restore your household data.',
    defaultEnabled: false,
    Body: DownloadDataBody,
    href: '/settings/data',
  },
  {
    id: 'widget-settings',
    title: 'Widget settings',
    description: 'A shortcut to choose which widgets appear on your dashboard.',
    defaultEnabled: false,
    Body: WidgetSettingsBody,
    href: '/settings/widgets',
  },
  {
    id: 'change-currency',
    title: 'Change currency',
    description: 'A shortcut to change your display currency.',
    defaultEnabled: false,
    Body: ChangeCurrencyBody,
    href: '/settings/currency',
  },
  {
    id: 'change-language',
    title: 'Change language',
    description: 'A shortcut to change the app language.',
    defaultEnabled: false,
    Body: ChangeLanguageBody,
    href: '/settings/language',
  },
]

/** Look up a widget definition by id (undefined if unknown). */
export function getWidget(id: string): WidgetDefinition | undefined {
  return WIDGETS.find((w) => w.id === id)
}
