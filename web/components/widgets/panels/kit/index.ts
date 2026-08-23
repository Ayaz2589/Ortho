/**
 * The shared widget-panel primitives kit (spec 057, D10).
 *
 * Extracted from two panels built fully bespoke first (HomeEquityPanel,
 * BudgetsPanel) — deliberately dissimilar in shape, so what they turned out
 * to share has a real claim to being universal rather than coincidental — and
 * then proven a third time by ActivityPanel (US10) before any follow-up
 * depends on it.
 *
 * ── The rule, and it is not optional ─────────────────────────────────────
 * A follow-up panel (US4–US9, each its own sandbox) may ADD a primitive here
 * in a NEW file. It may NEVER modify an existing one.
 *
 * This kit is a hypothesis drawn from three panels; the remaining six will
 * want to stretch it, and six sandboxes mutating shared files concurrently
 * would recreate exactly the collision this kit — and the pre-carved i18n
 * regions beside it (D9) — exist to prevent. If two panels independently add
 * near-identical primitives, that duplication is CORRECT under this rule: it
 * gets consolidated in one pass after all six land, not negotiated across
 * live branches. See contracts/panel-contract.md X-1 and
 * contracts/follow-up-brief.md.
 *
 * If an existing primitive is genuinely wrong for your panel, don't edit it —
 * stop and raise it. A frame-level change made unilaterally in one sandbox
 * surprises every other branch in flight against it.
 */
export { PanelEmpty } from './PanelEmpty'
export { PanelSectionLabel } from './PanelSectionLabel'
export { PanelRow } from './PanelRow'
export { IncomeSplitBar } from './IncomeSplitBar'
export { ReconciledMonthCard } from './ReconciledMonthCard'

// RateByMonthChart is NOT re-exported here. It lives at
// components/widgets/charts/RateByMonthChart.tsx (not panels/kit/) and is
// reached only via next/dynamic from SavingsTrendsPanel — recharts must only
// ever be imported from a directory literally named `charts`
// (test/bundle/no-eager-recharts.test.ts). Barrel-exporting it from this
// eagerly-imported index would pull recharts back into the initial bundle.
