'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createClient } from './supabase/client'
import { formatMoney as fmtMoney, type CurrencyKey } from './finance/money'
import { FALLBACK_RATE_FROM_USD } from './finance/currency'
import { effectiveShares } from './format'
import { CATEGORIES, paletteFor } from './categories'
import {
  DEFAULT_LANGUAGE,
  DEFAULT_LOCALE,
  asLanguage,
  localeForLanguage,
  type Language,
} from './language'
import { makeT, type Translate } from './i18n'
import {
  generateInviteCode,
  formatInviteCode,
  canonicalizeInviteCode,
  hashInviteCode,
  INVITE_CODE_LENGTH,
  INVITE_TTL_MS,
} from './invites'
import type {
  User,
  Person,
  Household,
  Transaction,
  TransactionShare,
  Card,
  Property,
  MortgageInfo,
  LeaseInfo,
  Unit,
  RentalPayment,
  Budget,
  TransactionCategory,
  PendingInvite,
  MembershipRole,
} from './types'

const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000'

/** Per-browser record of which household opens on launch (spec 017 FR-018/019). */
const PREFERRED_HOUSEHOLD_KEY = 'preferredHouseholdId'

type MembershipStatus = 'unknown' | 'none' | 'member'

interface MembershipRow {
  household_id: string
  role?: string
  user_id?: string
  created_at?: string
}

export type RedeemResult =
  | { ok: true; householdId: string }
  | { ok: false; reason: 'invalid' | 'already-member' | 'load-failed' }

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
  /** The signed-in user's role in the current household (spec 017). Gates the
   *  invite card (owners only) and the identity-claim step (members only). */
  currentRole: MembershipRole | null
  /** The household's pending/redeemed/expired invites, newest first — owners
   *  only (RLS yields zero rows for members). Never carries token material. */
  invites: PendingInvite[]
  /** 'none' ⇒ the signed-in user belongs to no household and the shell shows
   *  the join/start-fresh gate instead of tab content (spec 017 FR-008). */
  membershipStatus: MembershipStatus
  users: User[]
  /** Active (non-removed) household people, in display order. Owners are People. */
  people: Person[]
  householdMembers: User[]
  transactions: Transaction[]
  cards: Card[]
  properties: Property[]
  rentalPayments: RentalPayment[]
  budgets: Budget[]
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
  addTransaction: (tx: Transaction) => void
  updateTransaction: (tx: Transaction) => void
  deleteTransaction: (id: string) => void
  addCard: (name: string) => void
  deleteCard: (id: string) => void
  addProperty: (p: Property) => void
  updateProperty: (p: Property) => void
  deleteProperty: (id: string) => void
  addRentalPayment: (p: RentalPayment) => void
  deleteRentalPayment: (id: string) => void
  addOrUpdateBudget: (b: Budget) => void
  deleteBudget: (id: string) => void
  updateHouseholdName: (name: string) => void
  /** Create a one-time partner invite (owners). Resolves the DISPLAY-format
   *  code exactly once — it is never retrievable again (spec 017 FR-001/005). */
  createInvite: () => Promise<{ ok: true; code: string } | { ok: false }>
  /** Revoke (delete) a pending invite — optimistic with rollback (FR-007). */
  revokeInvite: (id: string) => void
  /** The gate's "Start fresh": runs the pre-017 create path on the user's
   *  explicit choice — identical inserts, identical outcome (FR-008/024). */
  startFresh: () => Promise<void>
  /** Redeem an invite code (any typed form). Never throws; never leaves a
   *  half-joined UI state (FR-011/012/013). */
  redeemInvite: (code: string) => Promise<RedeemResult>
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

const Ctx = createContext<AppStateValue | null>(null)

export function useApp(): AppStateValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used within AppStateProvider')
  return v
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
function isKnownTransactionRow(r: Transaction): boolean {
  return KNOWN_KINDS.has(r.kind) && r.category in CATEGORIES
}

/** Attach owner_ids (person ids) + per-owner cents shares to each transaction
 *  from its `transaction_shares` rows. A row with no shares falls back to its
 *  creator's person at the full amount (defensive — post-migration all rows
 *  carry materialized shares). Rows with an unknown kind/category are dropped
 *  (see `isKnownTransactionRow`). */
function rehydrateTransactions(
  rows: Transaction[],
  shares: TransactionShare[],
  personForUser: (createdBy: string) => string
): Transaction[] {
  const byTx = new Map<string, TransactionShare[]>()
  for (const s of shares) {
    const arr = byTx.get(s.transaction_id) ?? []
    arr.push(s)
    byTx.set(s.transaction_id, arr)
  }
  return rows.filter(isKnownTransactionRow).map((r) => {
    const sh = byTx.get(r.id) ?? []
    if (sh.length === 0) {
      // A transfer (reimbursement) is directional, not co-owned — never synthesize
      // creator-owns-all for it (that would misread it as an expense).
      if (r.kind === 'transfer') return { ...r, owner_ids: [], shares: {} }
      const pid = personForUser(r.created_by)
      return { ...r, owner_ids: [pid], shares: { [pid]: r.amount_cents } }
    }
    const owner_ids = sh.map((s) => s.person_id)
    const sharesMap = sh.reduce<Record<string, number>>((m, s) => ((m[s.person_id] = s.amount_cents), m), {})
    return { ...r, owner_ids, shares: sharesMap }
  })
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
  const [currentRole, setCurrentRole] = useState<MembershipRole | null>(null)
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus>('unknown')
  /** The signed-in account's profile row — needed by the gate actions
   *  (startFresh/redeemInvite) that run after bootstrap paused at 'none'. */
  const meRef = useRef<User | null>(null)
  /** Household ids the user is known to belong to (already-member detection). */
  const membershipIdsRef = useRef<string[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [rentalPayments, setRentalPayments] = useState<RentalPayment[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
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
  const booted = useRef(false)

  // ---- preferences (localStorage) ----
  useEffect(() => {
    const c = localStorage.getItem('currency') as CurrencyKey | null
    if (c) setCurrencyState(c)
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

  const t = useMemo(() => makeT(language), [language])

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
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) {
        setLoading(false)
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

      meRef.current = me

      // Read EVERY membership (spec 017): a user may belong to more than one
      // household (their own + a joined one). The read MUST fail loudly: if a
      // transient error were treated as "no membership", we would show the
      // join/start-fresh gate to an established user.
      const { data: membershipRows } = orThrow(
        await supabase
          .from('household_members')
          .select('household_id, role, user_id, created_at')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: true })
      )
      // Client-side filter/sort mirror the query — they also keep the
      // permissive test mock honest (its eq/order are recorded no-ops).
      const memberships = ((membershipRows ?? []) as MembershipRow[])
        .filter((r) => r.user_id === undefined || r.user_id === authUser.id)
        .sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1))
      membershipIdsRef.current = memberships.map((m) => m.household_id)

      if (memberships.length === 0) {
        // No household yet: never create one silently (spec 017 FR-008). The
        // shell renders the join/start-fresh gate; the create path now runs
        // only on the user's explicit choice (startFresh).
        setMembershipStatus('none')
        return
      }

      // Deterministic selection (FR-018): the persisted preference when it is
      // still a membership, else the oldest membership — never `.limit(1)`
      // roulette.
      const preferred = localStorage.getItem(PREFERRED_HOUSEHOLD_KEY)
      const picked = memberships.find((m) => m.household_id === preferred) ?? memberships[0]
      // Legacy test fixtures may omit `role` (NOT NULL in the real schema);
      // every pre-017 user is the owner of their own household.
      await enterHousehold(picked.household_id, (picked.role as MembershipRole | undefined) ?? 'owner', me)
    } catch (e) {
      setBootstrapFailed(true)
      setError(`Failed to load: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const retryBootstrap = () => {
    void runBootstrap()
  }

  /** Open a household: role capture, owner-only Person ensure, full load,
   *  preference persist. Shared by bootstrap, startFresh, and redeemInvite
   *  (spec 017). Throws on load failure — callers decide how to surface it. */
  async function enterHousehold(householdId: string, role: MembershipRole, me: User) {
    // Name read is display-only — a failure here must not block entry.
    let householdName = 'Home'
    let ownerId = me.id
    const { data: h } = await supabase
      .from('households')
      .select('*')
      .eq('id', householdId)
      .single()
    if (h) {
      householdName = (h as Household).name
      ownerId = (h as Household).owner_id ?? me.id
    }
    setCurrentRole(role)
    // The account-holder Person auto-create belongs ONLY to owners (the
    // pre-017 behavior, preserved byte-for-byte). A member-role joiner claims
    // their existing Person instead — auto-creating here would fork a
    // duplicate identity and orphan their history (spec 017 FR-014/016).
    if (role === 'owner') {
      await ensureAccountPersonAndFoldLegacy(householdId, me)
    }
    await loadAll(householdId, householdName, ownerId)
    localStorage.setItem(PREFERRED_HOUSEHOLD_KEY, householdId)
    if (!membershipIdsRef.current.includes(householdId)) {
      membershipIdsRef.current = [...membershipIdsRef.current, householdId]
    }
    setMembershipStatus('member')
  }

  /** The gate's "Start fresh" — exactly the pre-017 first-run outcome
   *  (FR-008/024): a new household owned by the user, ready to use. */
  const startFresh = async () => {
    const me = meRef.current
    if (!me || membershipStatus !== 'none') return
    setLoading(true)
    setError(null)
    try {
      const householdId = uuid()
      orThrow(
        await supabase
          .from('households')
          .insert({ id: householdId, owner_id: me.id, name: 'Home' })
      )
      orThrow(
        await supabase
          .from('household_members')
          .insert({ household_id: householdId, user_id: me.id, role: 'owner' })
      )
      await enterHousehold(householdId, 'owner', me)
    } catch (e) {
      setError(`Failed to load: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  /** Redeem an invite code. The single calm failure ('invalid') never reveals
   *  whether a code existed (FR-012); 'already-member' means the RPC returned
   *  a household the user already belongs to (FR-013 — the code is consumed,
   *  nothing else changes). */
  const redeemInvite = async (input: string): Promise<RedeemResult> => {
    const me = meRef.current
    if (!me) return { ok: false, reason: 'invalid' }
    const canonical = canonicalizeInviteCode(input)
    // A malformed code can never match a hash — fail locally, no RPC probe.
    if (canonical.length !== INVITE_CODE_LENGTH) return { ok: false, reason: 'invalid' }
    const { data, error: e } = await supabase.rpc('accept_invite', { p_token: canonical })
    if (e || typeof data !== 'string' || data.length === 0) {
      return { ok: false, reason: 'invalid' }
    }
    const householdId = data
    if (membershipIdsRef.current.includes(householdId)) {
      return { ok: false, reason: 'already-member' }
    }
    try {
      // Invites always confer the standard member role (data-model.md).
      await enterHousehold(householdId, 'member', me)
      return { ok: true, householdId }
    } catch (err) {
      // The membership exists server-side (the RPC succeeded) but the load
      // failed — surface the error; the next launch resumes into the
      // household via the normal bootstrap (no partial UI state tonight).
      setError(`Failed to load: ${(err as Error).message}`)
      return { ok: false, reason: 'load-failed' }
    }
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
      setCurrentRole(null)
      setInvites([])
      setMembershipStatus('unknown')
      meRef.current = null
      membershipIdsRef.current = []
      setTransactions([])
      setCards([])
      setProperties([])
      setRentalPayments([])
      setBudgets([])
      window.location.assign('/sign-in')
    })
    return () => data.subscription.unsubscribe()
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
        for (const lu of legacy) {
          await supabase.from('household_people').insert({
            id: uuid(),
            household_id: householdId,
            name: lu.name,
            initial: lu.initial ?? (lu.name?.[0]?.toUpperCase() || '·'),
            color_key: lu.color_key ?? 'sand',
            linked_user_id: null,
            sort_order: order++,
          })
        }
        localStorage.removeItem('localUsers')
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
      invitesRes,
    ] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('household_people').select('*').eq('household_id', householdId).order('sort_order', { ascending: true }),
      // Household-scoped (spec 017): a user can now belong to multiple
      // households, and another household's rows must never merge into this
      // one. Legacy personal transactions (household_id NULL — the old iOS
      // importers wrote them) stay visible via the disjunction; RLS already
      // limits NULL rows to their creator.
      supabase.from('transactions').select('*').or(`household_id.eq.${householdId},household_id.is.null`).order('date', { ascending: false }),
      supabase.from('transaction_shares').select('*'),
      supabase.from('cards').select('*').eq('household_id', householdId).order('created_at', { ascending: true }),
      supabase.from('properties').select('*').eq('household_id', householdId).order('address', { ascending: true }),
      supabase.from('mortgage_info').select('*'),
      supabase.from('lease_info').select('*'),
      supabase.from('units').select('*').order('sort_order', { ascending: true }),
      supabase.from('rental_payments').select('*').order('date', { ascending: false }),
      supabase.from('budgets').select('*').eq('household_id', householdId),
      // Owners get the household's invites; members get zero rows via RLS —
      // an empty list, never an error (spec 017).
      supabase.from('pending_invites').select('*').eq('household_id', householdId).order('created_at', { ascending: false }),
    ])

    // A failed read must surface as an error, not render as a real-looking
    // empty state (matches iOS, which fails its bootstrap on any load error).
    for (const res of [usersRes, peopleRes, txRes, sharesRes, cardsRes, propsRes, mortRes, leaseRes, unitsRes, rpRes, budgetsRes, invitesRes]) {
      orThrow(res)
    }

    setUsers((usersRes.data as User[]) ?? [])
    const peopleRows = (peopleRes.data as Person[]) ?? []
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
    const txRows = (txRes.data as Transaction[]) ?? []
    setTransactions(rehydrateTransactions(txRows, (sharesRes.data as TransactionShare[]) ?? [], personForUser))
    setCards((cardsRes.data as Card[]) ?? [])

    // stitch properties
    const mort = new Map<string, MortgageInfo>(
      (mortRes.data ?? []).map((m: any) => [m.property_id as string, m as MortgageInfo])
    )
    const lease = new Map<string, LeaseInfo>(
      (leaseRes.data ?? []).map((l: any) => [l.property_id as string, l as LeaseInfo])
    )
    const unitsByProp = new Map<string, Unit[]>()
    for (const u of unitsRes.data ?? []) {
      const arr = unitsByProp.get(u.property_id) ?? []
      arr.push(u)
      unitsByProp.set(u.property_id, arr)
    }
    const props: Property[] = ((propsRes.data as Property[]) ?? []).map((p) => ({
      ...p,
      mortgage: mort.get(p.id),
      lease: lease.get(p.id),
      units: unitsByProp.get(p.id) ?? [],
    }))
    setProperties(props)
    setRentalPayments((rpRes.data as RentalPayment[]) ?? [])
    setBudgets((budgetsRes.data as Budget[]) ?? [])
    // Strip to the UI shape explicitly — token_hash must never enter state
    // (spec 017 FR-005).
    setInvites(
      (((invitesRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
        id: r.id,
        household_id: r.household_id,
        role: r.role,
        expires_at: r.expires_at,
        created_at: r.created_at,
        redeemed_at: r.redeemed_at ?? null,
      })) as PendingInvite[]).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    )
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

  const rate = (c: CurrencyKey) => rates[c] ?? FALLBACK_RATE_FROM_USD[c]
  const formatMoney = (cents: number, opts?: { leadingPlus?: boolean }) =>
    fmtMoney(cents, currency, rate(currency), opts?.leadingPlus ?? false, locale)

  // ---- owner (person) resolution ----
  const resolveUser = (id: string): User => {
    const p = people.find((x) => x.id === id)
    if (p) return personToUser(p)
    return { id: PLACEHOLDER_ID, name: 'Removed', initial: '·', color_key: 'sand', created_at: '' }
  }

  // Mirrors iOS AppState.ownersDisplay: every owner name comma-joined with the
  // first owner's real avatar — never a synthetic "Shared" chip or "A + B".
  const ownersDisplay = (tx: Transaction): OwnerDisplay => {
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
  }

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
    const now = new Date()
    return spentBy(personId, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1))
  }

  // ---- mutations (optimistic) ----
  /** Replace a transaction's owner-share rows. Returns whether the write fully
   *  succeeded so callers can keep the parent + shares atomic (a partial failure
   *  must never leave a share-less parent — see `addTransaction`/`updateTransaction`). */
  const writeShares = async (tx: Transaction): Promise<{ ok: boolean; error?: string }> => {
    const { error: delErr } = await supabase.from('transaction_shares').delete().eq('transaction_id', tx.id)
    if (delErr) return { ok: false, error: delErr.message }
    const shares = effectiveShares(tx)
    const rows = tx.owner_ids.map((pid) => ({
      transaction_id: tx.id,
      person_id: pid,
      amount_cents: shares[pid] ?? 0,
    }))
    if (rows.length) {
      const { error: insErr } = await supabase.from('transaction_shares').insert(rows)
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
  })

  const addTransaction = (tx: Transaction) => {
    setTransactions((prev) => [tx, ...prev])
    ;(async () => {
      const { error: e } = await supabase.from('transactions').insert(txRecord(tx))
      if (e) {
        setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
        setError(e.message)
        return
      }
      const res = await writeShares(tx)
      if (!res.ok) {
        // Shares failed to write — roll back the parent so no share-less
        // transaction survives (it would rehydrate as "creator owns all").
        // Matches iOS's all-or-nothing write.
        await supabase.from('transactions').delete().eq('id', tx.id)
        setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
        setError(res.error ?? 'Could not save who this transaction is split between.')
      }
    })()
  }

  const updateTransaction = (tx: Transaction) => {
    let prevTx: Transaction | undefined
    setTransactions((prev) => {
      prevTx = prev.find((t) => t.id === tx.id)
      return prev.map((t) => (t.id === tx.id ? tx : t))
    })
    ;(async () => {
      const { error: e } = await supabase.from('transactions').update(txRecord(tx)).eq('id', tx.id)
      if (e) {
        if (prevTx) setTransactions((prev) => prev.map((t) => (t.id === tx.id ? prevTx! : t)))
        setError(e.message)
        return
      }
      const res = await writeShares(tx)
      if (!res.ok) {
        // Shares failed to write — restore the prior transaction locally and
        // re-write its shares so the row never ends up share-less (atomic with iOS).
        if (prevTx) {
          setTransactions((prev) => prev.map((t) => (t.id === tx.id ? prevTx! : t)))
          await supabase.from('transactions').update(txRecord(prevTx)).eq('id', tx.id)
          await writeShares(prevTx)
        }
        setError(res.error ?? 'Could not save who this transaction is split between.')
      }
    })()
  }

  const deleteTransaction = (id: string) => {
    let removed: Transaction | undefined
    setTransactions((prev) => {
      removed = prev.find((t) => t.id === id)
      return prev.filter((t) => t.id !== id)
    })
    ;(async () => {
      const { error: e } = await supabase.from('transactions').delete().eq('id', id)
      if (e && removed) {
        setTransactions((prev) => [removed!, ...prev])
        setError(e.message)
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
    let prevBudget: Budget | undefined
    setBudgets((prev) => {
      prevBudget = prev.find((x) => x.category === b.category && x.household_id === b.household_id)
      return prevBudget
        ? prev.map((x) => (x.category === b.category && x.household_id === b.household_id ? b : x))
        : [...prev, b]
    })
    ;(async () => {
      const { error: e } = await supabase.from('budgets').upsert(
        {
          id: b.id,
          household_id: b.household_id,
          category: b.category,
          monthly_limit_cents: b.monthly_limit_cents,
        },
        { onConflict: 'household_id,category' }
      )
      if (e) {
        // Roll back the optimistic value (matches iOS) — keeping it would
        // show a limit the server never accepted.
        setBudgets((prev) =>
          prevBudget
            ? prev.map((x) => (x.category === b.category && x.household_id === b.household_id ? prevBudget! : x))
            : prev.filter((x) => !(x.category === b.category && x.household_id === b.household_id))
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

  // ---- partner invites (spec 017) ----
  /** Mint a one-time invite. Awaited (not fire-and-forget) because the raw
   *  code may be REVEALED only after the row is durably persisted — a failed
   *  insert must never leave the user holding a dead code. Only the SHA-256 of
   *  the canonical code is written; the raw code lives solely in the resolved
   *  value (FR-005). */
  const createInvite = async (): Promise<{ ok: true; code: string } | { ok: false }> => {
    if (!household) return { ok: false }
    const code = generateInviteCode()
    const tokenHash = await hashInviteCode(code)
    const now = Date.now()
    const invite: PendingInvite = {
      id: uuid(),
      household_id: household.id,
      role: 'member',
      expires_at: new Date(now + INVITE_TTL_MS).toISOString(),
      created_at: new Date(now).toISOString(),
      redeemed_at: null,
    }
    setInvites((prev) => [invite, ...prev])
    const { error: e } = await supabase.from('pending_invites').insert({
      id: invite.id,
      household_id: invite.household_id,
      role: invite.role,
      token_hash: tokenHash,
      expires_at: invite.expires_at,
      created_by: currentUserId,
    })
    if (e) {
      setInvites((prev) => prev.filter((i) => i.id !== invite.id))
      setError(e.message)
      return { ok: false }
    }
    return { ok: true, code: formatInviteCode(code) }
  }

  const revokeInvite = (id: string) => {
    let removed: PendingInvite | undefined
    let removedAt = -1
    setInvites((prev) => {
      removedAt = prev.findIndex((i) => i.id === id)
      removed = prev[removedAt]
      return prev.filter((i) => i.id !== id)
    })
    ;(async () => {
      const { error: e } = await supabase.from('pending_invites').delete().eq('id', id)
      if (e && removed) {
        // Restore at the original position so the list order stays stable.
        setInvites((prev) => {
          const next = [...prev]
          next.splice(Math.max(removedAt, 0), 0, removed!)
          return next
        })
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
    window.location.href = '/sign-in'
  }

  const value: AppStateValue = {
    loading,
    error,
    bootstrapFailed,
    currentUserId,
    currentUserEmail,
    currentUser,
    currentPersonId,
    currentHousehold: household,
    currentRole,
    invites,
    membershipStatus,
    users,
    people: activePeople,
    householdMembers,
    transactions,
    cards,
    properties,
    rentalPayments,
    budgets,
    currency,
    rates,
    ratesLastFetched,
    ratesIsLoading,
    ratesError,
    language,
    locale,
    setCurrency,
    chooseLanguage,
    rate,
    formatMoney,
    t,
    resolveUser,
    ownersDisplay,
    categoryExpenseTotal,
    monthlySpentBy,
    spentBy,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addCard,
    deleteCard,
    addProperty,
    updateProperty,
    deleteProperty,
    addRentalPayment,
    deleteRentalPayment,
    addOrUpdateBudget,
    deleteBudget,
    updateHouseholdName,
    createInvite,
    revokeInvite,
    startFresh,
    redeemInvite,
    addPerson,
    renamePerson,
    setPersonColor,
    removePerson,
    refreshRates,
    signOut,
    dismissError: () => setError(null),
    retryBootstrap,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { paletteFor }
