// Top-level corpus assembly (spec 026). `generateCorpus(seed)` is pure and
// deterministic; `toTables` flattens scenarios into Supabase-shaped table maps in
// a stable, referentially-consistent order for the seeder and the in-memory client.

import type { Corpus, CorpusTables, HouseholdScenario } from './model'
import { buildAllScenarios } from './scenarios'

/** Bumped intentionally when the corpus SHAPE changes (drives snapshot review). */
const CORPUS_VERSION = 1

/** The default seed — a fixed constant so `generateCorpus()` is reproducible. */
export const DEFAULT_SEED = 0x02026

export function generateCorpus(seed: number = DEFAULT_SEED): Corpus {
  const scenarios = buildAllScenarios(seed)
  return {
    seed,
    meta: {
      version: CORPUS_VERSION,
      generatedFromSeed: seed,
      scenarioCount: scenarios.length,
    },
    scenarios,
  }
}

export function toTables(corpus: Corpus): CorpusTables {
  const t: CorpusTables = {
    users: [],
    households: [],
    household_people: [],
    household_members: [],
    cards: [],
    transactions: [],
    transaction_shares: [],
    properties: [],
    mortgage_info: [],
    lease_info: [],
    units: [],
    rental_payments: [],
    budgets: [],
  }
  const pushScenario = (s: HouseholdScenario): void => {
    t.users.push(...s.users)
    t.households.push(s.household)
    t.household_people.push(...s.people)
    t.household_members.push(...s.members)
    t.cards.push(...s.cards)
    for (const gp of s.properties) {
      // gp.property is the base row (buildProperty never sets the nested
      // mortgage/lease/units the app-side Property type allows), so it can be
      // pushed as-is; the housing rows go to their own tables below.
      t.properties.push(gp.property)
      if (gp.mortgage) t.mortgage_info.push(gp.mortgage)
      if (gp.lease) t.lease_info.push(gp.lease)
      t.units.push(...gp.units)
      t.rental_payments.push(...gp.rentalPayments)
    }
    for (const gt of s.transactions) {
      t.transactions.push(gt.transaction)
      t.transaction_shares.push(...gt.shares)
    }
    t.budgets.push(...s.budgets)
  }
  for (const s of corpus.scenarios) pushScenario(s)
  return t
}
