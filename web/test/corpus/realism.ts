// spec 030 — the realism / demo layer (spec-026 §9.2 seam).
//
// The edge corpus (scenarios.ts) is byte-stable and pinned to a fixed future
// EPOCH — perfect for coverage, wrong for "open the app today and see a
// populated household". This module builds ONE realistic **primary demo
// household**, anchored to an injected `now`, that the local/stage auto-login
// user owns. It is deterministic given `now` (no Date.now / Math.random), and
// re-uses the SAME row builders as the corpus so it stays a faithful mirror of
// production shapes. It is deliberately NOT part of the snapshot corpus (its
// dates move with `now`); it is unit-tested with a fixed `now`.
//
// Distributions (category mix, amount ranges, cadence, subscription creep,
// over-budget flavor) are loosely grounded in
// docs/research/finance-habits-budgeting-apps.md so the demo reads as a real
// two-person household, not an idealized 16-row sample.

import type {
  User,
  Household,
  Person,
  Card,
  Budget,
  Tag,
  Goal,
  GoalContribution,
  LinkedInstitution,
  LinkedAccount,
  TransactionCategory,
  TransactionKind,
} from '@/lib/types'
import type { DbEntitlement } from '@/lib/entitlements'
import type { GeneratedTransaction, GeneratedProperty, HouseholdMember, TxIntent } from './model'
import { mulberry32 } from './prng'
import {
  buildUser,
  buildHousehold,
  buildPerson,
  buildMember,
  buildCard,
  buildBudget,
  buildTransaction,
  buildProperty,
  buildTag,
  buildGoal,
  buildGoalContribution,
  buildLinkedInstitution,
  buildLinkedAccount,
  buildEntitlement,
} from './builders'

/** Readable identity of the demo household. The seeder maps these to stable
 *  UUIDs (ids.ts) and mints an `auth.users` row for the owner keyed on the same
 *  UUID, so auto-login (by email/password) lands on exactly this data. */
export const DEMO = {
  ownerUserId: 'demo-owner',
  partnerUserId: 'demo-partner',
  householdId: 'demo-household',
  ownerPersonId: 'demo-person-owner',
  partnerPersonId: 'demo-person-partner',
  /** Default seed-user email; overridable by the seeder / autologin env. */
  ownerEmail: 'seed@ortho.test',
  ownerName: 'Sam',
  partnerName: 'Riley',
} as const

export interface DemoHousehold {
  users: User[]
  household: Household
  people: Person[]
  members: HouseholdMember[]
  cards: Card[]
  transactions: GeneratedTransaction[]
  properties: GeneratedProperty[]
  budgets: Budget[]
  tags: Tag[]
  goals: Goal[]
  goalContributions: GoalContribution[]
  linkedInstitutions: LinkedInstitution[]
  linkedAccounts: LinkedAccount[]
  entitlements: DbEntitlement[]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** noon-UTC ISO string (the app storage regime) for a calendar day. */
function iso(year: number, month1: number, day: number): string {
  return new Date(Date.UTC(year, month1 - 1, day, 12, 0, 0)).toISOString()
}

/** 'YYYY-MM-DD' local calendar day. */
function ymd(year: number, month1: number, day: number): string {
  return `${year}-${pad(month1)}-${pad(day)}`
}

/** (year, month1) `delta` months from a reference Date (UTC). */
function monthOf(now: Date, delta: number): { year: number; month1: number } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + delta, 1))
  return { year: d.getUTCFullYear(), month1: d.getUTCMonth() + 1 }
}

// ---------------------------------------------------------------------------
// Research-grounded merchant pools (docs/research/finance-habits-budgeting-apps.md
// §2 category shares, §5 cadence; docs/research/market-analysis NYC flavor). A
// two-person household runs ~60–100 transactions/month, dominated by a long tail
// of small discretionary buys over a handful of large recurring charges. The
// categories are coarse (11 pickable buckets), so a few real-world line items are
// mapped to the nearest bucket (e.g. insurance → utilities/fuel, bank fee →
// utilities); those mappings are called out inline where they bite.
//
// Amounts are cent ranges; the generator samples within them per draw so no two
// months look identical. Everything is deterministic given `now` (fixed seed +
// per-month PRNG substream) — no Date.now / Math.random (constitution).

/** Seed for the demo household's PRNG. Fixed → byte-stable given the same `now`. */
const DEMO_SEED = 0x00305eed

interface Vendor {
  name: string
  category: TransactionCategory
  /** Inclusive cent range sampled per transaction. */
  min: number
  max: number
}

const GROCERS: Vendor[] = [
  { name: 'Whole Foods', category: 'groceries', min: 5200, max: 14200 },
  { name: 'Trader Joe’s', category: 'groceries', min: 3800, max: 9600 },
  { name: 'Key Food', category: 'groceries', min: 2400, max: 7800 },
  { name: 'C-Town Supermarket', category: 'groceries', min: 1800, max: 6200 },
  { name: 'Fairway Market', category: 'groceries', min: 3200, max: 8800 },
  { name: 'Corner Bodega', category: 'groceries', min: 400, max: 2600 },
]

const DINING: Vendor[] = [
  { name: 'Xi’an Famous Foods', category: 'dining', min: 1600, max: 4200 },
  { name: 'Joe’s Pizza', category: 'dining', min: 900, max: 3400 },
  { name: 'The Halal Guys', category: 'dining', min: 1400, max: 3600 },
  { name: 'Sweetgreen', category: 'dining', min: 1500, max: 3200 },
  { name: 'Chipotle', category: 'dining', min: 1200, max: 3800 },
  { name: 'Los Tacos No.1', category: 'dining', min: 1400, max: 4400 },
  { name: 'Thai Villa', category: 'dining', min: 3200, max: 9500 },
  { name: 'DoorDash', category: 'dining', min: 2400, max: 7200 },
  { name: 'Seamless', category: 'dining', min: 2200, max: 6800 },
  { name: 'Tartine', category: 'dining', min: 3600, max: 8600 },
]

const COFFEE: Vendor[] = [
  { name: 'Blue Bottle', category: 'coffee', min: 550, max: 780 },
  { name: 'Devoción', category: 'coffee', min: 500, max: 800 },
  { name: 'Dunkin’', category: 'coffee', min: 350, max: 700 },
  { name: 'Starbucks', category: 'coffee', min: 450, max: 850 },
  { name: 'Variety Coffee', category: 'coffee', min: 400, max: 720 },
  { name: 'Bodega Coffee', category: 'coffee', min: 200, max: 350 },
]

const TRANSIT: Vendor[] = [
  { name: 'MTA OMNY', category: 'transit', min: 290, max: 290 },
  { name: 'MTA Subway', category: 'transit', min: 290, max: 580 },
]

const RIDESHARE: Vendor[] = [
  { name: 'Uber', category: 'transit', min: 1200, max: 3800 },
  { name: 'Lyft', category: 'transit', min: 1100, max: 3400 },
  { name: 'Citi Bike', category: 'transit', min: 400, max: 2400 },
]

/** Impulse / discretionary shopping — the ~9-10/mo, ~$28 tail (research U9). */
const SHOPPING: Vendor[] = [
  { name: 'Amazon', category: 'entertainment', min: 1500, max: 8000 },
  { name: 'Target', category: 'groceries', min: 2500, max: 9000 },
  { name: 'Duane Reade', category: 'health', min: 800, max: 3500 },
  { name: 'Uniqlo', category: 'entertainment', min: 3000, max: 9000 },
  { name: 'IKEA', category: 'entertainment', min: 4000, max: 16000 },
  { name: 'Best Buy', category: 'entertainment', min: 3000, max: 20000 },
  { name: 'Sephora', category: 'entertainment', min: 2000, max: 9000 },
  { name: 'Etsy', category: 'entertainment', min: 1500, max: 6000 },
]

const HEALTH: Vendor[] = [
  { name: 'CVS Pharmacy', category: 'health', min: 800, max: 4200 },
  { name: 'One Medical', category: 'health', min: 2500, max: 2500 },
  { name: 'Duane Reade Rx', category: 'health', min: 600, max: 2600 },
]

const ENTERTAINMENT: Vendor[] = [
  { name: 'AMC Theatres', category: 'entertainment', min: 1800, max: 4200 },
  { name: 'Nintendo eShop', category: 'entertainment', min: 999, max: 5999 },
  { name: 'Ticketmaster', category: 'entertainment', min: 4500, max: 18000 },
  { name: 'MoMA', category: 'entertainment', min: 2500, max: 2500 },
]

/** Ambiguous P2P / card merchants. The app defaults unmatched expenses to
 *  `entertainment` (see nyc-market-language-analysis §2) — modeling the
 *  persistent miscategorized tail the research calls out (U4). */
const MISC: Vendor[] = [
  { name: 'Venmo', category: 'entertainment', min: 500, max: 6000 },
  { name: 'PayPal', category: 'entertainment', min: 1000, max: 8000 },
  { name: 'Square', category: 'entertainment', min: 800, max: 4500 },
  { name: 'Cash App', category: 'entertainment', min: 500, max: 4000 },
]

/** Subscription creep (research U5): ~11 small recurring charges. People
 *  self-report ~$86/mo but actually spend ~$219 — the household's `subs` budget
 *  ($35) is deliberately dwarfed by the real total, surfacing the insight. */
const SUBS: Array<{ name: string; cents: number }> = [
  { name: 'Netflix', cents: 1599 },
  { name: 'Spotify', cents: 1199 },
  { name: 'Hulu', cents: 999 },
  { name: 'Max', cents: 1699 },
  { name: 'Disney+', cents: 999 },
  { name: 'The New York Times', cents: 2500 },
  { name: 'iCloud+', cents: 299 },
  { name: 'Amazon Prime', cents: 1499 },
  { name: 'YouTube Premium', cents: 1399 },
  { name: 'ChatGPT Plus', cents: 2000 },
  { name: 'Blink Fitness', cents: 3900 },
]

/** Recurring bills — few in count, large in value (research §5). Housing dwarfs
 *  everything (BLS ~33% of spend). Phone/internet/insurance fold into `utilities`
 *  or `fuel` for lack of dedicated buckets. */
const BILLS: Array<{ name: string; category: TransactionCategory; cents: number; day: number; source?: string }> = [
  { name: 'Mortgage Payment', category: 'rent', cents: 282000, day: 1 },
  { name: 'Con Edison', category: 'utilities', cents: 11800, day: 21 },
  { name: 'National Grid', category: 'utilities', cents: 8400, day: 18 },
  { name: 'NYC Water Board', category: 'utilities', cents: 4200, day: 22 },
  { name: 'Verizon Fios', category: 'utilities', cents: 8999, day: 12 },
  { name: 'T-Mobile', category: 'utilities', cents: 14000, day: 16 },
  { name: 'State Farm Home', category: 'utilities', cents: 9800, day: 5 },
  { name: 'GEICO Auto', category: 'fuel', cents: 15200, day: 5 },
]

const HOLIDAY_GIFTS = ['Amazon', 'Target', 'Macy’s', 'Nordstrom', 'Etsy']

/**
 * Build the primary demo household anchored to `now`. Populates every screen the
 * store loads: transactions (with splits, tags, notes), budgets in all three
 * bucket types, savings + debt goals with contributions, a mortgaged home, a
 * linked SimpleFIN bank, and an active entitlement so the owner is not paywalled.
 */
export function buildDemoHousehold(now: Date): DemoHousehold {
  const {
    ownerUserId: u0,
    partnerUserId: u1,
    householdId: hh,
    ownerPersonId: p0,
    partnerPersonId: p1,
    ownerName,
    partnerName,
  } = DEMO

  const users = [buildUser(u0, ownerName, 'sage'), buildUser(u1, partnerName, 'slate')]
  const household = buildHousehold(hh, u0, `${ownerName} & ${partnerName}`)
  const people = [buildPerson(p0, hh, ownerName, 0, u0, 'sage'), buildPerson(p1, hh, partnerName, 1, u1, 'slate')]
  const members = [buildMember(hh, u0, 'owner'), buildMember(hh, u1, 'member')]
  const cards = [buildCard('demo-card-checking', hh, 'Joint Checking'), buildCard('demo-card-everyday', hh, 'Everyday Card')]

  const tagReimb = 'demo-tag-reimbursable'
  const tagVacation = 'demo-tag-vacation'
  const tags = [buildTag(tagReimb, hh, 'Reimbursable'), buildTag(tagVacation, hh, 'Vacation')]

  // A realistic six-month ledger for a two-person NYC household: a small core of
  // large recurring bills + ~11 subscriptions, a long tail of discretionary buys,
  // variable two-earner income, a monthly remittance, periodic settle-ups, and a
  // messy "unhappy path" overlay (seasonal spikes, a car + medical shock with a
  // resulting overdraft, and an ambiguous miscategorized tail). Deterministic
  // given `now`: a fixed-seed PRNG with an independent per-month substream.
  const transactions: GeneratedTransaction[] = []
  const rng = mulberry32(DEMO_SEED)
  let idx = 0
  const nextId = () => `demo-tx-${idx++}`

  for (let m = 5; m >= 0; m--) {
    const { year, month1 } = monthOf(now, -m)
    const isCurrent = m === 0
    const today = now.getUTCDate()
    const mr = rng.sub(`m-${year}-${month1}`)

    // Push a row unless it would be future-dated in the current month. Days are
    // clamped to 1..28 so every generated date is always valid (no Feb/30/31).
    const add = (
      day: number,
      v: {
        merchant: string
        category: TransactionCategory
        cents: number
        kind?: TransactionKind
        owners: string[]
        paidBy?: string | null
        source?: string
        tags?: string[]
        notes?: string
        intent?: TxIntent[]
      }
    ): void => {
      const d = Math.min(Math.max(Math.round(day), 1), 28)
      if (isCurrent && d > today) return
      transactions.push(
        buildTransaction({
          id: nextId(),
          householdId: hh,
          merchant: v.merchant,
          category: v.category,
          kind: v.kind ?? 'expense',
          amountCents: v.cents,
          source: v.source ?? 'Joint Checking',
          date: iso(year, month1, d),
          createdBy: u0,
          owners: v.owners,
          paidBy: v.kind === 'income' ? null : v.paidBy ?? p0,
          ...(v.tags ? { tags: v.tags } : {}),
          ...(v.notes ? { notes: v.notes } : {}),
          ...(v.intent ? { intent: v.intent } : {}),
        })
      )
    }

    // Sample `count` draws from a discretionary vendor pool on random days.
    const emit = (pool: Vendor[], count: number, opts: { personal?: boolean; source?: string } = {}): void => {
      for (let i = 0; i < count; i++) {
        const v = mr.pick(pool)
        add(mr.range(1, 28), {
          merchant: v.name,
          category: v.category,
          cents: mr.range(v.min, v.max),
          owners: opts.personal ? [p0] : [p0, p1],
          paidBy: opts.personal ? p0 : mr.bool(0.72) ? p0 : p1,
          source: opts.source,
        })
      }
    }

    // --- Recurring core (few in count, large in value) ---------------------
    for (const b of BILLS) {
      add(b.day, { merchant: b.name, category: b.category, cents: b.cents, owners: [p0, p1], paidBy: p0, source: b.source, intent: ['recurring-merchant'] })
    }
    for (const s of SUBS) {
      add(7, { merchant: s.name, category: 'subs', cents: s.cents, owners: [p0, p1], paidBy: p0, source: 'Everyday Card', intent: ['subscription'] })
    }

    // --- Two-earner, partly-variable income (research U2) ------------------
    add(1, { merchant: 'Metro Health Payroll', category: 'income', kind: 'income', cents: 270000, owners: [p0], intent: ['income'] })
    add(15, { merchant: 'Metro Health Payroll', category: 'income', kind: 'income', cents: 270000, owners: [p0], intent: ['income'] })
    add(mr.range(3, 22), { merchant: 'Upwork', category: 'income', kind: 'income', cents: mr.range(180000, 460000), owners: [p1], intent: ['income'] })
    if (m === 4) {
      add(12, { merchant: 'IRS Tax Refund', category: 'income', kind: 'income', cents: 142800, owners: [p0, p1], intent: ['income'] })
    }

    // --- Monthly remittance to family (no first-class category; nyc §9) ----
    add(mr.range(3, 6), { merchant: 'Remitly — Family', category: 'transfer', kind: 'transfer', cents: 25000, owners: [p0], paidBy: p0, notes: m === 5 ? 'Monthly support home' : undefined })

    // --- Discretionary long tail (the bulk of the transaction count) -------
    emit(GROCERS, mr.range(4, 6))
    emit(DINING, mr.range(8, 12))
    emit(COFFEE, mr.range(9, 15), { personal: true, source: 'Everyday Card' })
    emit(TRANSIT, mr.range(5, 9), { source: 'Everyday Card' })
    emit(RIDESHARE, mr.range(1, 3), { source: 'Everyday Card' })
    emit(SHOPPING, mr.range(7, 11), { source: 'Everyday Card' })
    emit(HEALTH, mr.range(1, 2))
    emit(ENTERTAINMENT, mr.range(2, 4), { source: 'Everyday Card' })
    emit(MISC, mr.range(1, 2), { source: 'Everyday Card' })

    // --- Seasonal overlay (research U10) -----------------------------------
    if (month1 === 11 || month1 === 12) {
      const gifts = mr.range(3, 5)
      for (let i = 0; i < gifts; i++) {
        add(mr.range(1, 24), { merchant: mr.pick(HOLIDAY_GIFTS), category: 'entertainment', cents: mr.range(4500, 18000), owners: [p0, p1], paidBy: p0, source: 'Everyday Card', notes: i === 0 ? 'Holiday gifts' : undefined })
      }
    } else if (month1 === 8 || month1 === 9) {
      add(mr.range(10, 24), { merchant: 'Staples', category: 'entertainment', cents: mr.range(6000, 14000), owners: [p0, p1], paidBy: p0, source: 'Everyday Card' })
    }

    // --- A heavy, over-budget month (research U1: dining is a top overspend) -
    if (m === 1) {
      emit(DINING, 5)
      emit(SHOPPING, 4, { source: 'Everyday Card' })
    }

    // --- Shocks + the fragility chain they trigger (research U11, U8, U6) ---
    if (m === 3) {
      add(14, { merchant: 'Mavis Discount Tire', category: 'fuel', cents: 68400, owners: [p0, p1], paidBy: p0, source: 'Everyday Card', notes: 'Unexpected car repair' })
    }
    if (m === 2) {
      add(9, { merchant: 'Mount Sinai — Billing', category: 'health', cents: 42500, owners: [p0], paidBy: p0, notes: 'Surprise medical bill' })
      // Bank fee → nearest bucket (utilities); the shock drained the buffer.
      add(27, { merchant: 'Overdraft Fee', category: 'utilities', cents: 3400, owners: [p0], paidBy: p0 })
    }

    // --- Periodic settle-up so member balances drift then partly clear -----
    if (m % 2 === 1) {
      add(mr.range(20, 26), { merchant: 'Settle up', category: 'transfer', kind: 'transfer', cents: mr.range(8000, 26000), owners: [p0], paidBy: p1, source: 'Joint Checking', intent: ['settle-up'] })
    }
  }

  // This month, two anchored specials the store/tests rely on: a tagged + noted
  // reimbursable expense (tags+notes coverage) and a partial settle-up so member
  // balances are non-zero regardless of what the random stream produced.
  const cur = monthOf(now, 0)
  const curDay = (d: number) => Math.min(d, now.getUTCDate())
  transactions.push(
    buildTransaction({
      id: 'demo-tx-tagged',
      householdId: hh,
      merchant: 'Delta Air Lines',
      category: 'transit',
      kind: 'expense',
      amountCents: 48600,
      source: 'Everyday Card',
      date: iso(cur.year, cur.month1, curDay(5)),
      createdBy: u0,
      owners: [p0, p1],
      paidBy: p0,
      tags: [tagVacation, tagReimb],
      notes: 'Flights for the spring trip — Riley owes half',
    }),
    buildTransaction({
      id: 'demo-settle',
      householdId: hh,
      merchant: 'Settle up',
      category: 'transfer',
      kind: 'transfer',
      amountCents: 24300,
      source: 'Joint Checking',
      date: iso(cur.year, cur.month1, curDay(8)),
      createdBy: u0,
      owners: [p0],
      paidBy: p1,
    })
  )

  // Budgets in all three bucket types; carry anchor six months back.
  const anchor = monthOf(now, -5)
  const anchorTs = iso(anchor.year, anchor.month1, 1)
  const budgets = [
    buildBudget('demo-b-groceries', hh, 'groceries', 60000, 'flex', 120000, anchorTs),
    buildBudget('demo-b-dining', hh, 'dining', 20000, 'fixed', null, anchorTs),
    buildBudget('demo-b-utilities', hh, 'utilities', 24000, 'non_monthly', null, anchorTs),
    buildBudget('demo-b-subs', hh, 'subs', 3500, 'fixed', null, anchorTs),
  ]

  // A primary home with an active mortgage.
  const properties: GeneratedProperty[] = [
    buildProperty({
      id: 'demo-prop-home',
      householdId: hh,
      kind: 'primary_home',
      address: '124 Oak Lane',
      nickname: 'Home',
      mortgage: {
        purchase_price_cents: 58000000,
        original_loan_cents: 46400000,
        annual_interest_rate_percent: 6.125,
        loan_term_years: 30,
        closing_date: iso(now.getUTCFullYear() - 3, 6, 1),
        auto_pay_source: 'Joint Checking',
      },
    }),
  ]

  // A linked SimpleFIN bank (connect scope: display-only, no synced balances).
  const instId = 'demo-inst'
  const linkedInstitutions = [
    buildLinkedInstitution({
      id: instId,
      householdId: hh,
      provider: 'simplefin',
      providerItemId: 'demo-sf-item',
      institutionName: 'Community Credit Union',
      status: 'active',
      createdBy: u0,
      lastSyncedAt: iso(cur.year, cur.month1, Math.min(now.getUTCDate(), 28)),
      syncCursor: 'demo-cursor',
    }),
  ]
  const acctChecking = 'demo-acct-checking'
  const linkedAccounts = [
    buildLinkedAccount({ id: acctChecking, institutionId: instId, providerAccountId: 'demo-acc-1', name: 'Everyday Checking', mask: '1188', accountType: 'depository', accountSubtype: 'checking', currency: 'USD' }),
    buildLinkedAccount({ id: 'demo-acct-savings', institutionId: instId, providerAccountId: 'demo-acc-2', name: 'Savings', mask: '4821', accountType: 'depository', accountSubtype: 'savings', currency: 'USD' }),
  ]

  // A savings goal (on pace) and a debt-payoff goal, each with contributions.
  const start = monthOf(now, -6)
  const target = monthOf(now, 6)
  const startTs = iso(start.year, start.month1, 1)
  const goals = [
    buildGoal({ id: 'demo-goal-emergency', householdId: hh, name: 'Emergency fund', kind: 'savings', targetCents: 600000, targetDate: ymd(target.year, target.month1, 1), createdBy: u0, createdAt: startTs }),
    buildGoal({ id: 'demo-goal-card', householdId: hh, name: 'Pay off the card', kind: 'debt_payoff', targetCents: 300000, targetDate: ymd(target.year, target.month1, 15), linkedAccountId: acctChecking, createdBy: u0, createdAt: startTs }),
  ]
  const goalContributions: GoalContribution[] = []
  // On-pace: ~half saved at the midpoint (now).
  for (let m = 6; m >= 1; m--) {
    const { year, month1 } = monthOf(now, -m)
    goalContributions.push(buildGoalContribution(`demo-c-em-${m}`, 'demo-goal-emergency', 50000, ymd(year, month1, 2), u0))
    goalContributions.push(buildGoalContribution(`demo-c-card-${m}`, 'demo-goal-card', 25000, ymd(year, month1, 20), u0))
  }

  // Active entitlement so the owner is never paywalled in the demo.
  const entitlements = [
    buildEntitlement({ userId: u0, status: 'active', accessExpiresAt: iso(now.getUTCFullYear() + 1, now.getUTCMonth() + 1, 1), plan: 'yearly', source: 'stripe' }),
  ]

  return {
    users,
    household,
    people,
    members,
    cards,
    transactions,
    properties,
    budgets,
    tags,
    goals,
    goalContributions,
    linkedInstitutions,
    linkedAccounts,
    entitlements,
  }
}
