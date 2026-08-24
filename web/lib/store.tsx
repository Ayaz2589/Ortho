'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { App } from '@capacitor/app'
import { createClient } from './supabase/client'
import { isTestBuild } from './test-build'
import { readFlags } from './flags'
import { writeSkeletonCount } from './skeletonCounts'
import { autoLoginEnabled, autoLoginCreds } from './auth/autoLogin'
import { signInHref } from './nav'
import { hapticConfirm, hapticDestructive } from './haptics'
import { CURRENCY_CONFIG, formatMoney as fmtMoney, type CurrencyKey } from './finance/money'
import { FALLBACK_RATE_FROM_USD } from './finance/currency'
import { applyRoutineStates, detectRoutines, type RoutineWithState } from './finance/routines'
import { consentTransition, shouldDeleteVisitsOnTransition } from './location/consent'
import { effectiveShares } from './format'
import { CATEGORIES, paletteFor } from './categories'
import {
  DEFAULT_LANGUAGE,
  DEFAULT_LOCALE,
  asLanguage,
  localeForLanguage,
  type Language,
} from './language'
import { useTranslate, type Translate } from './i18n'
import { deriveGateState, type DbEntitlement, type GateState } from './entitlements'
import { SUBSCRIPTION_ENABLED } from './subscriptionGate'
import { clearPendingLinkSession } from './plaidLinkSession'
import type {
  User,
  Person,
  Household,
  Transaction,
  Tag,
  Card,
  DepositAccount,
  Property,
  MortgageInfo,
  LeaseInfo,
  Unit,
  RentalPayment,
  Budget,
  TransactionCategory,
  LinkedInstitution,
  LinkedAccount,
  Goal,
  GoalContribution,
  FinancialProfile,
  FixedCost,
  DimensionWeight,
  HealthSnapshot,
  HealthBand,
  RecognizedRoutineState,
  LocationConsent,
  LocationConsentLevel,
  MerchantGeocode,
  RoutineVisit,
} from './types'
import type {
  UserRow,
  PersonRow,
  TransactionRow,
  TransactionShareRow,
  TagRow,
  TransactionTagRow,
  CardRow,
  DepositAccountRow,
  PropertyRow,
  MortgageInfoRow,
  LeaseInfoRow,
  UnitRow,
  RentalPaymentRow,
  BudgetRow,
  LinkedInstitutionRow,
  LinkedAccountRow,
  GoalRow,
  GoalContributionRow,
  UserFinancialProfileRow,
  UserFixedCostRow,
  UserDimensionWeightRow,
  FinancialHealthSnapshotRow,
  RecognizedRoutineStateRow,
  UserLocationConsentRow,
  MerchantGeocodeRow,
  UserRoutineVisitRow,
} from './supabase/rows'

const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000'

export interface OwnerDisplay {
  avatarUser: User
  label: string
  count: number
}

interface AppStateValue {
  loading: boolean
  error: string | null
  /** True when the initial bootstrap itself failed — enables Retry (mirrors iOS BootstrapRecoveryView). */
  bootstrapFailed: boolean
  currentUserId: string
  /** Signed-in account email (shown on the Sign out row, mirroring iOS). */
  currentUserEmail: string | null
  currentUser: User | null
  /** The current account holder's Person (owner default), if resolved. */
  currentPersonId: string
  currentHousehold: Household | null
  users: User[]
  /** Active (non-removed) household people, in display order. Owners are People. */
  people: Person[]
  householdMembers: User[]
  transactions: Transaction[]
  /** Household free-form tag roster (spec 027). */
  tags: Tag[]
  cards: Card[]
  /** Household deposit account names for income transactions (spec 033). */
  depositAccounts: DepositAccount[]
  properties: Property[]
  rentalPayments: RentalPayment[]
  budgets: Budget[]
  /** Household savings/debt-payoff goals (spec 027). */
  goals: Goal[]
  /** All contributions across the household's goals; a goal's progress is the
   *  sum of the ones whose `goal_id` matches. */
  goalContributions: GoalContribution[]
  /** Financial Health (spec 041) — USER-scoped, private to the signed-in account.
   *  The score is derived live; only these raw answers + snapshots persist. */
  userFinancialProfile: FinancialProfile | null
  userFixedCosts: FixedCost[]
  userDimensionWeights: DimensionWeight[]
  healthSnapshots: HealthSnapshot[]
  /** Financial Routines (spec 044) — household-scoped confirm/dismiss/rename state, keyed by the
   *  detection engine's routine_key. Routines themselves are derived live (see lib/finance/routines.ts). */
  recognizedRoutineStates: RecognizedRoutineState[]
  /** Household-level merchant-name → place cache (FR-012). */
  merchantGeocodes: MerchantGeocode[]
  /** The signed-in user's location-assistance opt-in level (private; null until loaded/created). */
  locationConsent: LocationConsent | null
  setLocationConsent: (level: LocationConsentLevel) => Promise<void>
  /** Lazily-loaded (spec 044 US4) — only fetched on demand, only meaningful once opted into
   *  'foreground_capture'. Empty until `loadRoutineVisits` is called. */
  routineVisits: RoutineVisit[]
  /** Resolves the freshly loaded rows so callers can act on them immediately
   *  (a state read right after the await would be a stale closure). */
  loadRoutineVisits: () => Promise<RoutineVisit[]>
  recordRoutineVisit: (latitude: number, longitude: number, accuracyMeters: number | null) => Promise<void>
  currency: CurrencyKey
  rates: Partial<Record<CurrencyKey, number>>
  /** Epoch ms of the last successful live-rate fetch (or cached fetch), null if never. */
  ratesLastFetched: number | null
  ratesIsLoading: boolean
  ratesError: string | null
  /** Selected language picker option ("System" follows the browser). */
  language: Language
  /** BCP-47 locale derived from `language`, driving all Intl formatters. */
  locale: string
  /** The signed-in user's entitlement row (spec 018) — read-only on clients. */
  entitlement: DbEntitlement | null
  /** The single gate fact (admin|trialing|active|grace|lapsed); null until the
   *  row is loaded — and a null gate NEVER shows the paywall (FR-008). */
  gateState: GateState | null
  /** Refetch the entitlement row and re-derive the gate ("Check again").
   *  Resolves true iff the refetch succeeded (false = keep state, couldn't check). */
  refreshEntitlement: () => Promise<boolean>
  /** Household linked banks (spec 024) — read-only on clients; the plaid-*
   *  edge functions (service role) do all writes. */
  linkedInstitutions: LinkedInstitution[]
  linkedAccounts: LinkedAccount[]
  /** Refetch linked banks after a connect/disconnect. True iff it succeeded
   *  (false = keep current lists, couldn't check — never a false empty). */
  refreshLinkedBanks: () => Promise<boolean>

  setCurrency: (c: CurrencyKey) => void
  chooseLanguage: (language: Language) => void
  rate: (c: CurrencyKey) => number
  formatMoney: (cents: number, opts?: { leadingPlus?: boolean }) => string
  /** Translate a UI string for the selected language (identity in English).
   *  Positional args fill {0},{1}… placeholders — the iOS %@/%lld mirror. */
  t: Translate

  /** Resolve a person id (a transaction owner) to its display fields. */
  resolveUser: (id: string) => User
  ownersDisplay: (tx: Transaction) => OwnerDisplay

  // aggregation helpers (USD cents)
  categoryExpenseTotal: (category: TransactionCategory, start: Date, end: Date) => number
  monthlySpentBy: (personId: string) => number
  spentBy: (personId: string, start: Date, end: Date) => number

  // mutations
  /** Resolves true when the row persisted; bulk callers await it for honest counts. */
  addTransaction: (tx: Transaction) => Promise<boolean>
  updateTransaction: (tx: Transaction) => void
  deleteTransaction: (id: string) => void
  /** Resolve a tag name to a household tag id, reusing an existing tag on a
   *  trimmed case-insensitive match or optimistically creating a new one (spec
   *  027). Returns the tag so a caller can attach its id immediately. */
  addTag: (name: string) => Tag
  addCard: (name: string) => void
  deleteCard: (id: string) => void
  addDepositAccount: (name: string) => void
  deleteDepositAccount: (id: string) => void
  addProperty: (p: Property) => void
  updateProperty: (p: Property) => void
  deleteProperty: (id: string) => void
  addRentalPayment: (p: RentalPayment) => void
  deleteRentalPayment: (id: string) => void
  addOrUpdateBudget: (b: Budget) => void
  deleteBudget: (id: string) => void
  // goals (spec 027) — optimistic with rollback, like budgets/transactions
  addGoal: (g: Goal) => void
  updateGoal: (g: Goal) => void
  deleteGoal: (id: string) => void
  addContribution: (c: GoalContribution) => void
  updateContribution: (c: GoalContribution) => void
  deleteContribution: (id: string) => void
  // Financial Health (spec 041) — deliberate form submissions (awaitable, no
  // optimistic flicker); errors surface via the shared banner.
  saveFinancialProfile: (input: Omit<FinancialProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  saveFixedCosts: (costs: Array<Pick<FixedCost, 'label' | 'amount_cents' | 'kind'>>) => Promise<void>
  saveDimensionWeights: (weights: Array<Pick<DimensionWeight, 'dimension' | 'weight'>>) => Promise<void>
  writeHealthSnapshot: (score: number, band: HealthBand) => Promise<void>
  /** Persist a full questionnaire submit (profile + costs + weights) then a fresh
   *  baseline snapshot, in sequence. */
  saveFinancialHealth: (args: {
    profile: Omit<FinancialProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>
    costs: Array<Pick<FixedCost, 'label' | 'amount_cents' | 'kind'>>
    weights: Array<Pick<DimensionWeight, 'dimension' | 'weight'>>
    score: number
    band: HealthBand
  }) => Promise<void>
  // Financial Routines (spec 044) — `routines` is a memoized selector combining live detection
  // (routines.ts) with persisted household state; confirm/dismiss/rename are the only durable
  // actions (FR-005).
  routines: RoutineWithState[]
  confirmRoutine: (routineKey: string, personId?: string | null) => Promise<void>
  dismissRoutine: (routineKey: string) => Promise<void>
  renameRoutine: (routineKey: string, label: string) => Promise<void>
  updateHouseholdName: (name: string) => void
  addPerson: (name: string, colorKey?: string) => void
  renamePerson: (id: string, name: string) => void
  setPersonColor: (id: string, colorKey: string) => void
  removePerson: (id: string) => void
  refreshRates: () => void
  signOut: () => Promise<void>
  /** Clear the current error banner. */
  dismissError: () => void
  /** Re-run the failed bootstrap (mirrors iOS retryBootstrap). */
  retryBootstrap: () => void
}

/** The stable display/services surface. Its members change identity only when
 *  their real inputs do (currency/rate/locale for money, people for owner
 *  resolution, language for `t`) — NOT on unrelated data mutations. Splitting
 *  it out of the changing-data context lets `React.memo`'d rows that read only
 *  these skip re-renders when an unrelated transaction is added/edited (US6/P4,
 *  spec 023). `useApp()` re-merges both so its public surface is unchanged. */
type AppServices = Pick<
  AppStateValue,
  'rate' | 'formatMoney' | 't' | 'resolveUser' | 'ownersDisplay'
>
type AppData = Omit<AppStateValue, keyof AppServices>

const DataCtx = createContext<AppData | null>(null)
const ServicesCtx = createContext<AppServices | null>(null)

export function useApp(): AppStateValue {
  const data = useContext(DataCtx)
  const services = useContext(ServicesCtx)
  if (!data || !services) throw new Error('useApp must be used within AppStateProvider')
  return { ...data, ...services }
}

/** Subscribe to ONLY the stable display/services surface. Components that read
 *  just these (the ledger rows) use this instead of `useApp()` so an unrelated
 *  data change doesn't re-render them (paired with `React.memo`). */
export function useAppServices(): AppServices {
  const services = useContext(ServicesCtx)
  if (!services) throw new Error('useAppServices must be used within AppStateProvider')
  return services
}

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

function personToUser(p: Person): User {
  return { id: p.id, name: p.name, initial: p.initial, color_key: p.color_key, created_at: p.created_at }
}

const KNOWN_KINDS = new Set(['expense', 'income', 'transfer'])

/** Row-level enum guard, mirroring iOS's `Lenient<T>` + compactMap: a server
 *  row whose kind or category this build doesn't know is silently dropped —
 *  one bad row disappears, everything else renders, nothing crashes. */
function isKnownTransactionRow(r: TransactionRow): boolean {
  return KNOWN_KINDS.has(r.kind) && r.category in CATEGORIES
}

/** Attach owner_ids (person ids) + per-owner cents shares to each transaction
 *  from its `transaction_shares` rows. A row with no shares falls back to its
 *  creator's person at the full amount (defensive — post-migration all rows
 *  carry materialized shares). Rows with an unknown kind/category are dropped
 *  (see `isKnownTransactionRow`). */
function rehydrateTransactions(
  rows: TransactionRow[],
  shares: TransactionShareRow[],
  personForUser: (createdBy: string) => string,
  tagsByTx?: Map<string, string[]>
): Transaction[] {
  const byTx = new Map<string, TransactionShareRow[]>()
  for (const s of shares) {
    const arr = byTx.get(s.transaction_id) ?? []
    arr.push(s)
    byTx.set(s.transaction_id, arr)
  }
  return rows.filter(isKnownTransactionRow).map((r) => {
    const tags = tagsByTx?.get(r.id) ?? []
    const sh = byTx.get(r.id) ?? []
    if (sh.length === 0) {
      // A transfer (reimbursement) is directional, not co-owned — never synthesize
      // creator-owns-all for it (that would misread it as an expense).
      if (r.kind === 'transfer') return { ...r, owner_ids: [], shares: {}, tags }
      const pid = personForUser(r.created_by)
      return { ...r, owner_ids: [pid], shares: { [pid]: r.amount_cents }, tags }
    }
    const owner_ids = sh.map((s) => s.person_id)
    const sharesMap = sh.reduce<Record<string, number>>((m, s) => ((m[s.person_id] = s.amount_cents), m), {})
    return { ...r, owner_ids, shares: sharesMap, tags }
  })
}

/** Group `transaction_tags` rows into a per-transaction id list (spec 027). */
function tagsByTransaction(rows: TransactionTagRow[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const r of rows) {
    const arr = m.get(r.transaction_id) ?? []
    arr.push(r.tag_id)
    m.set(r.transaction_id, arr)
  }
  return m
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bootstrapFailed, setBootstrapFailed] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [people, setPeople] = useState<Person[]>([]) // all people, incl. removed
  const [household, setHousehold] = useState<Household | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [depositAccounts, setDepositAccounts] = useState<DepositAccount[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [rentalPayments, setRentalPayments] = useState<RentalPayment[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [goalContributions, setGoalContributions] = useState<GoalContribution[]>([])
  // Financial Health (spec 041) — user-scoped.
  const [userFinancialProfile, setUserFinancialProfile] = useState<FinancialProfile | null>(null)
  const [userFixedCosts, setUserFixedCosts] = useState<FixedCost[]>([])
  const [userDimensionWeights, setUserDimensionWeights] = useState<DimensionWeight[]>([])
  const [healthSnapshots, setHealthSnapshots] = useState<HealthSnapshot[]>([])
  // Financial Routines (spec 044) — recognizedRoutineStates/merchantGeocodes are
  // household-scoped; locationConsent is user-scoped (private).
  const [recognizedRoutineStates, setRecognizedRoutineStates] = useState<RecognizedRoutineState[]>([])
  const [merchantGeocodes, setMerchantGeocodes] = useState<MerchantGeocode[]>([])
  const [locationConsent, setLocationConsentState] = useState<LocationConsent | null>(null)
  const [routineVisits, setRoutineVisits] = useState<RoutineVisit[]>([])
  const [linkedInstitutions, setLinkedInstitutions] = useState<LinkedInstitution[]>([])
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([])
  const [currency, setCurrencyState] = useState<CurrencyKey>('usd')
  const [rates, setRates] = useState<Partial<Record<CurrencyKey, number>>>({})
  const [ratesLastFetched, setRatesLastFetched] = useState<number | null>(null)
  const [ratesIsLoading, setRatesIsLoading] = useState(false)
  const [ratesError, setRatesError] = useState<string | null>(null)
  // Language drives the locale. Start at the default so SSR and the first client
  // paint agree; the persisted choice is adopted (and "System" resolved against
  // navigator.language) after mount.
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)
  const [locale, setLocale] = useState(DEFAULT_LOCALE)
  const [entitlement, setEntitlement] = useState<DbEntitlement | null>(null)
  const booted = useRef(false)

  // ---- preferences (localStorage) ----
  useEffect(() => {
    // Validate on read like every sibling preference (asLanguage, readTextSize,
    // readAppearance) — a corrupt stored key would crash formatMoney app-wide.
    const c = localStorage.getItem('currency')
    if (c && c in CURRENCY_CONFIG) setCurrencyState(c as CurrencyKey)
    const stored = asLanguage(localStorage.getItem('language'))
    setLanguage(stored)
    setLocale(localeForLanguage(stored))
  }, [])

  const setCurrency = (c: CurrencyKey) => {
    setCurrencyState(c)
    localStorage.setItem('currency', c)
  }

  const chooseLanguage = (next: Language) => {
    setLanguage(next)
    setLocale(localeForLanguage(next))
    localStorage.setItem('language', next)
  }

  const t = useTranslate(language)

  // supabase-js resolves with `{ error }` instead of throwing, so a missed
  // check reads as success — during bootstrap that turned a transient read
  // failure into a duplicate household, and during property writes into
  // silent sub-table data loss. Funnel every result whose failure must not
  // pass silently through this.
  const orThrow = <T extends { error: { message: string } | null }>(res: T): T => {
    if (res.error) throw new Error(res.error.message)
    return res
  }

  // ---- bootstrap ----
  async function runBootstrap() {
    setLoading(true)
    setError(null)
    setBootstrapFailed(false)
    try {
      let {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      // spec 030: in local/stage, auto-authenticate a known seed user against the
      // REAL backend (no OTP screen) so the app opens fully populated with real
      // RLS/RPCs/edge functions. Triple-gated (appEnv()!=='prod' + explicit
      // opt-in + creds) so it is provably impossible in production. Distinct from
      // the in-memory `bypassAuth` stub below, which never touches a backend.
      if (!authUser && autoLoginEnabled()) {
        const creds = autoLoginCreds()
        if (creds) {
          const { error: signInError } = await supabase.auth.signInWithPassword(creds)
          if (!signInError) {
            authUser = (await supabase.auth.getUser()).data.user
          }
        }
      }

      if (!authUser) {
        setLoading(false)
        // spec 021: this used to be caught server-side by `proxy.ts` before any
        // client code ran; under static export there is no server hop, so
        // bootstrap itself is the signed-out gate. Test builds with the
        // "Bypass auth" flag on skip the redirect (contract C-TD-4/C-FF-4).
        if (!(isTestBuild() && readFlags().bypassAuth)) {
          window.location.assign(signInHref())
        }
        return
      }
      setCurrentUserId(authUser.id)
      setCurrentUserEmail(authUser.email ?? null)

      // Ensure a profile row exists — insert only when absent. Upserting a
      // derived name + fresh created_at on every sign-in flip-flopped the
      // profile between platforms (see PARITY.md); an existing row is now
      // left untouched.
      const { data: existingProfile } = orThrow(
        await supabase.from('users').select('*').eq('id', authUser.id).limit(1)
      )
      let me: User
      if (existingProfile && existingProfile.length > 0) {
        me = existingProfile[0] as User
      } else {
        const email = authUser.email ?? ''
        const local = email.split('@')[0] || 'Me'
        const name = local.charAt(0).toUpperCase() + local.slice(1)
        me = {
          id: authUser.id,
          name,
          initial: name.charAt(0).toUpperCase() || 'M',
          color_key: 'sage',
          created_at: new Date().toISOString(),
        }
        orThrow(await supabase.from('users').insert(me))
      }

      // find or create household. The membership read MUST fail loudly: if
      // a transient error were treated as "no membership", we would create a
      // duplicate household and silently detach the user from their data.
      const { data: membership } = orThrow(
        await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', authUser.id)
          .limit(1)
      )
      let householdId: string
      let householdName = 'Home'
      if (membership && membership.length > 0) {
        householdId = membership[0].household_id
        // Name read is display-only — a failure here must not block boot.
        const { data: h } = await supabase
          .from('households')
          .select('*')
          .eq('id', householdId)
          .single()
        if (h) householdName = h.name
      } else {
        householdId = uuid()
        orThrow(
          await supabase
            .from('households')
            .insert({ id: householdId, owner_id: authUser.id, name: householdName })
        )
        orThrow(
          await supabase
            .from('household_members')
            .insert({ household_id: householdId, user_id: authUser.id, role: 'owner' })
        )
      }

      // ensure the account holder has a Person row, then fold any legacy
      // device-only local users into household_people (one-time).
      await ensureAccountPersonAndFoldLegacy(householdId, me)

      // Spec 018, WHEN ENABLED: ensure the 31-day free-month row exists (server-side,
      // insert-if-absent — reinstalls/re-sign-ins can never reset it) and read
      // it back. Started HERE — after the profile insert above, because the
      // RPC's row references public.users(id) — and kicked off eagerly (the
      // lazy supabase builder starts on assimilation) so it genuinely overlaps
      // the loadAll fan-out below. Clients cannot write entitlement state;
      // this SECURITY DEFINER RPC is the only trusted path.
      //
      // Subscriptions disabled: don't call the RPC at all. Skipping it (rather than calling
      // and ignoring the result) is what makes the disable total — a backend that is down,
      // un-migrated, or eventually torn down can no longer affect whether the app loads,
      // since `orThrow` below routes a failed read to bootstrapFailed. Existing rows are
      // left untouched; the RPC is insert-if-absent, so re-enabling resumes cleanly.
      const entitlementPromise = SUBSCRIPTION_ENABLED
        ? Promise.resolve(supabase.rpc('ensure_entitlement'))
        : null

      await loadAll(householdId, householdName, authUser.id)

      // A failed entitlement read is a LOAD failure (recovery path), never a
      // paywall (FR-008) — orThrow routes it to bootstrapFailed like any other
      // bootstrap read. A null row (test-data mode) leaves the gate open.
      // EXCEPTION (merge review): a MISSING RPC (PostgREST PGRST202) means the
      // backend simply hasn't been migrated for spec 018 yet — Vercel ships
      // main to production on merge, ahead of the operator's live setup
      // (quickstart §2). That must fail OPEN (feature dark, gate null), never
      // take bootstrap down for every live user.
      if (entitlementPromise === null) {
        setEntitlement(null)
      } else {
        const entRes = await entitlementPromise
        if (entRes.error && (entRes.error as { code?: string }).code === 'PGRST202') {
          setEntitlement(null)
        } else {
          orThrow(entRes)
          setEntitlement((entRes.data as DbEntitlement | null) ?? null)
        }
      }
    } catch (e) {
      setBootstrapFailed(true)
      setError(`Failed to load: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  /** Refetch the entitlement row on demand (paywall "Check again", checkout
   *  return, app foreground). Failure keeps the current gate — a flaky refresh
   *  must never cause a false lapse or unlock. Returns whether the refetch
   *  SUCCEEDED so callers can distinguish "checked: still nothing" from
   *  "couldn't check" (review 018). `quiet` suppresses the error banner for
   *  passive (lifecycle-driven) refreshes — only explicit user actions should
   *  surface a failure. */
  async function refreshEntitlement(opts?: { quiet?: boolean }): Promise<boolean> {
    // Subscriptions disabled: no read, and report success. The only remaining caller is the
    // Capacitor foreground hook (the paywall and Settings section never mount), and its job
    // is to catch a lapse that happened while suspended — which cannot occur while the gate
    // is forced open. `true` keeps the "checked: nothing changed" contract honest for
    // callers that distinguish it from "couldn't check".
    if (!SUBSCRIPTION_ENABLED) return true
    const { data, error: e } = await supabase
      .from('entitlements')
      .select('*')
      .limit(1)
    if (e) {
      if (!opts?.quiet) setError(e.message)
      return false
    }
    const rows = (data ?? []) as DbEntitlement[]
    if (rows.length > 0) setEntitlement(rows[0])
    return true
  }

  /** Refetch linked banks on demand (after a connect completes or a
   *  disconnect goes through — spec 024). Failure keeps the current lists —
   *  a flaky refresh must never render a false "no banks linked" state. */
  async function refreshLinkedBanks(): Promise<boolean> {
    const [instRes, acctRes] = await Promise.all([
      supabase.from('linked_institutions').select('*').order('created_at', { ascending: true }),
      supabase.from('linked_accounts').select('*').order('created_at', { ascending: true }),
    ])
    if (instRes.error || acctRes.error) return false
    setLinkedInstitutions((instRes.data ?? []) as LinkedInstitutionRow[])
    setLinkedAccounts((acctRes.data ?? []) as LinkedAccountRow[])
    return true
  }

  const retryBootstrap = () => {
    void runBootstrap()
  }

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void runBootstrap()
    refreshRates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live auth-state watcher — mirrors iOS's authStateChanges subscription: a
  // mid-session sign-out/expiry (30-day timebox, failed refresh) clears state
  // and routes to sign-in immediately, not at the next navigation.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event: string) => {
      if (event !== 'SIGNED_OUT') return
      setCurrentUserId('')
      setCurrentUserEmail(null)
      setUsers([])
      setPeople([])
      setHousehold(null)
      setTransactions([])
      setTags([])
      setCards([])
      setProperties([])
      setRentalPayments([])
      setBudgets([])
      setGoals([])
      setGoalContributions([])
      setEntitlement(null)
      // Spec 024: linked banks are household data too, and the pending link
      // record must not survive into another member's session on this device.
      setLinkedInstitutions([])
      setLinkedAccounts([])
      clearPendingLinkSession()
      window.location.assign(signInHref())
    })
    return () => data.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  // spec 021: on the Capacitor iOS build, `onAuthStateChange` above only
  // reacts to SIGNED_OUT, not proactive idle-tab revalidation (a documented
  // gap vs. the native app's app-lifetime authStateChanges subscription —
  // see docs/archive/PARITY-2026-07-08.md). Foregrounding the app re-checks the
  // session, closing that gap for the Capacitor build specifically; this is a
  // no-op on desktop/mobile web (@capacitor/app's listener never fires there).
  useEffect(() => {
    let handle: { remove: () => void } | undefined
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      // Re-validate against the SERVER (getUser), not the cache-first getSession,
      // so a session revoked server-side within the local token's TTL is caught on
      // foreground (spec 023 B5). Sign out (→ SIGNED_OUT → redirect) only on a
      // genuine auth rejection (401/403) or a confirmed missing user — never a
      // transient network error, which would wrongly kick out an offline user.
      void supabase.auth
        .getUser()
        .then((res: { data: { user: unknown }; error: { status?: number } | null }) => {
          const status = res.error?.status
          if ((res.error && (status === 401 || status === 403)) || (!res.error && !res.data.user)) {
            void supabase.auth.signOut()
          }
        })
      // spec 018 (merge review): the gate derived at bootstrap is frozen while
      // the Capacitor app sits resident — a trial/subscription that lapsed
      // while suspended would otherwise never gate (FR-006). Re-read the row on
      // every foreground; quiet, because a transient failure must keep the
      // current gate with no banner (never a false lapse — FR-008 spirit).
      void refreshEntitlement({ quiet: true })
    }).then((h) => {
      handle = h
    })
    return () => handle?.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  async function ensureAccountPersonAndFoldLegacy(householdId: string, me: User) {
    // Same fail-loud rule as the membership read: a swallowed error here would
    // insert a duplicate Person row for the account holder.
    const { data: existing } = orThrow(
      await supabase
        .from('household_people')
        .select('id, linked_user_id')
        .eq('household_id', householdId)
    )
    const rows = (existing ?? []) as { id: string; linked_user_id: string | null }[]
    let order = rows.length
    if (!rows.some((p) => p.linked_user_id === me.id)) {
      await supabase.from('household_people').insert({
        id: uuid(),
        household_id: householdId,
        name: me.name,
        initial: me.initial,
        color_key: me.color_key,
        linked_user_id: me.id,
        sort_order: 0,
      })
    }
    // Legacy: people previously stored only on this device (localStorage).
    try {
      const legacy = JSON.parse(localStorage.getItem('localUsers') ?? '[]')
      if (Array.isArray(legacy) && legacy.length) {
        // Clear the device-only backup ONLY when every insert succeeded — a
        // failed fold used to wipe it anyway, permanently losing those people
        // (review 2026-08-24).
        let allOk = true
        for (const lu of legacy) {
          const { error: foldErr } = await supabase.from('household_people').insert({
            id: uuid(),
            household_id: householdId,
            name: lu.name,
            initial: lu.initial ?? (lu.name?.[0]?.toUpperCase() || '·'),
            color_key: lu.color_key ?? 'sand',
            linked_user_id: null,
            sort_order: order++,
          })
          if (foldErr) allOk = false
        }
        if (allOk) localStorage.removeItem('localUsers')
      }
    } catch {}
  }

  async function loadAll(householdId: string, householdName: string, ownerId: string) {
    const [
      usersRes,
      peopleRes,
      txRes,
      sharesRes,
      cardsRes,
      propsRes,
      mortRes,
      leaseRes,
      unitsRes,
      rpRes,
      budgetsRes,
      goalsRes,
      goalContribRes,
      linkedInstRes,
      linkedAcctRes,
      tagsRes,
      txTagsRes,
      depositAccountsRes,
      userProfileRes,
      userFixedCostsRes,
      userWeightsRes,
      healthSnapshotsRes,
      routineStatesRes,
      merchantGeocodesRes,
      locationConsentRes,
    ] = await Promise.all([
      // Column projection (US6/P5): the three highest-volume reads fetch only the
      // fields the app uses — never select('*'). Keep these lists in lockstep with
      // the `User`/`Transaction`/`TransactionShare` types; the Supabase test mock
      // IGNORES the column list, so a missing column surfaces only at runtime/CI,
      // not in unit tests.
      supabase.from('users').select('id, name, initial, color_key, created_at'),
      supabase.from('household_people').select('*').eq('household_id', householdId).order('sort_order', { ascending: true }),
      supabase
        .from('transactions')
        .select('id, household_id, merchant, category, kind, amount_cents, source, date, created_by, created_at, updated_at, paid_by, notes')
        .order('date', { ascending: false }),
      supabase.from('transaction_shares').select('transaction_id, person_id, amount_cents'),
      supabase.from('cards').select('*').order('created_at', { ascending: true }),
      supabase.from('properties').select('*').order('address', { ascending: true }),
      supabase.from('mortgage_info').select('*'),
      supabase.from('lease_info').select('*'),
      supabase.from('units').select('*').order('sort_order', { ascending: true }),
      supabase.from('rental_payments').select('*').order('date', { ascending: false }),
      supabase.from('budgets').select('*'),
      // Goals (spec 027): household facts like budgets — RLS scopes them; members
      // read AND write. Fail-open on a missing table (deploy-before-migrate),
      // same as linked banks below.
      supabase.from('goals').select('*').order('created_at', { ascending: true }),
      supabase.from('goal_contributions').select('*').order('date', { ascending: false }),
      // Linked banks (spec 024): household facts like budgets — RLS scopes them,
      // so no explicit household filter is needed (and clients cannot write).
      supabase.from('linked_institutions').select('*').order('created_at', { ascending: true }),
      supabase.from('linked_accounts').select('*').order('created_at', { ascending: true }),
      // Tags (spec 027): household roster + join. Fail-open on a missing table
      // (deploy-before-migrate window) like linked banks — a new additive
      // feature must never take the whole bootstrap down.
      supabase.from('tags').select('*').eq('household_id', householdId).order('created_at', { ascending: true }),
      supabase.from('transaction_tags').select('transaction_id, tag_id'),
      // Deposit accounts (spec 033): fail-open like tags/linked banks.
      supabase.from('deposit_accounts').select('*').order('created_at', { ascending: true }),
      // Financial Health (spec 041): USER-scoped (RLS user_id = auth.uid()), so
      // filtered by ownerId — NOT householdId. Fail-open like the others. The
      // profile is at most one row (maybeSingle → row | null).
      supabase.from('user_financial_profile').select('*').eq('user_id', ownerId).maybeSingle(),
      supabase.from('user_fixed_costs').select('*').eq('user_id', ownerId).order('created_at', { ascending: true }),
      supabase.from('user_dimension_weights').select('*').eq('user_id', ownerId),
      supabase.from('financial_health_snapshots').select('*').eq('user_id', ownerId).order('created_at', { ascending: true }),
      // Financial Routines (spec 044): household-scoped, fail-open like tags/goals — RLS scopes
      // them, so no explicit household filter is needed (mirrors linked_institutions above).
      supabase.from('recognized_routine_states').select('*'),
      supabase.from('merchant_geocodes').select('*'),
      // User-scoped (RLS user_id = auth.uid()), fail-open null like user_financial_profile.
      supabase.from('user_location_consent').select('*').eq('user_id', ownerId).maybeSingle(),
    ])

    // A failed read must surface as an error, not render as a real-looking
    // empty state (matches iOS, which fails its bootstrap on any load error).
    for (const res of [usersRes, peopleRes, txRes, sharesRes, cardsRes, propsRes, mortRes, leaseRes, unitsRes, rpRes, budgetsRes]) {
      orThrow(res)
    }
    // Linked banks (spec 024) fail OPEN when their tables don't exist yet —
    // the 018 PGRST202 lesson applied to tables: Vercel ships main to
    // production ahead of the operator's `supabase db push`, and an opt-in
    // settings feature must never take the whole bootstrap down during that
    // window. Any OTHER error stays fail-loud like every bootstrap read.
    const missingTable = (e: { code?: string } | null | undefined) =>
      e?.code === 'PGRST205' || e?.code === '42P01'
    for (const res of [goalsRes, goalContribRes, linkedInstRes, linkedAcctRes, tagsRes, txTagsRes, depositAccountsRes, userFixedCostsRes, userWeightsRes, healthSnapshotsRes, routineStatesRes, merchantGeocodesRes]) {
      if (res.error && missingTable(res.error as { code?: string })) {
        res.data = []
        res.error = null
      }
      orThrow(res)
    }
    // The profile/consent reads are maybeSingle (row | null), so their fail-open default is
    // null, not [] — handled separately from the array reads above.
    if (userProfileRes.error && missingTable(userProfileRes.error as { code?: string })) {
      userProfileRes.data = null
      userProfileRes.error = null
    }
    orThrow(userProfileRes)
    if (locationConsentRes.error && missingTable(locationConsentRes.error as { code?: string })) {
      locationConsentRes.data = null
      locationConsentRes.error = null
    }
    orThrow(locationConsentRes)

    // Typed row → domain boundary (FR-018): each read is asserted to its DB row
    // type (`lib/supabase/rows.ts`) and assigned to domain-typed state, so a
    // renamed/removed column or changed enum fails to compile here rather than at
    // runtime. The client itself is untyped (no `supabase gen types` in-sandbox),
    // so these `*Row` types are the typed seam — keep them in lockstep with the
    // column projections above and the domain types in `lib/types.ts`.
    setUsers((usersRes.data ?? []) as UserRow[])
    const peopleRows = (peopleRes.data ?? []) as PersonRow[]
    setPeople(peopleRows)
    setHousehold({
      id: householdId,
      // Passed explicitly from the authenticated user id: during first bootstrap
      // the `currentUserId` state is still '' in this closure (setCurrentUserId
      // hasn't re-rendered yet), so reading it here produced a blank owner_id.
      owner_id: ownerId,
      name: householdName,
      created_at: new Date().toISOString(),
    })
    const personForUser = (createdBy: string) =>
      peopleRows.find((p) => p.linked_user_id === createdBy)?.id ?? createdBy
    const txRows = (txRes.data ?? []) as TransactionRow[]
    const shareRows = (sharesRes.data ?? []) as TransactionShareRow[]
    const tagJoin = tagsByTransaction((txTagsRes.data ?? []) as TransactionTagRow[])
    const txns = rehydrateTransactions(txRows, shareRows, personForUser, tagJoin)
    setTransactions(txns)
    setTags((tagsRes.data ?? []) as TagRow[])
    setCards((cardsRes.data ?? []) as CardRow[])
    setDepositAccounts((depositAccountsRes.data ?? []) as DepositAccountRow[])

    // stitch properties
    const mort = new Map<string, MortgageInfo>(
      ((mortRes.data ?? []) as MortgageInfoRow[]).map((m) => [m.property_id, m])
    )
    const lease = new Map<string, LeaseInfo>(
      ((leaseRes.data ?? []) as LeaseInfoRow[]).map((l) => [l.property_id, l])
    )
    const unitsByProp = new Map<string, Unit[]>()
    for (const u of (unitsRes.data ?? []) as UnitRow[]) {
      const arr = unitsByProp.get(u.property_id) ?? []
      arr.push(u)
      unitsByProp.set(u.property_id, arr)
    }
    const props: Property[] = ((propsRes.data ?? []) as PropertyRow[]).map((p) => ({
      ...p,
      mortgage: mort.get(p.id),
      lease: lease.get(p.id),
      units: unitsByProp.get(p.id) ?? [],
    }))
    setProperties(props)
    setRentalPayments((rpRes.data ?? []) as RentalPaymentRow[])
    // spec 027: map each budget row → domain Budget, defaulting the rollover
    // columns so a deploy-before-migrate read (columns absent) behaves as fixed.
    setBudgets(
      ((budgetsRes.data ?? []) as BudgetRow[]).map((r) => ({
        id: r.id,
        household_id: r.household_id,
        category: r.category,
        monthly_limit_cents: r.monthly_limit_cents,
        budget_type: r.budget_type ?? 'fixed',
        rollover_cap_cents: r.rollover_cap_cents ?? null,
        // spec 054: absent column (pre-migration read) ⇒ a household budget.
        person_id: r.person_id ?? null,
        created_at: r.created_at ?? undefined,
      })),
    )
    setGoals((goalsRes.data ?? []) as GoalRow[])
    setGoalContributions((goalContribRes.data ?? []) as GoalContributionRow[])
    setUserFinancialProfile((userProfileRes.data ?? null) as UserFinancialProfileRow | null)
    setUserFixedCosts((userFixedCostsRes.data ?? []) as UserFixedCostRow[])
    setUserDimensionWeights((userWeightsRes.data ?? []) as UserDimensionWeightRow[])
    setHealthSnapshots((healthSnapshotsRes.data ?? []) as FinancialHealthSnapshotRow[])
    setRecognizedRoutineStates((routineStatesRes.data ?? []) as RecognizedRoutineStateRow[])
    setMerchantGeocodes((merchantGeocodesRes.data ?? []) as MerchantGeocodeRow[])
    setLocationConsentState((locationConsentRes.data ?? null) as UserLocationConsentRow | null)
    setLinkedInstitutions((linkedInstRes.data ?? []) as LinkedInstitutionRow[])
    setLinkedAccounts((linkedAcctRes.data ?? []) as LinkedAccountRow[])

    // spec 032: remember each dynamic collection's size so the NEXT load renders
    // a correctly-sized loading skeleton. Best-effort — writeSkeletonCount
    // swallows any storage error, so this never affects bootstrap.
    writeSkeletonCount('transactions', txns.length)
    writeSkeletonCount('goals', ((goalsRes.data ?? []) as GoalRow[]).length)
    writeSkeletonCount('housing', props.length)
    writeSkeletonCount('tags', ((tagsRes.data ?? []) as TagRow[]).length)
  }

  // ---- FX ----
  // Mirrors iOS: the cache is adopted at any age, a failed fetch keeps the
  // last real (stale) rates and only sets `ratesError`, and the hardcoded
  // FALLBACK_RATE_FROM_USD is used solely when no cache has EVER existed
  // (via `rate()`'s `??` fallback on an empty map).
  async function refreshRates() {
    let hasCache = false
    try {
      const fetchedAt = Number(localStorage.getItem('fxRatesFetchedAt') ?? 0)
      const cached = localStorage.getItem('fxRates')
      if (cached) {
        setRates(JSON.parse(cached))
        hasCache = true
        if (fetchedAt > 0) setRatesLastFetched(fetchedAt)
        if (Date.now() - fetchedAt < 24 * 60 * 60 * 1000) return
      }
    } catch {
      // Unreadable cache — proceed to a live fetch.
    }
    setRatesIsLoading(true)
    setRatesError(null)
    try {
      const res = await fetch('https://www.floatrates.com/daily/usd.json')
      if (!res.ok) throw new Error('rates')
      const json = await res.json()
      const next: Partial<Record<CurrencyKey, number>> = { usd: 1 }
      for (const key of Object.keys(FALLBACK_RATE_FROM_USD) as CurrencyKey[]) {
        if (key === 'usd') continue
        const entry = json[key]
        if (entry && typeof entry.rate === 'number') next[key] = entry.rate
      }
      const now = Date.now()
      setRates(next)
      setRatesLastFetched(now)
      localStorage.setItem('fxRates', JSON.stringify(next))
      localStorage.setItem('fxRatesFetchedAt', String(now))
    } catch (e) {
      // Keep whatever rates we already have (stale cache beats a hardcoded
      // approximation); surface the failure via the Settings caption.
      setRatesError((e as Error).message || 'rates unavailable')
      if (!hasCache) setRatesLastFetched(null)
    } finally {
      setRatesIsLoading(false)
    }
  }

  // Memoized so identity is stable across unrelated re-renders (US6/P4): each
  // changes only when its real input does. `formatMoney` still changes on
  // currency/rate/locale — memo consumers and rows must re-render then.
  const rate = useCallback((c: CurrencyKey) => rates[c] ?? FALLBACK_RATE_FROM_USD[c], [rates])
  const formatMoney = useCallback(
    (cents: number, opts?: { leadingPlus?: boolean }) =>
      fmtMoney(cents, currency, rate(currency), opts?.leadingPlus ?? false, locale),
    [currency, rate, locale]
  )

  // ---- owner (person) resolution ----
  const resolveUser = useCallback(
    (id: string): User => {
      const p = people.find((x) => x.id === id)
      if (p) return personToUser(p)
      return { id: PLACEHOLDER_ID, name: 'Removed', initial: '·', color_key: 'sand', created_at: '' }
    },
    [people]
  )

  // Mirrors iOS AppState.ownersDisplay: every owner name comma-joined with the
  // first owner's real avatar — never a synthetic "Shared" chip or "A + B".
  const ownersDisplay = useCallback(
    (tx: Transaction): OwnerDisplay => {
      const owners = tx.owner_ids
      if (owners.length === 0) {
        return { avatarUser: resolveUser(PLACEHOLDER_ID), label: '—', count: 0 }
      }
      const users = owners.map(resolveUser)
      return {
        avatarUser: users[0],
        label: users.map((u) => u.name).join(', '),
        count: owners.length,
      }
    },
    [resolveUser]
  )

  const activePeople = useMemo(
    () => people.filter((p) => !p.removed_at).sort((a, b) => a.sort_order - b.sort_order),
    [people]
  )
  const householdMembers = useMemo(() => activePeople.map(personToUser), [activePeople])

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId]
  )
  const currentPersonId = useMemo(
    () => people.find((p) => p.linked_user_id === currentUserId)?.id ?? '',
    [people, currentUserId]
  )

  // The single gate fact (spec 018). Derived, not stored: recomputed whenever
  // the row changes (bootstrap, refreshEntitlement). A null row derives a null
  // gate, which the Shell treats as open — the paywall only ever renders from
  // a successfully loaded, genuinely lapsed row (FR-008/009).
  const gateState = useMemo<GateState | null>(() => {
    // Subscriptions disabled (spec 018 kill switch): force the gate open. Stated explicitly
    // rather than relying on `entitlement` staying null above — this is the one line that
    // guarantees no paywall regardless of how a row got into state.
    if (!SUBSCRIPTION_ENABLED) return null
    if (!entitlement) return null
    // A present-but-unparseable expiry is a data anomaly, not a lapse: fail
    // OPEN (null gate) exactly like a load failure (FR-008 spirit) — a false
    // paywall is the worst failure mode. Aligned with iOS (review 018 [18]).
    const raw = entitlement.access_expires_at
    if (raw !== null && Number.isNaN(Date.parse(raw))) return null
    return deriveGateState(
      { status: entitlement.status, accessExpiresAt: raw },
      new Date().toISOString()
    )
  }, [entitlement])

  // ---- aggregation ----
  const inRange = (date: string, start: Date, end: Date) => {
    const t = new Date(date).getTime()
    return t >= start.getTime() && t < end.getTime()
  }

  const categoryExpenseTotal = (category: TransactionCategory, start: Date, end: Date) =>
    transactions
      .filter((t) => t.kind === 'expense' && t.category === category && inRange(t.date, start, end))
      .reduce((s, t) => s + t.amount_cents, 0)

  const spentBy = (personId: string, start: Date, end: Date) =>
    transactions
      .filter((t) => t.kind === 'expense' && inRange(t.date, start, end) && t.owner_ids.includes(personId))
      .reduce((s, t) => s + (effectiveShares(t)[personId] ?? 0), 0)

  const monthlySpentBy = (personId: string) => {
    // Build the month window on UTC midnights (mirroring the canonical monthBounds
    // in transactionFilters.ts), NOT local ones. Transactions are stored at noon
    // UTC (`${date}T12:00:00.000Z`); a LOCAL `new Date(y, m, 1)` window shifts the
    // exclusive month boundary west of the noon buffer, so a last-day transaction
    // dropped out of "this month" (and into next) for viewers at UTC+12..+14. UTC
    // bounds line up with the stored instants regardless of viewer timezone.
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    return spentBy(personId, start, end)
  }

  // ---- mutations (optimistic) ----
  /** Replace a transaction's tag attachments (spec 027). Unlike shares, tags
   *  carry NO sum invariant, so a failure here surfaces an error but never rolls
   *  back the parent transaction — an untagged-but-correct row is a safe partial
   *  state that the next loadAll reconciles. */
  const writeTags = async (tx: Transaction): Promise<{ ok: boolean; error?: string }> => {
    const { error: delErr } = await supabase.from('transaction_tags').delete().eq('transaction_id', tx.id)
    if (delErr) return { ok: false, error: delErr.message }
    const rows = (tx.tags ?? []).map((tag_id) => ({ transaction_id: tx.id, tag_id }))
    if (rows.length) {
      const { error: insErr } = await supabase.from('transaction_tags').insert(rows)
      if (insErr) return { ok: false, error: insErr.message }
    }
    return { ok: true }
  }

  const txRecord = (tx: Transaction) => ({
    id: tx.id,
    household_id: tx.household_id,
    merchant: tx.merchant,
    category: tx.category,
    kind: tx.kind,
    amount_cents: tx.amount_cents,
    source: tx.source,
    date: tx.date,
    created_by: tx.created_by,
    paid_by: tx.paid_by ?? null,
    notes: tx.notes ?? null,
  })

  /** Resolve a tag name to a household tag, reusing an existing one on a trimmed
   *  case-insensitive match or optimistically creating (spec 027). The insert is
   *  fire-and-forget with rollback-on-failure, matching the store's other
   *  optimistic writes; the returned tag's id is usable immediately. */
  const addTag = (name: string): Tag => {
    const trimmed = name.trim()
    const existing = tags.find((t) => t.name.trim().toLowerCase() === trimmed.toLowerCase())
    if (existing) return existing
    const tag: Tag = {
      id: uuid(),
      household_id: household?.id ?? '',
      name: trimmed,
      created_at: new Date().toISOString(),
    }
    setTags((prev) => [...prev, tag])
    ;(async () => {
      const { error: e } = await supabase
        .from('tags')
        .insert({ id: tag.id, household_id: tag.household_id, name: tag.name })
      if (e) {
        setTags((prev) => prev.filter((t) => t.id !== tag.id))
        setError(e.message)
      }
    })()
    return tag
  }

  /** Per-owner share rows for the upsert_transaction RPC p_shares parameter. */
  const shareRows = (tx: Transaction) => {
    const shares = effectiveShares(tx)
    return tx.owner_ids.map((pid) => ({ person_id: pid, amount_cents: shares[pid] ?? 0 }))
  }

  // Returns whether the row actually persisted, so bulk callers (CSV import)
  // can await and report honest counts (review 2026-08-24). Interactive
  // callers may ignore the promise — the optimistic behavior is unchanged.
  const addTransaction = (tx: Transaction): Promise<boolean> => {
    setTransactions((prev) => [tx, ...prev])
    hapticConfirm() // spec 021, FR-012 — optimistic, so it fires immediately on tap
    return (async () => {
      const { error: e } = await supabase.rpc('upsert_transaction', {
        p_tx: txRecord(tx),
        p_shares: shareRows(tx),
      })
      if (e) {
        setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
        setError(e.message)
        return false
      }
      // Tags are independent metadata (no sum invariant): write after shares,
      // and a failure surfaces without rolling back the saved transaction (spec 027).
      const tagRes = await writeTags(tx)
      if (!tagRes.ok) setError(tagRes.error ?? 'Could not save this transaction’s tags.')
      return true
    })()
  }

  const updateTransaction = (tx: Transaction) => {
    const prevTx = transactions.find((t) => t.id === tx.id)
    setTransactions((prev) => prev.map((t) => (t.id === tx.id ? tx : t)))
    ;(async () => {
      const { error: e } = await supabase.rpc('upsert_transaction', {
        p_tx: txRecord(tx),
        p_shares: shareRows(tx),
      })
      if (e) {
        if (prevTx) setTransactions((prev) => prev.map((t) => (t.id === tx.id ? prevTx! : t)))
        setError(e.message)
        return
      }
      // Tags are independent metadata (no sum invariant): a failure surfaces
      // without rolling back the saved transaction (spec 027).
      const tagRes = await writeTags(tx)
      if (!tagRes.ok) setError(tagRes.error ?? 'Could not save this transaction’s tags.')
    })()
  }

  const deleteTransaction = (id: string) => {
    let removed: Transaction | undefined
    setTransactions((prev) => {
      removed = prev.find((t) => t.id === id)
      return prev.filter((t) => t.id !== id)
    })
    hapticDestructive() // spec 021, FR-012
    ;(async () => {
      // `.select('id')` returns the rows actually deleted. PostgREST reports
      // SUCCESS with zero rows for an RLS-filtered delete (a non-owner member
      // deleting a peer's row), which used to stand as deleted in the UI while
      // silently surviving server-side (review 2026-08-24, A5).
      const { data, error: e } = await supabase.from('transactions').delete().eq('id', id).select('id')
      if ((e || !data || data.length === 0) && removed) {
        setTransactions((prev) => [removed!, ...prev])
        setError(e ? e.message : t('Only the person who added a transaction (or the household owner) can delete it.'))
      }
    })()
  }

  const addCard = (name: string) => {
    if (!household) return
    const card: Card = {
      id: uuid(),
      household_id: household.id,
      name,
      created_at: new Date().toISOString(),
    }
    setCards((prev) => [...prev, card])
    ;(async () => {
      const { error: e } = await supabase
        .from('cards')
        .insert({ id: card.id, household_id: card.household_id, name: card.name })
      if (e) {
        setCards((prev) => prev.filter((c) => c.id !== card.id))
        setError(e.message)
      }
    })()
  }

  const deleteCard = (id: string) => {
    let removed: Card | undefined
    setCards((prev) => {
      removed = prev.find((c) => c.id === id)
      return prev.filter((c) => c.id !== id)
    })
    ;(async () => {
      const { error: e } = await supabase.from('cards').delete().eq('id', id)
      if (e && removed) {
        setCards((prev) => [...prev, removed!])
        setError(e.message)
      }
    })()
  }

  // Deposit accounts (spec 033) — mirrors addCard/deleteCard exactly.
  const addDepositAccount = (name: string) => {
    if (!household) return
    const account: DepositAccount = {
      id: uuid(),
      household_id: household.id,
      name,
      created_at: new Date().toISOString(),
    }
    setDepositAccounts((prev) => [...prev, account])
    ;(async () => {
      const { error: e } = await supabase
        .from('deposit_accounts')
        .insert({ id: account.id, household_id: account.household_id, name: account.name })
      if (e) {
        setDepositAccounts((prev) => prev.filter((a) => a.id !== account.id))
        setError(e.message)
      }
    })()
  }

  const deleteDepositAccount = (id: string) => {
    let removed: DepositAccount | undefined
    setDepositAccounts((prev) => {
      removed = prev.find((a) => a.id === id)
      return prev.filter((a) => a.id !== id)
    })
    ;(async () => {
      const { error: e } = await supabase.from('deposit_accounts').delete().eq('id', id)
      if (e && removed) {
        setDepositAccounts((prev) => [...prev, removed!])
        setError(e.message)
      }
    })()
  }

  // Throws on the first failed write so callers can roll back their optimistic
  // state and surface the error — a swallowed failure after the deletes would
  // silently destroy the property's mortgage/lease/units server-side while the
  // UI kept rendering them. (Like iOS, the server write itself is still not
  // atomic; failing loudly is the shared contract — see PARITY.md.)
  const writePropertySubtables = async (p: Property) => {
    orThrow(await supabase.from('mortgage_info').delete().eq('property_id', p.id))
    orThrow(await supabase.from('lease_info').delete().eq('property_id', p.id))
    orThrow(await supabase.from('units').delete().eq('property_id', p.id))
    if (p.mortgage) orThrow(await supabase.from('mortgage_info').insert({ ...p.mortgage, property_id: p.id }))
    if (p.lease) orThrow(await supabase.from('lease_info').insert({ ...p.lease, property_id: p.id }))
    if (p.units && p.units.length) {
      orThrow(
        await supabase
          .from('units')
          .insert(p.units.map((u, i) => ({ ...u, property_id: p.id, sort_order: i })))
      )
    }
  }

  const propRecord = (p: Property) => ({
    id: p.id,
    household_id: p.household_id,
    kind: p.kind,
    address: p.address,
    nickname: p.nickname,
  })

  const addProperty = (p: Property) => {
    setProperties((prev) => [...prev, p])
    ;(async () => {
      try {
        orThrow(await supabase.from('properties').insert(propRecord(p)))
        await writePropertySubtables(p)
      } catch (e) {
        setProperties((prev) => prev.filter((x) => x.id !== p.id))
        setError((e as Error).message)
      }
    })()
  }

  const updateProperty = (p: Property) => {
    let prev: Property | undefined
    setProperties((list) => {
      prev = list.find((x) => x.id === p.id)
      return list.map((x) => (x.id === p.id ? p : x))
    })
    ;(async () => {
      try {
        orThrow(await supabase.from('properties').update(propRecord(p)).eq('id', p.id))
        await writePropertySubtables(p)
      } catch (e) {
        if (prev) setProperties((list) => list.map((x) => (x.id === p.id ? prev! : x)))
        setError((e as Error).message)
      }
    })()
  }

  const deleteProperty = (id: string) => {
    let removed: Property | undefined
    let removedPayments: RentalPayment[] = []
    setProperties((prev) => {
      removed = prev.find((p) => p.id === id)
      return prev.filter((p) => p.id !== id)
    })
    setRentalPayments((prev) => {
      removedPayments = prev.filter((rp) => rp.property_id === id)
      return prev.filter((rp) => rp.property_id !== id)
    })
    hapticDestructive() // spec 021, FR-012
    ;(async () => {
      const { error: e } = await supabase.from('properties').delete().eq('id', id)
      if (e && removed) {
        setProperties((prev) => [...prev, removed!])
        // Restore the locally-cascaded payments too, or a failed delete
        // leaves the property back but its history gone until reload.
        setRentalPayments((prev) => [...removedPayments, ...prev])
        setError(e.message)
      }
    })()
  }

  const addRentalPayment = (p: RentalPayment) => {
    setRentalPayments((prev) => [p, ...prev])
    ;(async () => {
      const { error: e } = await supabase.from('rental_payments').insert({
        id: p.id,
        property_id: p.property_id,
        amount_cents: p.amount_cents,
        date: p.date,
        note: p.note,
      })
      if (e) {
        setRentalPayments((prev) => prev.filter((x) => x.id !== p.id))
        setError(e.message)
      }
    })()
  }

  const deleteRentalPayment = (id: string) => {
    let removed: RentalPayment | undefined
    setRentalPayments((prev) => {
      removed = prev.find((x) => x.id === id)
      return prev.filter((x) => x.id !== id)
    })
    ;(async () => {
      const { error: e } = await supabase.from('rental_payments').delete().eq('id', id)
      if (e && removed) {
        setRentalPayments((prev) => [removed!, ...prev])
        setError(e.message)
      }
    })()
  }

  const addOrUpdateBudget = (b: Budget) => {
    // spec 054: a budget's identity is (household, category, PERSON) — a household
    // budget and one person's budget can both cover Dining, and saving one must never
    // overwrite the other. Mirrors the DB's `unique nulls not distinct` constraint.
    const sameBudget = (x: Budget) =>
      x.category === b.category &&
      x.household_id === b.household_id &&
      (x.person_id ?? null) === (b.person_id ?? null)
    let prevBudget: Budget | undefined
    setBudgets((prev) => {
      prevBudget = prev.find(sameBudget)
      return prevBudget ? prev.map((x) => (sameBudget(x) ? b : x)) : [...prev, b]
    })
    ;(async () => {
      // No `id` in the payload: PostgREST's merge-duplicates upsert would
      // DO UPDATE SET every supplied column — a second device saving the same
      // (household, category, person) budget with a fresh uuid would churn the
      // row's PK (review 2026-08-24). The conflict target keeps the stored id.
      const { error: e } = await supabase.from('budgets').upsert(
        {
          household_id: b.household_id,
          category: b.category,
          monthly_limit_cents: b.monthly_limit_cents,
          budget_type: b.budget_type,
          // flex-only; store null for the other types so a stale cap never lingers.
          rollover_cap_cents: b.budget_type === 'flex' ? b.rollover_cap_cents : null,
          person_id: b.person_id,
        },
        { onConflict: 'household_id,category,person_id' }
      )
      if (e) {
        // Roll back the optimistic value (matches iOS) — keeping it would
        // show a limit the server never accepted.
        setBudgets((prev) =>
          prevBudget
            ? prev.map((x) => (sameBudget(x) ? prevBudget! : x))
            : prev.filter((x) => !sameBudget(x))
        )
        setError(e.message)
      }
    })()
  }

  const deleteBudget = (id: string) => {
    let removed: Budget | undefined
    setBudgets((prev) => {
      removed = prev.find((b) => b.id === id)
      return prev.filter((b) => b.id !== id)
    })
    ;(async () => {
      const { error: e } = await supabase.from('budgets').delete().eq('id', id)
      if (e && removed) {
        setBudgets((prev) => [...prev, removed!])
        setError(e.message)
      }
    })()
  }

  // ---- goals CRUD (spec 027) ----
  // Optimistic-with-rollback, the budgets/transactions pattern: state updates
  // immediately, the write runs async, and a failure restores prior state and
  // sets the error banner.
  const addGoal = (g: Goal) => {
    setGoals((prev) => [...prev, g])
    ;(async () => {
      const { error: e } = await supabase.from('goals').insert({
        id: g.id,
        household_id: g.household_id,
        name: g.name,
        kind: g.kind,
        target_cents: g.target_cents,
        target_date: g.target_date,
        linked_account_id: g.linked_account_id,
        linked_category: g.linked_category,
        created_by: g.created_by,
      })
      if (e) {
        setGoals((prev) => prev.filter((x) => x.id !== g.id))
        setError(e.message)
      }
    })()
  }

  const updateGoal = (g: Goal) => {
    let prev: Goal | undefined
    setGoals((cur) => {
      prev = cur.find((x) => x.id === g.id)
      return cur.map((x) => (x.id === g.id ? g : x))
    })
    ;(async () => {
      const { error: e } = await supabase
        .from('goals')
        .update({
          name: g.name,
          kind: g.kind,
          target_cents: g.target_cents,
          target_date: g.target_date,
          linked_account_id: g.linked_account_id,
          linked_category: g.linked_category,
        })
        .eq('id', g.id)
      if (e) {
        setGoals((cur) => (prev ? cur.map((x) => (x.id === g.id ? prev! : x)) : cur))
        setError(e.message)
      }
    })()
  }

  const deleteGoal = (id: string) => {
    let removedGoal: Goal | undefined
    let removedContribs: GoalContribution[] = []
    setGoals((prev) => {
      removedGoal = prev.find((x) => x.id === id)
      return prev.filter((x) => x.id !== id)
    })
    // Contributions cascade server-side (FK on delete cascade); drop them from
    // state too so the UI is consistent immediately.
    setGoalContributions((prev) => {
      removedContribs = prev.filter((c) => c.goal_id === id)
      return prev.filter((c) => c.goal_id !== id)
    })
    ;(async () => {
      const { error: e } = await supabase.from('goals').delete().eq('id', id)
      if (e) {
        if (removedGoal) setGoals((prev) => [...prev, removedGoal!])
        if (removedContribs.length) setGoalContributions((prev) => [...prev, ...removedContribs])
        setError(e.message)
      }
    })()
  }

  const addContribution = (c: GoalContribution) => {
    setGoalContributions((prev) => [c, ...prev])
    ;(async () => {
      const { error: e } = await supabase.from('goal_contributions').insert({
        id: c.id,
        goal_id: c.goal_id,
        amount_cents: c.amount_cents,
        date: c.date,
        note: c.note,
        created_by: c.created_by,
      })
      if (e) {
        setGoalContributions((prev) => prev.filter((x) => x.id !== c.id))
        setError(e.message)
      }
    })()
  }

  /** Correct a recorded contribution (spec 045 US3) — a goal's saved total is the
   *  sum of its contributions, so a mistyped one made the whole total untrustworthy
   *  with no remedy short of deleting the goal. Optimistic with rollback, mirroring
   *  `updateGoal`. Only the three user-editable columns are written: an edit never
   *  re-parents a contribution to another goal (that would silently move money
   *  between two goals from a form showing one) and never rewrites who recorded it. */
  const updateContribution = (c: GoalContribution) => {
    let prev: GoalContribution | undefined
    setGoalContributions((cur) => {
      prev = cur.find((x) => x.id === c.id)
      return cur.map((x) => (x.id === c.id ? c : x))
    })
    ;(async () => {
      const { error: e } = await supabase
        .from('goal_contributions')
        .update({
          amount_cents: c.amount_cents,
          date: c.date,
          note: c.note,
        })
        .eq('id', c.id)
      if (e) {
        setGoalContributions((cur) => (prev ? cur.map((x) => (x.id === c.id ? prev! : x)) : cur))
        setError(e.message)
      }
    })()
  }

  const deleteContribution = (id: string) => {
    let removed: GoalContribution | undefined
    setGoalContributions((prev) => {
      removed = prev.find((c) => c.id === id)
      return prev.filter((c) => c.id !== id)
    })
    ;(async () => {
      const { error: e } = await supabase.from('goal_contributions').delete().eq('id', id)
      if (e && removed) {
        setGoalContributions((prev) => [removed!, ...prev])
        setError(e.message)
      }
    })()
  }

  // ---- Financial Health (spec 041) — user-scoped, deliberate form submits ----
  // Optimistic state + await write + setError on failure, mirroring the
  // deposit-accounts pattern (no .insert().select() chaining, which the test mock
  // doesn't model); the next loadAll reconciles any server-side defaults.
  const saveFinancialProfile = async (
    input: Omit<FinancialProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ) => {
    if (!currentUserId) return
    const now = new Date().toISOString()
    // Reuse the existing row id (so re-saves update in place); generate one on first save.
    const row: FinancialProfile = {
      id: userFinancialProfile?.id ?? uuid(),
      user_id: currentUserId,
      created_at: userFinancialProfile?.created_at ?? now,
      updated_at: now,
      ...input,
    }
    setUserFinancialProfile(row)
    // Do NOT send `id` in the upsert: on conflict (user_id) Postgres would set the
    // primary key to this fresh uuid, churning the PK on any device that saves
    // before it has loaded the existing row. Omitting it keeps the existing row's
    // id on update and lets the default generate it on first insert.
    const { id: _id, ...payload } = row
    const { error: e } = await supabase
      .from('user_financial_profile')
      .upsert(payload, { onConflict: 'user_id' })
    if (e) setError(e.message)
  }

  const saveFixedCosts = async (costs: Array<Pick<FixedCost, 'label' | 'amount_cents' | 'kind'>>) => {
    if (!currentUserId) return
    const now = new Date().toISOString()
    const rows: FixedCost[] = costs.map((c) => ({
      id: uuid(),
      user_id: currentUserId,
      label: c.label,
      amount_cents: c.amount_cents,
      kind: c.kind,
      created_at: now,
    }))
    const prevRows = userFixedCosts
    setUserFixedCosts(rows)
    // Replace-all: clear then re-insert the batch. Both failure points roll the
    // optimistic state back, and a failed insert best-effort restores the prior
    // rows server-side — the UI must never keep showing costs the server lost
    // (review 2026-08-24).
    const { error: delErr } = await supabase.from('user_fixed_costs').delete().eq('user_id', currentUserId)
    if (delErr) {
      setUserFixedCosts(prevRows)
      setError(delErr.message)
      return
    }
    if (rows.length === 0) return
    const { error: insErr } = await supabase.from('user_fixed_costs').insert(rows)
    if (insErr) {
      if (prevRows.length > 0) await supabase.from('user_fixed_costs').insert(prevRows)
      setUserFixedCosts(prevRows)
      setError(insErr.message)
    }
  }

  const saveDimensionWeights = async (weights: Array<Pick<DimensionWeight, 'dimension' | 'weight'>>) => {
    if (!currentUserId) return
    const now = new Date().toISOString()
    const rows: DimensionWeight[] = weights.map((w) => ({
      id: uuid(),
      user_id: currentUserId,
      dimension: w.dimension,
      weight: w.weight,
      created_at: now,
    }))
    const prevRows = userDimensionWeights
    setUserDimensionWeights(rows)
    // Replace-all keeps it simple (there are only ~5 rows) and avoids upsert PK
    // churn. Same rollback discipline as saveFixedCosts (review 2026-08-24).
    const { error: delErr } = await supabase.from('user_dimension_weights').delete().eq('user_id', currentUserId)
    if (delErr) {
      setUserDimensionWeights(prevRows)
      setError(delErr.message)
      return
    }
    if (rows.length === 0) return
    const { error: insErr } = await supabase.from('user_dimension_weights').insert(rows)
    if (insErr) {
      if (prevRows.length > 0) await supabase.from('user_dimension_weights').insert(prevRows)
      setUserDimensionWeights(prevRows)
      setError(insErr.message)
    }
  }

  const writeHealthSnapshot = async (score: number, band: HealthBand) => {
    if (!currentUserId) return
    const row: HealthSnapshot = {
      id: uuid(),
      user_id: currentUserId,
      score,
      band,
      created_at: new Date().toISOString(),
    }
    setHealthSnapshots((prev) => [...prev, row])
    const { error: e } = await supabase.from('financial_health_snapshots').insert(row)
    if (e) setError(e.message)
  }

  const saveFinancialHealth = async (args: {
    profile: Omit<FinancialProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>
    costs: Array<Pick<FixedCost, 'label' | 'amount_cents' | 'kind'>>
    weights: Array<Pick<DimensionWeight, 'dimension' | 'weight'>>
    score: number
    band: HealthBand
  }) => {
    await saveFinancialProfile(args.profile)
    await saveFixedCosts(args.costs)
    await saveDimensionWeights(args.weights)
    await writeHealthSnapshot(args.score, args.band)
  }

  // ---- Financial Routines (spec 044) — household-scoped ----
  // Detection is always recomputed live from `transactions` (README's "derived, never stored");
  // only the confirm/dismiss/rename overlay persists. Recomputed on every transactions/state change
  // — cheap relative to a household's realistic transaction volume, same precedent as insights.ts.
  const routines = useMemo(
    () => applyRoutineStates(detectRoutines(transactions, new Date()), recognizedRoutineStates),
    [transactions, recognizedRoutineStates]
  )

  const upsertRoutineState = async (
    routineKey: string,
    patch: Partial<Pick<RecognizedRoutineState, 'status' | 'label' | 'person_id'>>
  ) => {
    if (!household || !currentUserId) return
    const now = new Date().toISOString()
    const existing = recognizedRoutineStates.find((s) => s.routine_key === routineKey)
    const row: RecognizedRoutineState = {
      id: existing?.id ?? uuid(),
      household_id: household.id,
      routine_key: routineKey,
      status: existing?.status ?? 'confirmed',
      label: existing?.label ?? null,
      person_id: existing?.person_id ?? null,
      created_by: existing?.created_by ?? currentUserId,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      ...patch,
    }
    setRecognizedRoutineStates((prev) => [...prev.filter((s) => s.routine_key !== routineKey), row])
    const { id: _id, ...payload } = row
    const { error: e } = await supabase
      .from('recognized_routine_states')
      .upsert(payload, { onConflict: 'household_id,routine_key' })
    if (e) setError(e.message)
  }

  const confirmRoutine = async (routineKey: string, personId?: string | null) =>
    upsertRoutineState(routineKey, { status: 'confirmed', ...(personId !== undefined ? { person_id: personId } : {}) })
  const dismissRoutine = async (routineKey: string) => upsertRoutineState(routineKey, { status: 'dismissed' })
  // recognized_routine_states.status only has room for 'confirmed'/'dismissed' (there is no
  // persisted 'recognized' — that's simply the absence of a row). Renaming a not-yet-reviewed
  // routine is a real engagement signal, so it defaults to 'confirmed' on first write via
  // upsertRoutineState's fallback; renaming an already-dismissed routine leaves it dismissed
  // (no explicit status patch here).
  const renameRoutine = async (routineKey: string, label: string) => upsertRoutineState(routineKey, { label })

  // ---- Location consent + opportunistic visit capture (spec 044 US4) — user-scoped ----
  const setLocationConsent = async (level: LocationConsentLevel) => {
    if (!currentUserId) return
    const now = new Date().toISOString()
    const previousLevel = locationConsent?.level ?? 'off'
    const { grantedAt, revokedAt } = consentTransition(previousLevel, level, now)
    const row: LocationConsent = {
      id: locationConsent?.id ?? uuid(),
      user_id: currentUserId,
      level,
      granted_at: grantedAt ?? locationConsent?.granted_at ?? null,
      revoked_at: revokedAt ?? locationConsent?.revoked_at ?? null,
      created_at: locationConsent?.created_at ?? now,
      updated_at: now,
    }
    setLocationConsentState(row)
    const { id: _id, ...payload } = row
    const { error: e } = await supabase.from('user_location_consent').upsert(payload, { onConflict: 'user_id' })
    if (e) {
      setError(e.message)
      return
    }
    // FR-015: revoking cascades to delete every captured visit, within this session.
    if (shouldDeleteVisitsOnTransition(previousLevel, level)) {
      setRoutineVisits([])
      const { error: delErr } = await supabase.from('user_routine_visits').delete().eq('user_id', currentUserId)
      if (delErr) setError(delErr.message)
    }
  }

  // Lazy-loaded (not part of loadAll's boot Promise.all — data-model.md): only fetched when a
  // surface actually needs visit-cluster suggestions, and only meaningful once opted into
  // 'foreground_capture'.
  // Returns the loaded rows as well as setting state: the caller's throttle
  // check needs the FRESH rows, not a stale closure over the previous render's
  // state (review 2026-08-24).
  const loadRoutineVisits = async (): Promise<UserRoutineVisitRow[]> => {
    if (!currentUserId) return []
    const { data, error: e } = await supabase.from('user_routine_visits').select('*').eq('user_id', currentUserId)
    if (e) {
      setError(e.message)
      return []
    }
    const rows = (data ?? []) as UserRoutineVisitRow[]
    setRoutineVisits(rows)
    return rows
  }

  const recordRoutineVisit = async (latitude: number, longitude: number, accuracyMeters: number | null) => {
    if (!currentUserId || !household || locationConsent?.level !== 'foreground_capture') return
    const row: RoutineVisit = {
      id: uuid(),
      user_id: currentUserId,
      household_id: household.id,
      captured_at: new Date().toISOString(),
      latitude,
      longitude,
      accuracy_meters: accuracyMeters,
      created_at: new Date().toISOString(),
    }
    setRoutineVisits((prev) => [...prev, row])
    const { error: e } = await supabase.from('user_routine_visits').insert(row)
    if (e) setError(e.message)
  }

  const updateHouseholdName = (name: string) => {
    if (!household) return
    const prevName = household.name
    setHousehold({ ...household, name })
    ;(async () => {
      const { error: e } = await supabase.from('households').update({ name }).eq('id', household.id)
      if (e) {
        setHousehold((h) => (h ? { ...h, name: prevName } : h))
        setError(e.message)
      }
    })()
  }

  // ---- people CRUD ----
  const addPerson = (name: string, colorKey = 'sage') => {
    if (!household) return
    const trimmed = name.trim()
    if (!trimmed) return
    const p: Person = {
      id: uuid(),
      household_id: household.id,
      name: trimmed,
      initial: (trimmed[0] ?? '·').toUpperCase(),
      color_key: colorKey,
      linked_user_id: null,
      sort_order: people.length,
      removed_at: null,
      created_at: new Date().toISOString(),
    }
    setPeople((prev) => [...prev, p])
    ;(async () => {
      const { error: e } = await supabase.from('household_people').insert({
        id: p.id,
        household_id: p.household_id,
        name: p.name,
        initial: p.initial,
        color_key: p.color_key,
        linked_user_id: null,
        sort_order: p.sort_order,
      })
      if (e) {
        setPeople((prev) => prev.filter((x) => x.id !== p.id))
        setError(e.message)
      }
    })()
  }

  const renamePerson = (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const initial = (trimmed[0] ?? '·').toUpperCase()
    let prev: Person | undefined
    setPeople((list) => {
      prev = list.find((p) => p.id === id)
      return list.map((p) => (p.id === id ? { ...p, name: trimmed, initial } : p))
    })
    ;(async () => {
      const { error: e } = await supabase
        .from('household_people')
        .update({ name: trimmed, initial })
        .eq('id', id)
      if (e) {
        if (prev) setPeople((list) => list.map((p) => (p.id === id ? prev! : p)))
        setError(e.message)
      }
    })()
  }

  const setPersonColor = (id: string, colorKey: string) => {
    let prev: Person | undefined
    setPeople((list) => {
      prev = list.find((p) => p.id === id)
      return list.map((p) => (p.id === id ? { ...p, color_key: colorKey } : p))
    })
    ;(async () => {
      const { error: e } = await supabase.from('household_people').update({ color_key: colorKey }).eq('id', id)
      if (e) {
        if (prev) setPeople((list) => list.map((p) => (p.id === id ? prev! : p)))
        setError(e.message)
      }
    })()
  }

  const removePerson = (id: string) => {
    const at = new Date().toISOString()
    let prev: Person | undefined
    setPeople((list) => {
      prev = list.find((p) => p.id === id)
      return list.map((p) => (p.id === id ? { ...p, removed_at: at } : p))
    })
    ;(async () => {
      const { error: e } = await supabase.from('household_people').update({ removed_at: at }).eq('id', id)
      if (e) {
        if (prev) setPeople((list) => list.map((p) => (p.id === id ? prev! : p)))
        setError(e.message)
      }
    })()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = signInHref()
  }

  // Stable services surface — memoized so unrelated data changes don't churn its
  // identity (US6/P4). Each member is itself memoized to its real inputs above.
  const services: AppServices = useMemo(
    () => ({ rate, formatMoney, t, resolveUser, ownersDisplay }),
    [rate, formatMoney, t, resolveUser, ownersDisplay]
  )

  // Changing-data surface — a fresh object each provider render (it only re-renders
  // when its own state changes, which is exactly when this should change).
  const data: AppData = {
    loading,
    error,
    bootstrapFailed,
    currentUserId,
    currentUserEmail,
    currentUser,
    currentPersonId,
    currentHousehold: household,
    users,
    people: activePeople,
    householdMembers,
    transactions,
    tags,
    cards,
    depositAccounts,
    properties,
    rentalPayments,
    budgets,
    goals,
    goalContributions,
    userFinancialProfile,
    userFixedCosts,
    userDimensionWeights,
    healthSnapshots,
    recognizedRoutineStates,
    merchantGeocodes,
    locationConsent,
    setLocationConsent,
    routineVisits,
    loadRoutineVisits,
    recordRoutineVisit,
    currency,
    rates,
    ratesLastFetched,
    ratesIsLoading,
    ratesError,
    language,
    locale,
    entitlement,
    gateState,
    refreshEntitlement,
    linkedInstitutions,
    linkedAccounts,
    refreshLinkedBanks,
    setCurrency,
    chooseLanguage,
    categoryExpenseTotal,
    monthlySpentBy,
    spentBy,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addTag,
    addCard,
    deleteCard,
    addDepositAccount,
    deleteDepositAccount,
    addProperty,
    updateProperty,
    deleteProperty,
    addRentalPayment,
    deleteRentalPayment,
    addOrUpdateBudget,
    deleteBudget,
    addGoal,
    updateGoal,
    deleteGoal,
    addContribution,
    updateContribution,
    deleteContribution,
    saveFinancialProfile,
    saveFixedCosts,
    saveDimensionWeights,
    writeHealthSnapshot,
    saveFinancialHealth,
    routines,
    confirmRoutine,
    dismissRoutine,
    renameRoutine,
    updateHouseholdName,
    addPerson,
    renamePerson,
    setPersonColor,
    removePerson,
    refreshRates,
    signOut,
    dismissError: () => setError(null),
    retryBootstrap,
  }

  return (
    <DataCtx.Provider value={data}>
      <ServicesCtx.Provider value={services}>{children}</ServicesCtx.Provider>
    </DataCtx.Provider>
  )
}

export { paletteFor }
