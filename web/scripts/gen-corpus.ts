// Regenerate the committed coverage-corpus snapshot manifest (spec 026).
// Run intentionally (`npm run gen:corpus`) when a generator change is meant to
// alter the corpus; review the resulting diff in
// test/corpus/__snapshots__/corpus.snapshot.json.

import { generateCorpus } from '../test/corpus/generate'
import { writeSnapshot, DEFAULT_SNAPSHOT, corpusManifest } from '../test/corpus/serialize'

const corpus = generateCorpus()
writeSnapshot(corpus)

const m = corpusManifest(corpus)
const totalTx = m.totals.transactions ?? 0
const totalShares = m.totals.transaction_shares ?? 0
console.log(
  `Wrote snapshot for ${m.scenarioCount} scenarios ` +
    `(${totalTx} transactions, ${totalShares} shares) → ${DEFAULT_SNAPSHOT}`
)
