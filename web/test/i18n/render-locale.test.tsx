// @vitest-environment jsdom
//
// Spec 013 US6: rendering under Español and 日本語 shows the CATALOG value —
// never the English source string — for the always-rendered dashboard/ledger
// chrome. Runs against the real store (in-memory Supabase mock), switching
// language through the same store action Settings uses.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from '../helpers/supabase-mock'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider, useApp } from '@/lib/store'
import DashboardPage from '@/app/(app)/dashboard/page'
import { TransactionsDesktop } from '@/components/web/TransactionsDesktop'
import es from '@/lib/i18n/es'
import ja from '@/lib/i18n/ja'
import bn from '@/lib/i18n/bn'
import zh from '@/lib/i18n/zh'
import ko from '@/lib/i18n/ko'

function dataset(date: string) {
  return {
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [
        { id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' },
      ],
      household_members: [
        { household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' },
      ],
      household_people: [
        { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [
        {
          id: 'tx-1',
          household_id: 'hh-1',
          merchant: 'Costco',
          category: 'groceries',
          kind: 'expense',
          amount_cents: 10000,
          source: 'Checking',
          date,
          created_by: 'u-me',
          created_at: date,
          updated_at: date,
        },
      ],
      transaction_shares: [{ transaction_id: 'tx-1', person_id: 'u-me', amount_cents: 10000 }],
      cards: [], properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
    },
  }
}

function thisMonthISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0).toISOString()
}

let api: ReturnType<typeof useApp>
function Capture() {
  api = useApp()
  return null
}
function DashboardHarness() {
  // Spec 034: the Dashboard overview is the widget board; render the real page so
  // the always-present chrome (title + Overview/Reports mode switch + default
  // widget titles) is exercised in the active locale.
  return (
    <>
      <Capture />
      <DashboardPage />
    </>
  )
}

beforeEach(() => {
  h.mock = makeSupabaseMock(dataset(thisMonthISO()))
  stubNoNetwork()
  primeFxCache()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

// Always-rendered dashboard chrome keys: the page title, the Overview/Reports
// mode switch, and two default-enabled widget titles (spec 034). All exist in
// every catalog.
const DASH_KEYS = ['Dashboard', 'Overview', 'Reports', 'Budgets', 'Goals'] as const

for (const [language, catalog] of [
  ['Español', es],
  ['日本語', ja],
  ['বাংলা', bn],
  ['简体中文', zh],
  ['한국어', ko],
] as const) {
  describe(`dashboard chrome under ${language}`, () => {
    it('renders catalog values with no English fallback', async () => {
      render(
        <AppStateProvider>
          <DashboardHarness />
        </AppStateProvider>
      )
      await screen.findByText('Dashboard') // seeded load, still English
      await act(async () => {
        api.chooseLanguage(language)
      })
      await waitFor(() => {
        for (const key of DASH_KEYS) {
          expect(catalog[key], `catalog missing ${key}`).toBeTruthy()
          expect(screen.getAllByText(catalog[key]).length).toBeGreaterThan(0)
        }
      })
      // The English sources must be gone wherever the translation differs.
      for (const key of DASH_KEYS) {
        if (catalog[key] !== key) expect(screen.queryByText(key)).toBeNull()
      }
    })
  })
}

describe('transactions ledger under Español', () => {
  it('renders the translated title and no English "Transactions"', async () => {
    render(
      <AppStateProvider>
        <Capture />
        <TransactionsDesktop />
      </AppStateProvider>
    )
    await screen.findByText('Costco')
    await act(async () => {
      api.chooseLanguage('Español')
    })
    await waitFor(() => {
      expect(screen.getAllByText(es['Transactions']).length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('Transactions')).toBeNull()
  })
})
