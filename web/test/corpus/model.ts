// In-memory model for the coverage corpus (spec 026). These types wrap the
// EXISTING domain rows from web/lib/types.ts with generation intent — no row
// shape is redefined here. The emitted rows are exactly User/Household/Person/
// Card/Transaction/TransactionShare/Property/MortgageInfo/LeaseInfo/Unit/
// RentalPayment/Budget.

import type {
  User,
  Household,
  Person,
  Card,
  Transaction,
  TransactionShare,
  Property,
  MortgageInfo,
  LeaseInfo,
  Unit,
  RentalPayment,
  Budget,
  Tag,
  Goal,
  GoalContribution,
  LinkedInstitution,
  LinkedAccount,
} from '@/lib/types'
import type { DbEntitlement } from '@/lib/entitlements'
import type { CurrencyKey } from '@/lib/finance/money'
import type { SplitMethod } from '@/lib/splits'
import type { Dimension } from './coverage'

/** `household_members` join row (not exported from lib/types as an interface). */
export interface HouseholdMember {
  household_id: string
  user_id: string
  role: 'owner' | 'member'
  created_at: string
}

/** `transaction_tags` join row (spec 027/030). Derived in `toTables` from each
 *  transaction's `tags` field — a SET, no sum invariant. */
export interface TransactionTag {
  transaction_id: string
  tag_id: string
}

/** Why a generated transaction exists — read by coverage + reproduction tests. */
export type TxIntent =
  | 'refund'
  | 'month-boundary-first'
  | 'month-boundary-last'
  | 'leftover-cent'
  | 'recurring-merchant'
  | 'non-noon-utc'
  | 'over-budget'
  | 'subscription'
  | 'income'
  | 'settle-up'
  | 'sparse'
  | 'dense'

export interface GeneratedTransaction {
  transaction: Transaction
  shares: TransactionShare[]
  splitMethod: SplitMethod
  intent: TxIntent[]
}

export interface GeneratedProperty {
  property: Property
  mortgage?: MortgageInfo
  lease?: LeaseInfo
  units: Unit[]
  rentalPayments: RentalPayment[]
}

export interface HouseholdScenario {
  /** Unique, human-readable (e.g. "joint-even-jpy-dense"). */
  label: string
  /** Coverage dimensions this scenario satisfies (drives coverageOf). */
  dimensions: Dimension[]
  /** Display-currency lens (USD-cents storage is unchanged; research D3). */
  displayCurrency: CurrencyKey
  /** Set on the A2 scenario to flag boundary/non-noon rows. */
  timezoneNote?: string
  users: User[]
  household: Household
  people: Person[]
  members: HouseholdMember[]
  cards: Card[]
  transactions: GeneratedTransaction[]
  properties: GeneratedProperty[]
  budgets: Budget[]
  // spec 030 additions — OPTIONAL so scenarios that do not set them serialize
  // byte-identically to the spec-026 snapshot (JSON.stringify drops undefined).
  // `transaction_tags` join rows are DERIVED in toTables from each transaction's
  // `tags` field, so scenarios only carry the tag definitions here.
  tags?: Tag[]
  goals?: Goal[]
  goalContributions?: GoalContribution[]
  linkedInstitutions?: LinkedInstitution[]
  linkedAccounts?: LinkedAccount[]
  /** One entitlement row per relevant user (user-scoped, not household-scoped). */
  entitlements?: DbEntitlement[]
}

export interface CorpusMeta {
  /** Bumped intentionally when the corpus SHAPE changes. No timestamp (would
   *  break byte-stability). */
  version: number
  generatedFromSeed: number
  scenarioCount: number
}

export interface Corpus {
  seed: number
  meta: CorpusMeta
  scenarios: HouseholdScenario[]
}

/** Flattened, Supabase-shaped table maps for the seeder and in-memory client. */
export interface CorpusTables {
  users: User[]
  households: Household[]
  household_people: Person[]
  household_members: HouseholdMember[]
  cards: Card[]
  transactions: Transaction[]
  transaction_shares: TransactionShare[]
  properties: Property[]
  mortgage_info: MortgageInfo[]
  lease_info: LeaseInfo[]
  units: Unit[]
  rental_payments: RentalPayment[]
  budgets: Budget[]
  // spec 030 — the previously-missing tables the store loads (holistic seed).
  tags: Tag[]
  transaction_tags: TransactionTag[]
  goals: Goal[]
  goal_contributions: GoalContribution[]
  linked_institutions: LinkedInstitution[]
  linked_accounts: LinkedAccount[]
  entitlements: DbEntitlement[]
}
