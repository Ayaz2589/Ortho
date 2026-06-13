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
import { effectiveSplits } from './format'
import {
  readPersonalShares,
  writePersonalShare,
  removePersonalShare,
  prunePersonalShares,
  resolvePersonalOwners,
  type PersonalShare,
} from './personalShares'
import { paletteFor } from './categories'
import type {
  User,
  LocalUser,
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
  avatarUser: User | LocalUser
  label: string
  count: number
}

type AnyUser = User | LocalUser

interface AppStateValue {
  loading: boolean
  error: string | null
  currentUserId: string
  currentUser: User | null
  currentHousehold: Household | null
  users: User[]
  localUsers: LocalUser[]
  householdMembers: User[]
  transactions: Transaction[]
  cards: Card[]
  properties: Property[]
  rentalPayments: RentalPayment[]
  budgets: Budget[]
  currency: CurrencyKey
  rates: Partial<Record<CurrencyKey, number>>
  locale: string

  setCurrency: (c: CurrencyKey) => void
  rate: (c: CurrencyKey) => number
  formatMoney: (cents: number, opts?: { leadingPlus?: boolean }) => string

  resolveUser: (id: string) => AnyUser
  ownersDisplay: (tx: Transaction) => OwnerDisplay
  personalParticipants: AnyUser[]

  // aggregation helpers (USD cents)
  categoryExpenseTotal: (category: TransactionCategory, start: Date, end: Date) => number
  monthlySpentBy: (userId: string) => number
  spentBy: (userId: string, start: Date, end: Date) => number

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
  removeMember: (userId: string) => void
  addLocalUser: (u: Omit<LocalUser, 'id' | 'is_local'>) => void
  removeLocalUser: (id: string) => void
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

function rehydrateTransactions(
  rows: Transaction[],
  shares: TransactionShare[],
  personalShares: Record<string, PersonalShare>
): Transaction[] {
  const byTx = new Map<string, TransactionShare[]>()
  for (const s of shares) {
    const arr = byTx.get(s.transaction_id) ?? []
    arr.push(s)
    byTx.set(s.transaction_id, arr)
  }
  return rows.map((r) => {
    if (r.scope === 'personal') {
      // Local-user splits live on-device; merge them back (creator-only otherwise).
      const { owner_ids, splits } = resolvePersonalOwners(r.id, r.created_by, personalShares)
      return { ...r, owner_ids, splits }
    }
    const sh = byTx.get(r.id) ?? []
    const owner_ids = sh.map((s) => s.user_id)
    const splits =
      sh.length === 0
        ? null
        : sh.reduce<Record<string, number>>((m, s) => ((m[s.user_id] = s.percent), m), {})
    return { ...r, owner_ids: owner_ids.length ? owner_ids : [r.created_by], splits }
  })
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [localUsers, setLocalUsers] = useState<LocalUser[]>([])
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<string[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [rentalPayments, setRentalPayments] = useState<RentalPayment[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [currency, setCurrencyState] = useState<CurrencyKey>('usd')
  const [rates, setRates] = useState<Partial<Record<CurrencyKey, number>>>({})
  const [locale] = useState('en-US')
  const booted = useRef(false)

  // ---- preferences (localStorage) ----
  useEffect(() => {
    const c = localStorage.getItem('currency') as CurrencyKey | null
    if (c) setCurrencyState(c)
    try {
      const lu = JSON.parse(localStorage.getItem('localUsers') ?? '[]')
      if (Array.isArray(lu)) setLocalUsers(lu)
    } catch {}
  }, [])

  const setCurrency = (c: CurrencyKey) => {
    setCurrencyState(c)
    localStorage.setItem('currency', c)
  }
  const persistLocalUsers = (next: LocalUser[]) => {
    setLocalUsers(next)
    localStorage.setItem('localUsers', JSON.stringify(next))
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

        // claim the web session
        await supabase
          .from('platform_locks')
          .upsert({ user_id: authUser.id, platform: 'web', locked_at: new Date().toISOString() })

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

  async function loadAll(householdId: string, householdName: string) {
    const [
      usersRes,
      membersRes,
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
      supabase.from('household_members').select('*').eq('household_id', householdId),
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
    const memberRows = (membersRes.data ?? []) as { user_id: string; created_at: string }[]
    const orderedMembers = memberRows
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((m) => m.user_id)
    setMembers(orderedMembers)
    setHousehold({
      id: householdId,
      owner_id: currentUserId,
      name: householdName,
      created_at: new Date().toISOString(),
    })
    const txRows = (txRes.data as Transaction[]) ?? []
    setTransactions(
      rehydrateTransactions(txRows, (sharesRes.data as TransactionShare[]) ?? [], readPersonalShares())
    )
    // Forget on-device shares for personal transactions that no longer exist.
    prunePersonalShares(new Set(txRows.filter((t) => t.scope === 'personal').map((t) => t.id)))
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
    fmtMoney(cents, currency, rate(currency), opts?.leadingPlus ?? false)

  // ---- user resolution ----
  const resolveUser = (id: string): AnyUser => {
    const u = users.find((x) => x.id === id)
    if (u) return u
    const l = localUsers.find((x) => x.id === id)
    if (l) return l
    return {
      id: PLACEHOLDER_ID,
      name: 'Removed',
      initial: '·',
      color_key: 'sand',
      created_at: '',
    } as User
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

  const householdMembers = useMemo(
    () => members.map((id) => users.find((u) => u.id === id)).filter(Boolean) as User[],
    [members, users]
  )

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId]
  )

  const personalParticipants: AnyUser[] = useMemo(() => {
    const me = currentUser
    return [...(me ? [me] : []), ...localUsers]
  }, [currentUser, localUsers])

  // ---- aggregation ----
  const inRange = (date: string, start: Date, end: Date) => {
    const t = new Date(date).getTime()
    return t >= start.getTime() && t < end.getTime()
  }

  const categoryExpenseTotal = (category: TransactionCategory, start: Date, end: Date) =>
    transactions
      .filter((t) => t.kind === 'expense' && t.category === category && inRange(t.date, start, end))
      .reduce((s, t) => s + t.amount_cents, 0)

  const spentBy = (userId: string, start: Date, end: Date) =>
    transactions
      .filter((t) => t.kind === 'expense' && inRange(t.date, start, end) && t.owner_ids.includes(userId))
      .reduce((s, t) => {
        const splits = effectiveSplits(t)
        return s + Math.round((t.amount_cents * (splits[userId] ?? 0)) / 100)
      }, 0)

  const monthlySpentBy = (userId: string) => {
    const now = new Date()
    return spentBy(userId, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1))
  }

  // ---- mutations (optimistic) ----
  const writeShares = async (tx: Transaction) => {
    await supabase.from('transaction_shares').delete().eq('transaction_id', tx.id)
    if (tx.scope === 'shared') {
      const splits = effectiveSplits(tx)
      const rows = tx.owner_ids.map((uid) => ({
        transaction_id: tx.id,
        user_id: uid,
        percent: splits[uid] ?? 0,
      }))
      if (rows.length) await supabase.from('transaction_shares').insert(rows)
    }
  }

  const txRecord = (tx: Transaction) => ({
    id: tx.id,
    household_id: tx.household_id,
    merchant: tx.merchant,
    category: tx.category,
    kind: tx.kind,
    scope: tx.scope,
    amount_cents: tx.amount_cents,
    source: tx.source,
    date: tx.date,
    created_by: tx.created_by,
  })

  // Personal-scope owners/splits include device-only local users — persist them
  // on-device (never to Supabase) so they survive a reload. `null` = creator-only.
  const savePersonalShare = (tx: Transaction) => {
    if (tx.scope === 'personal') writePersonalShare(tx.id, { owner_ids: tx.owner_ids, splits: tx.splits })
    else removePersonalShare(tx.id)
  }

  const addTransaction = (tx: Transaction) => {
    setTransactions((prev) => [tx, ...prev])
    savePersonalShare(tx)
    ;(async () => {
      const { error: e } = await supabase.from('transactions').insert(txRecord(tx))
      if (e) {
        setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
        removePersonalShare(tx.id)
        setError(e.message)
        return
      }
      if (tx.scope === 'shared') await writeShares(tx)
    })()
  }

  const updateTransaction = (tx: Transaction) => {
    let prevTx: Transaction | undefined
    setTransactions((prev) => {
      prevTx = prev.find((t) => t.id === tx.id)
      return prev.map((t) => (t.id === tx.id ? tx : t))
    })
    savePersonalShare(tx)
    ;(async () => {
      const { error: e } = await supabase.from('transactions').update(txRecord(tx)).eq('id', tx.id)
      if (e) {
        if (prevTx) {
          setTransactions((prev) => prev.map((t) => (t.id === tx.id ? prevTx! : t)))
          savePersonalShare(prevTx) // restore the prior on-device share
        }
        setError(e.message)
        return
      }
      await writeShares(tx)
    })()
  }

  const deleteTransaction = (id: string) => {
    let removed: Transaction | undefined
    setTransactions((prev) => {
      removed = prev.find((t) => t.id === id)
      return prev.filter((t) => t.id !== id)
    })
    removePersonalShare(id)
    ;(async () => {
      const { error: e } = await supabase.from('transactions').delete().eq('id', id)
      if (e && removed) {
        setTransactions((prev) => [removed!, ...prev])
        if (removed) savePersonalShare(removed)
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

  const removeMember = (userId: string) => {
    if (!household) return
    const prev = members
    setMembers((m) => m.filter((id) => id !== userId))
    ;(async () => {
      const { error: e } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', household.id)
        .eq('user_id', userId)
      if (e) {
        setMembers(prev)
        setError(e.message)
      }
    })()
  }

  const addLocalUser = (u: Omit<LocalUser, 'id' | 'is_local'>) => {
    persistLocalUsers([...localUsers, { ...u, id: uuid(), is_local: true }])
  }
  const removeLocalUser = (id: string) => {
    persistLocalUsers(localUsers.filter((u) => u.id !== id))
  }

  const signOut = async () => {
    await supabase.from('platform_locks').delete().eq('user_id', currentUserId)
    await supabase.auth.signOut()
    window.location.href = '/sign-in'
  }

  const value: AppStateValue = {
    loading,
    error,
    currentUserId,
    currentUser,
    currentHousehold: household,
    users,
    localUsers,
    householdMembers,
    transactions,
    cards,
    properties,
    rentalPayments,
    budgets,
    currency,
    rates,
    locale,
    setCurrency,
    rate,
    formatMoney,
    resolveUser,
    ownersDisplay,
    personalParticipants,
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
    removeMember,
    addLocalUser,
    removeLocalUser,
    refreshRates,
    signOut,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { paletteFor }
