// Canonical serialization + snapshot manifest for the coverage corpus (spec 026).
//
// Two artifacts:
//  - `serializeCorpus` — the full, byte-stable canonical string (key-sorted,
//    2-space, trailing newline). Used in-memory to prove determinism (SC-001).
//  - `serializeManifest` — a SMALL committed regression artifact: per-scenario
//    dimensions + row counts + a SHA-256 of the scenario's canonical form, plus
//    a whole-corpus hash. A generator change flips only the affected scenario's
//    hash, so the committed diff stays readable (unlike a multi-MB blob).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Corpus, HouseholdScenario } from './model'

/** Recursively sort object keys; arrays keep order. Makes output insensitive to
 *  key-insertion order so only a real value change moves the bytes. */
function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue)
  if (v && typeof v === 'object') {
    const src = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) out[k] = sortValue(src[k])
    return out
  }
  return v
}

/** Canonical, byte-stable JSON: key-sorted, 2-space indent, trailing newline. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2) + '\n'
}

export function serializeCorpus(corpus: Corpus): string {
  return stableStringify(corpus)
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function countRows(s: HouseholdScenario): Record<string, number> {
  const shares = s.transactions.reduce((n, t) => n + t.shares.length, 0)
  const transactionTags = s.transactions.reduce((n, t) => n + (t.transaction.tags?.length ?? 0), 0)
  return {
    users: s.users.length,
    people: s.people.length,
    members: s.members.length,
    cards: s.cards.length,
    transactions: s.transactions.length,
    transaction_shares: shares,
    properties: s.properties.length,
    mortgages: s.properties.filter((p) => p.mortgage).length,
    leases: s.properties.filter((p) => p.lease).length,
    units: s.properties.reduce((n, p) => n + p.units.length, 0),
    rental_payments: s.properties.reduce((n, p) => n + p.rentalPayments.length, 0),
    budgets: s.budgets.length,
    // spec 030 tables
    tags: s.tags?.length ?? 0,
    transaction_tags: transactionTags,
    goals: s.goals?.length ?? 0,
    goal_contributions: s.goalContributions?.length ?? 0,
    linked_institutions: s.linkedInstitutions?.length ?? 0,
    linked_accounts: s.linkedAccounts?.length ?? 0,
    entitlements: s.entitlements?.length ?? 0,
  }
}

export interface ScenarioManifest {
  label: string
  displayCurrency: string
  dimensions: string[]
  rows: Record<string, number>
  hash: string
}

export interface CorpusManifest {
  version: number
  seed: number
  scenarioCount: number
  totals: Record<string, number>
  corpusHash: string
  scenarios: ScenarioManifest[]
}

export function corpusManifest(corpus: Corpus): CorpusManifest {
  const totals: Record<string, number> = {}
  const scenarios: ScenarioManifest[] = corpus.scenarios.map((s) => {
    const rows = countRows(s)
    for (const [k, n] of Object.entries(rows)) totals[k] = (totals[k] ?? 0) + n
    return {
      label: s.label,
      displayCurrency: s.displayCurrency,
      dimensions: [...s.dimensions].sort(),
      rows,
      hash: sha256(stableStringify(s)),
    }
  })
  return {
    version: corpus.meta.version,
    seed: corpus.seed,
    scenarioCount: corpus.meta.scenarioCount,
    totals,
    corpusHash: sha256(serializeCorpus(corpus)),
    scenarios,
  }
}

/** The committed manifest string. */
export function serializeManifest(corpus: Corpus): string {
  return stableStringify(corpusManifest(corpus))
}

export const DEFAULT_SNAPSHOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '__snapshots__/corpus.snapshot.json'
)

export function writeSnapshot(corpus: Corpus, path: string = DEFAULT_SNAPSHOT): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, serializeManifest(corpus))
}

export function readSnapshot(path: string = DEFAULT_SNAPSHOT): string {
  return readFileSync(path, 'utf8')
}
