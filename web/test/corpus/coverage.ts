// The coverage matrix (spec 026, FR-004). `DIMENSIONS` is the authoritative list
// the completeness test iterates: every entry MUST map to ≥ 1 scenario, or the
// suite fails. Adding a dimension here without a covering scenario is an
// intentional forcing function.

import type { Corpus } from './model'

export type Dimension =
  // household finance structure
  | 'household-joint'
  | 'household-separate'
  // split methods
  | 'split-even'
  | 'split-percent'
  | 'split-value'
  | 'leftover-cent'
  // display currencies (USD-cents storage; display lens)
  | 'currency-usd'
  | 'currency-eur'
  | 'currency-jpy'
  | 'currency-bdt'
  // month boundaries
  | 'month-boundary-first'
  | 'month-boundary-last'
  | 'month-feb-leap'
  | 'month-feb-nonleap'
  // amounts — a refund/credit (the DB forbids negative amount_cents via the
  // `amount_non_negative` check, so a return is modelled as a positive income credit)
  | 'refund-credit'
  // density
  | 'month-sparse'
  | 'month-dense'
  // housing
  | 'property-mortgage'
  | 'property-lease'
  | 'mortgage-paid-off'
  | 'multifamily-occupancy'
  // budgets
  | 'budget-under'
  | 'budget-near'
  | 'budget-over'
  // recurring
  | 'recurring-merchant'
  // defect-reproduction dimensions
  | 'order-mismatch' // A4: sort_order ≠ lexical id
  | 'tz-boundary-non-noon' // A2: boundary rows at non-noon UTC
  // ---- spec 030 additions: the previously-uncovered feature surfaces ----
  // goals (savings & debt-payoff)
  | 'goal-savings'
  | 'goal-debt-payoff'
  | 'goal-reached'
  | 'goal-off-track'
  | 'goal-past-due'
  | 'goal-undated'
  | 'goal-linked-category'
  | 'goal-linked-account'
  // budget bucket types beyond the default `fixed`
  | 'budget-flex'
  | 'budget-non-monthly'
  // tags & notes on transactions
  | 'transaction-tags'
  | 'transaction-notes'
  // entitlement gate-state coverage (by DB status present in the corpus)
  | 'entitlement-admin'
  | 'entitlement-trialing'
  | 'entitlement-active'
  | 'entitlement-grace'
  | 'entitlement-lapsed'
  // bank linking (connect scope)
  | 'bank-active'
  | 'bank-disconnected'
  | 'bank-plaid'
  | 'bank-simplefin'

export const DIMENSIONS: readonly Dimension[] = [
  'household-joint',
  'household-separate',
  'split-even',
  'split-percent',
  'split-value',
  'leftover-cent',
  'currency-usd',
  'currency-eur',
  'currency-jpy',
  'currency-bdt',
  'month-boundary-first',
  'month-boundary-last',
  'month-feb-leap',
  'month-feb-nonleap',
  'refund-credit',
  'month-sparse',
  'month-dense',
  'property-mortgage',
  'property-lease',
  'mortgage-paid-off',
  'multifamily-occupancy',
  'budget-under',
  'budget-near',
  'budget-over',
  'recurring-merchant',
  'order-mismatch',
  'tz-boundary-non-noon',
  // spec 030 additions
  'goal-savings',
  'goal-debt-payoff',
  'goal-reached',
  'goal-off-track',
  'goal-past-due',
  'goal-undated',
  'goal-linked-category',
  'goal-linked-account',
  'budget-flex',
  'budget-non-monthly',
  'transaction-tags',
  'transaction-notes',
  'entitlement-admin',
  'entitlement-trialing',
  'entitlement-active',
  'entitlement-grace',
  'entitlement-lapsed',
  'bank-active',
  'bank-disconnected',
  'bank-plaid',
  'bank-simplefin',
] as const

/** dimension → labels of scenarios covering it. A dimension mapping to [] is a
 *  coverage failure (SC-002). */
export function coverageOf(corpus: Corpus): Record<Dimension, string[]> {
  const out = Object.fromEntries(DIMENSIONS.map((d) => [d, [] as string[]])) as Record<
    Dimension,
    string[]
  >
  for (const s of corpus.scenarios) {
    for (const d of s.dimensions) out[d].push(s.label)
  }
  return out
}

/** Dimensions with no covering scenario (empty ⇒ full coverage). */
export function missingDimensions(corpus: Corpus): Dimension[] {
  const cov = coverageOf(corpus)
  return DIMENSIONS.filter((d) => cov[d].length === 0)
}
