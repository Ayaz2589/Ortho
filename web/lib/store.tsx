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
import { paletteFor } from './categories'
import {
  DEFAULT_LANGUAGE,
  DEFAULT_LOCALE,
  asLanguage,
  localeForLanguage,
  type Language,
} from './language'
import type {
  User,
  Person,
  Household,
  Transaction,
  TransactionShare,
  Card,
  Property,
  RentalPayment,
  Budget,
  TransactionCategory,
} from './types'

const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000'

export interface OwnerDisplay {
  avatarUser: User
  label: string
  count: number
}

interface AppStateValue {
  loading: boolean
  error: string | null
  currentUserId: string
  currentUser: User | null
  /** The current account holder's Person (owner default), if resolved. */
  currentPersonId: string
  currentHousehold: Household | null
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
  /** Selected language picker option ("System" follows the browser). */
  language: Language
  /** BCP-47 locale derived from `language`, driving all Intl formatters. */
  locale: string

  setCurrency: (c: CurrencyKey) => void
  chooseLanguage: (language: Language) => void
  rate: (c: CurrencyKey) => number
  formatMoney: (cents: number, opts?: { leadingPlus?: boolean }) => string

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
  addPerson: (name: string, colorKey?: string) => void
  renamePerson: (id: string, name: string) => void
  setPersonColor: (id: string, colorKey: string) => void
  removePerson: (id: string) => void
  refreshRates: () => void
  signOut: () => Promise<void>
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

/** Attach owner_ids (person ids) + per-owner cents shares to each transaction
 *  from its `transaction_shares` rows. A row with no shares falls back to its
 *  creator's person at the full amount (defensive — post-migration all rows
 *  carry materialized shares). */
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
  return rows.map((r) => {
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
  const [currentUserId, setCurrentUserId] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [people, setPeople] = useState<Person[]>([]) // all people, incl. removed
  const [household, setHousehold] = useState<Household | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [rentalPayments, setRentalPayments] = useState<RentalPayment[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [currency, setCurrencyState] = useState<CurrencyKey>('usd')
  const [rates, setRates] = useState<Partial<Record<CurrencyKey, number>>>({})
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

  // ---- bootstrap ----
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()
        if (!authUser) {
          setLoading(false)
          return
        }
        setCurrentUserId(authUser.id)

        // ensure profile row
        const email = authUser.email ?? ''
        const local = email.split('@')[0] || 'Me'
        const name = local.charAt(0).toUpperCase() + local.slice(1)
        const me: User = {
          id: authUser.id,
          name,
          initial: name.charAt(0).toUpperCase() || 'M',
          color_key: 'sage',
          created_at: new Date().toISOString(),
        }
        await supabase.from('users').upsert(me, { onConflict: 'id' })

        // find or create household
        const { data: membership } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', authUser.id)
          .limit(1)
        let householdId: string
        let householdName = 'Home'
        if (membership && membership.length > 0) {
          householdId = membership[0].household_id
          const { data: h } = await supabase
            .from('households')
            .select('*')
            .eq('id', householdId)
            .single()
          if (h) householdName = h.name
        } else {
          householdId = uuid()
          await supabase
            .from('households')
            .insert({ id: householdId, owner_id: authUser.id, name: householdName })
          await supabase
            .from('household_members')
            .insert({ household_id: householdId, user_id: authUser.id, role: 'owner' })
        }

        // ensure the account holder has a Person row, then fold any legacy
        // device-only local users into household_people (one-time).
        await ensureAccountPersonAndFoldLegacy(householdId, me)

        await loadAll(householdId, householdName)
      } catch (e) {
        setError(`Failed to load: ${(e as Error).message}`)
      } finally {
        setLoading(false)
      }
    })()
    refreshRates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ensureAccountPersonAndFoldLegacy(householdId: string, me: User) {
    const { data: existing } = await supabase
      .from('household_people')
      .select('id, linked_user_id')
      .eq('household_id', householdId)
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

  async function loadAll(householdId: string, householdName: string) {
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
    ] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('household_people').select('*').eq('household_id', householdId).order('sort_order', { ascending: true }),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
      supabase.from('transaction_shares').select('*'),
      supabase.from('cards').select('*').order('created_at', { ascending: true }),
      supabase.from('properties').select('*').order('address', { ascending: true }),
      supabase.from('mortgage_info').select('*'),
      supabase.from('lease_info').select('*'),
      supabase.from('units').select('*').order('sort_order', { ascending: true }),
      supabase.from('rental_payments').select('*').order('date', { ascending: false }),
      supabase.from('budgets').select('*'),
    ])

    setUsers((usersRes.data as User[]) ?? [])
    const peopleRows = (peopleRes.data as Person[]) ?? []
    setPeople(peopleRows)
    setHousehold({
      id: householdId,
      owner_id: currentUserId,
      name: householdName,
      created_at: new Date().toISOString(),
    })
    const personForUser = (createdBy: string) =>
      peopleRows.find((p) => p.linked_user_id === createdBy)?.id ?? createdBy
    const txRows = (txRes.data as Transaction[]) ?? []
    setTransactions(rehydrateTransactions(txRows, (sharesRes.data as TransactionShare[]) ?? [], personForUser))
    setCards((cardsRes.data as Card[]) ?? [])

    // stitch properties
    const mort = new Map((mortRes.data ?? []).map((m: any) => [m.property_id, m]))
    const lease = new Map((leaseRes.data ?? []).map((l: any) => [l.property_id, l]))
    const unitsByProp = new Map<string, any[]>()
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
  }

  // ---- FX ----
  async function refreshRates() {
    try {
      const fetchedAt = Number(localStorage.getItem('fxRatesFetchedAt') ?? 0)
      const cached = localStorage.getItem('fxRates')
      if (cached && Date.now() - fetchedAt < 24 * 60 * 60 * 1000) {
        setRates(JSON.parse(cached))
        return
      }
      const res = await fetch('https://www.floatrates.com/daily/usd.json')
      if (!res.ok) throw new Error('rates')
      const json = await res.json()
      const next: Partial<Record<CurrencyKey, number>> = { usd: 1 }
      for (const key of Object.keys(FALLBACK_RATE_FROM_USD) as CurrencyKey[]) {
        if (key === 'usd') continue
        const entry = json[key]
        if (entry && typeof entry.rate === 'number') next[key] = entry.rate
      }
      setRates(next)
      localStorage.setItem('fxRates', JSON.stringify(next))
      localStorage.setItem('fxRatesFetchedAt', String(Date.now()))
    } catch {
      setRates(FALLBACK_RATE_FROM_USD)
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

  const ownersDisplay = (tx: Transaction): OwnerDisplay => {
    const owners = tx.owner_ids
    if (owners.length === 0) {
      return { avatarUser: resolveUser(PLACEHOLDER_ID), label: '—', count: 0 }
    }
    if (owners.length === 1) {
      const u = resolveUser(owners[0])
      return { avatarUser: u, label: u.name, count: 1 }
    }
    if (owners.length === 2) {
      const a = resolveUser(owners[0])
      const b = resolveUser(owners[1])
      const synthetic: User = {
        id: 'shared',
        name: 'Shared',
        initial: `${a.initial[0] ?? ''}+${b.initial[0] ?? ''}`,
        color_key: 'sage',
        created_at: '',
      }
      return { avatarUser: synthetic, label: `${a.name} + ${b.name}`, count: 2 }
    }
    const synthetic: User = {
      id: 'shared',
      name: 'Shared',
      initial: '··',
      color_key: 'sage',
      created_at: '',
    }
    return { avatarUser: synthetic, label: 'Shared', count: owners.length }
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

  const writePropertySubtables = async (p: Property) => {
    await supabase.from('mortgage_info').delete().eq('property_id', p.id)
    await supabase.from('lease_info').delete().eq('property_id', p.id)
    await supabase.from('units').delete().eq('property_id', p.id)
    if (p.mortgage) await supabase.from('mortgage_info').insert({ ...p.mortgage, property_id: p.id })
    if (p.lease) await supabase.from('lease_info').insert({ ...p.lease, property_id: p.id })
    if (p.units && p.units.length) {
      await supabase
        .from('units')
        .insert(p.units.map((u, i) => ({ ...u, property_id: p.id, sort_order: i })))
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
      const { error: e } = await supabase.from('properties').insert(propRecord(p))
      if (e) {
        setProperties((prev) => prev.filter((x) => x.id !== p.id))
        setError(e.message)
        return
      }
      await writePropertySubtables(p)
    })()
  }

  const updateProperty = (p: Property) => {
    let prev: Property | undefined
    setProperties((list) => {
      prev = list.find((x) => x.id === p.id)
      return list.map((x) => (x.id === p.id ? p : x))
    })
    ;(async () => {
      const { error: e } = await supabase.from('properties').update(propRecord(p)).eq('id', p.id)
      if (e) {
        if (prev) setProperties((list) => list.map((x) => (x.id === p.id ? prev! : x)))
        setError(e.message)
        return
      }
      await writePropertySubtables(p)
    })()
  }

  const deleteProperty = (id: string) => {
    let removed: Property | undefined
    setProperties((prev) => {
      removed = prev.find((p) => p.id === id)
      return prev.filter((p) => p.id !== id)
    })
    setRentalPayments((prev) => prev.filter((rp) => rp.property_id !== id))
    ;(async () => {
      const { error: e } = await supabase.from('properties').delete().eq('id', id)
      if (e && removed) {
        setProperties((prev) => [...prev, removed!])
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
    setBudgets((prev) => {
      const exists = prev.some((x) => x.category === b.category && x.household_id === b.household_id)
      return exists
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
      if (e) setError(e.message)
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
    currentUserId,
    currentUser,
    currentPersonId,
    currentHousehold: household,
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
    language,
    locale,
    setCurrency,
    chooseLanguage,
    rate,
    formatMoney,
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
    addPerson,
    renamePerson,
    setPersonColor,
    removePerson,
    refreshRates,
    signOut,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { paletteFor }
