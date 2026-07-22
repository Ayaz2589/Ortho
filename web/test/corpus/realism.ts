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
} from '@/lib/types'
import type { DbEntitlement } from '@/lib/entitlements'
import type { GeneratedTransaction, GeneratedProperty, HouseholdMember } from './model'
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

/** A realistic recurring monthly basket (research-grounded, US two-person). */
const MONTHLY_BASKET: Array<{ merchant: string; category: TransactionCategory; cents: number; day: number }> = [
  { merchant: 'Whole Foods', category: 'groceries', cents: 9200, day: 3 },
  { merchant: 'Trader Joe’s', category: 'groceries', cents: 6400, day: 17 },
  { merchant: 'Blue Bottle', category: 'coffee', cents: 620, day: 6 },
  { merchant: 'Tartine', category: 'dining', cents: 5400, day: 12 },
  { merchant: 'Shell', category: 'fuel', cents: 5200, day: 9 },
  { merchant: 'Con Edison', category: 'utilities', cents: 11800, day: 21 },
  { merchant: 'MTA', category: 'transit', cents: 3300, day: 2 },
  { merchant: 'Netflix', category: 'subs', cents: 1599, day: 7 },
  { merchant: 'Spotify', category: 'subs', cents: 1199, day: 7 },
  { merchant: 'AMC Theatres', category: 'entertainment', cents: 3600, day: 15 },
]

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

  // Six months of the recurring basket, split evenly, most paid by the owner.
  const transactions: GeneratedTransaction[] = []
  let idx = 0
  for (let m = 5; m >= 0; m--) {
    const { year, month1 } = monthOf(now, -m)
    for (const item of MONTHLY_BASKET) {
      // No future-dated rows in the current month (the app's "today" view).
      if (m === 0 && item.day > now.getUTCDate()) continue
      const joint = item.category !== 'coffee' // coffee is the owner's personal habit
      transactions.push(
        buildTransaction({
          id: `demo-tx-${idx++}`,
          householdId: hh,
          merchant: item.merchant,
          category: item.category,
          kind: 'expense',
          amountCents: item.cents,
          source: item.category === 'subs' ? 'Everyday Card' : 'Joint Checking',
          date: iso(year, month1, item.day),
          createdBy: u0,
          owners: joint ? [p0, p1] : [p0],
          paidBy: p0,
        })
      )
    }
    // Monthly payroll income for the owner.
    transactions.push(
      buildTransaction({
        id: `demo-income-${m}`,
        householdId: hh,
        merchant: 'Acme Payroll',
        category: 'income',
        kind: 'income',
        amountCents: 540000,
        source: 'Joint Checking',
        date: iso(year, month1, 1),
        createdBy: u0,
        owners: [p0],
      })
    )
  }
  // This month: a tagged + noted reimbursable expense and a partial settle-up so
  // member balances are non-zero.
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
