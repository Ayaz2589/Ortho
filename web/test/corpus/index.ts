// Public API for the coverage corpus (spec 026). See contracts/generator-api.md.
// Pure module tree — imported by the vitest suite AND scripts/{gen,seed}-corpus.ts,
// and deliberately NOT reachable from the app bundle (research D6).

export { mulberry32, type Prng } from './prng'
export {
  EPOCH,
  daysInMonth,
  isoAt,
  firstOfMonth,
  lastOfMonth,
  nonNoonUtc,
  addMonths,
} from './clock'
export {
  type Dimension,
  DIMENSIONS,
  coverageOf,
  missingDimensions,
} from './coverage'
export {
  stableStringify,
  serializeCorpus,
  corpusManifest,
  serializeManifest,
  writeSnapshot,
  readSnapshot,
  DEFAULT_SNAPSHOT,
  type CorpusManifest,
  type ScenarioManifest,
} from './serialize'
export type {
  Corpus,
  CorpusMeta,
  CorpusTables,
  HouseholdScenario,
  HouseholdMember,
  GeneratedTransaction,
  GeneratedProperty,
  TxIntent,
} from './model'
export { generateCorpus, toTables } from './generate'
export { bySortOrder, byCanonical } from './ordering'
