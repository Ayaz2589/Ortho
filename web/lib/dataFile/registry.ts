// spec 032 — the extensibility seam. Each data section (transactions, housing,
// and future ones: widgets/budgets/goals) is a self-contained DataSection that
// knows how to serialize itself to the envelope, read itself back, deduplicate
// against the current store, apply the additive writes, and render its visible
// PDF layer. Adding a section = one module + one register() call; the export and
// import pipelines never change.

import type { CurrencyKey } from '../finance/money'
import type { Language } from '../language'
import type { Person, Tag, Transaction, Property, RentalPayment, User } from '../types'
import type { Translate } from '../i18n'
import type { SectionPayload } from './envelope'

/** The narrow slice of the app store the data-file feature depends on. The real
 *  `useApp()` value satisfies this structurally; tests supply a minimal fake. */
export interface DataStore {
  // identity / read
  currentHousehold: { id: string; name: string } | null
  currentUserId: string
  currentPersonId: string
  people: Person[]
  transactions: Transaction[]
  properties: Property[]
  rentalPayments: RentalPayment[]
  tags: Tag[]
  // additive writes (never delete/overwrite in this feature)
  addTransaction: (tx: Transaction) => void
  addProperty: (p: Property) => void
  addRentalPayment: (p: RentalPayment) => void
  addTag: (name: string) => Tag
  // display helpers (visible layer only)
  resolveUser: (id: string) => User
}

/** Display context for `renderModel` — everything here affects the VISIBLE PDF
 *  only, never the canonical records in the envelope. */
export interface RenderCtx {
  t: Translate
  locale: string
  currency: CurrencyKey
  rate: (c: CurrencyKey) => number
  formatMoney: (cents: number, currency?: CurrencyKey, rate?: number, leadingPlus?: boolean, locale?: string) => string
  resolveUser: (id: string) => User
}

/** Pre-formatted table for one section's visible pages. Money cells are already
 *  currency-converted strings; the layout engine only positions them. */
export interface SectionRenderModel {
  title: string
  columns: string[]
  rows: string[][]
  emptyLabel: string
}

/** The three-way dedup outcome for one section on import. */
export interface SectionDedupePlan<TRecord = unknown> {
  add: TRecord[]
  skipById: TRecord[]
  skipByContent: TRecord[]
}

/** Options threaded into `apply` so writes stay deterministic in tests. */
export interface ApplyCtx {
  /** ISO timestamp stamped onto created records (never Date.now() in pure code). */
  now: string
}

export interface DataSection<TRecord = unknown> {
  key: string
  sectionVersion: number
  /** Store → canonical records (USD cents). */
  serialize(store: DataStore): TRecord[]
  /** Envelope section payload → records. Version-tolerant. */
  read(payload: SectionPayload): TRecord[]
  /** Split records into add / skip-by-id / skip-by-content against the store. */
  dedupe(records: TRecord[], store: DataStore): SectionDedupePlan<TRecord>
  /** Create ONLY `plan.add` via the store's additive mutations. */
  apply(plan: SectionDedupePlan<TRecord>, store: DataStore, ctx: ApplyCtx): void
  /** Build the visible PDF layout for this section. */
  renderModel(records: TRecord[], ctx: RenderCtx): SectionRenderModel
}

const registry = new Map<string, DataSection>()

/** Register a section. Throws on a duplicate key (developer error). */
export function register(section: DataSection): void {
  if (registry.has(section.key)) {
    throw new Error(`dataFile: section "${section.key}" already registered`)
  }
  registry.set(section.key, section)
}

export function getSection(key: string): DataSection | undefined {
  return registry.get(key)
}

/** Registered sections in insertion order (stable export + summary order). */
export function registeredSections(): DataSection[] {
  return [...registry.values()]
}

/** Test-only: clear the registry so a test can register throwaway sections. */
export function _resetRegistry(): void {
  registry.clear()
}
