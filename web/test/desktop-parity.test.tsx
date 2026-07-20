// @vitest-environment jsdom
//
// User Story 4 — "Wide/desktop web shows everything the phone does".
//   (a) The desktop transaction detail pane renders per-owner share amounts +
//       percent for a split/household transaction (it used to drop them).
//   (b) Choosing a non-default language drives the store's `locale`, so the
//       Intl-based formatters re-render in that locale.
//
// Both run against the REAL store (AppStateProvider) seeded from an in-memory
// Supabase mock — zero network — mirroring web/test/store.test.tsx.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from './helpers/supabase-mock'

// Swap the store's client for the chainable in-memory mock (registered before
// the store is imported).
const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

// Stub the web file-dialog helper (useScanFlow imports pickFile eagerly) so the
// desktop scan-entry test asserts the upload wiring without a real OS dialog.
const pick = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('@/lib/scan/webCapture', () => ({ pickFile: (...a: unknown[]) => pick.fn(...a) }))

import { AppStateProvider, useApp } from '@/lib/store'
import { useDashboardScope } from '@/lib/useDashboardRange'
import { TransactionsDesktop } from '@/components/web/TransactionsDesktop'
import { DashboardDesktop } from '@/components/web/DashboardDesktop'
import { HousingDesktop } from '@/components/web/HousingDesktop'

// DashboardDesktop now takes its time scope as a prop (lifted to the page so the
// mobile/desktop layouts share one source). This harness supplies it from the hook.
function DesktopDashboardHarness() {
  const scope = useDashboardScope()
  return <DashboardDesktop scope={scope} />
}

// A household with a 70/30 split expense in the CURRENT month (so the desktop
// ledger leaves that month expanded by default and the row is clickable).
function dataset(date: string) {
  return {
    authUser: { id: 'u-me', email: 'maya@example.com' },
    tables: {
      users: [
        { id: 'u-me', name: 'Maya', initial: 'M', color_key: 'sage', created_at: '2026-01-01T00:00:00Z' },
        { id: 'u-jordan', name: 'Jordan', initial: 'J', color_key: 'slate', created_at: '2026-01-02T00:00:00Z' },
      ],
      household_members: [
        { household_id: 'hh-1', user_id: 'u-me', role: 'owner', created_at: '2026-01-01T00:00:00Z' },
        { household_id: 'hh-1', user_id: 'u-jordan', role: 'member', created_at: '2026-01-02T00:00:00Z' },
      ],
      household_people: [
        { id: 'u-me', household_id: 'hh-1', name: 'Maya', initial: 'M', color_key: 'sage', linked_user_id: 'u-me', sort_order: 0, removed_at: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'u-jordan', household_id: 'hh-1', name: 'Jordan', initial: 'J', color_key: 'slate', linked_user_id: 'u-jordan', sort_order: 1, removed_at: null, created_at: '2026-01-02T00:00:00Z' },
      ],
      households: [{ id: 'hh-1', owner_id: 'u-me', name: 'Home', created_at: '2026-01-01T00:00:00Z' }],
      transactions: [
        {
          id: 'tx-split',
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
      // Uneven split: $70.00 / $30.00 → 70% / 30%.
      transaction_shares: [
        { transaction_id: 'tx-split', person_id: 'u-me', amount_cents: 7000 },
        { transaction_id: 'tx-split', person_id: 'u-jordan', amount_cents: 3000 },
      ],
      cards: [], properties: [], mortgage_info: [], lease_info: [], units: [], rental_payments: [], budgets: [],
    },
  }
}

// An ISO date inside the current month, so the desktop ledger's "current month
// open by default" rule keeps the seeded row visible without faking the clock.
function thisMonthISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0).toISOString()
}

// Capture the live context value so the language test can drive actions.
let api: ReturnType<typeof useApp>
function Capture() {
  api = useApp()
  return null
}

beforeEach(() => {
  h.mock = makeSupabaseMock(dataset(thisMonthISO()))
  stubNoNetwork()
  primeFxCache()
  pick.fn.mockReset()
  pick.fn.mockResolvedValue(null)
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('desktop transaction detail — per-owner shares (US4 / T025)', () => {
  it('shows each owner’s share amount and percent for a split transaction', async () => {
    render(<AppStateProvider><TransactionsDesktop /></AppStateProvider>)
    // Wait for the seeded ledger to load.
    await screen.findByText('Costco')

    // Open the detail pane for the split transaction.
    const user = userEvent.setup()
    await user.click(screen.getByText('Costco'))

    // The shared detail body renders per-owner cents + percent — the data the
    // old desktop pane dropped (it showed only joined owner names).
    expect(await screen.findByText('$70.00')).toBeInTheDocument()
    expect(screen.getByText('$30.00')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()

    // Both owners are still named in the detail pane.
    expect(screen.getByText('Maya')).toBeInTheDocument()
    expect(screen.getByText('Jordan')).toBeInTheDocument()
  })
})

// Base tables (no budgets / no properties) reused by the capability tests below.
function baseTables() {
  const d = dataset(thisMonthISO())
  return d.tables
}

describe('desktop dashboard — Budget Progress widget (US4 / T021)', () => {
  it('renders the Budget Progress card on the wide dashboard when budgets are set', async () => {
    h.mock = makeSupabaseMock({
      authUser: { id: 'u-me', email: 'maya@example.com' },
      tables: {
        ...baseTables(),
        budgets: [{ id: 'b-groceries', household_id: 'hh-1', category: 'groceries', monthly_limit_cents: 50000 }],
      },
    })
    render(<AppStateProvider><DesktopDashboardHarness /></AppStateProvider>)
    // The shared BudgetProgressCard (its "Budgets" section label) is present on
    // the ≥1024px layout — it used to be dropped by DashboardDesktop.
    expect(await screen.findByText('Budgets')).toBeInTheDocument()
  })
})

describe('desktop housing — lease-renewal banner (US4 / T021)', () => {
  it('shows the renewal banner on the wide housing view when a lease renews soon', async () => {
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    h.mock = makeSupabaseMock({
      authUser: { id: 'u-me', email: 'maya@example.com' },
      tables: {
        ...baseTables(),
        properties: [
          { id: 'prop-1', household_id: 'hh-1', kind: 'rental', address: '12 Oak St', nickname: 'Oak St', created_at: '2026-01-01T00:00:00Z' },
        ],
        lease_info: [
          { property_id: 'prop-1', monthly_rent_cents: 200000, lease_start: '2025-07-01', lease_end: soon, security_deposit_cents: 200000, paid_with_source: 'Checking' },
        ],
      },
    })
    render(<AppStateProvider><HousingDesktop /></AppStateProvider>)
    // The shared RenewalBanner is rendered for a soon-ending lease — it used to be
    // dropped by HousingDesktop.
    expect(await screen.findByText('Time to renew or plan a move.')).toBeInTheDocument()
  })
})

describe('language → locale in the store (US4 / T027)', () => {
  async function renderStore() {
    render(<AppStateProvider><Capture /></AppStateProvider>)
    await waitFor(() => expect(api.loading).toBe(false))
  }

  it('defaults to en-US and the System option', async () => {
    await renderStore()
    expect(api.language).toBe('System')
    expect(api.locale).toBe('en-US')
  })

  it('choosing a non-default language updates the store locale and persists it', async () => {
    await renderStore()

    await act(async () => { api.chooseLanguage('日本語') })
    await waitFor(() => expect(api.locale).toBe('ja-JP'))
    expect(api.language).toBe('日本語')
    expect(localStorage.getItem('language')).toBe('日本語')

    // The locale is locale-aware: an Intl date formatter keyed on the store
    // locale renders differently than the en-US default (Japanese era/format).
    const date = new Date('2026-06-15T12:00:00Z')
    const ja = new Intl.DateTimeFormat(api.locale, { month: 'long', day: 'numeric' }).format(date)
    const en = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(date)
    expect(ja).not.toBe(en)

    // Switching again re-derives the locale (Spanish here).
    await act(async () => { api.chooseLanguage('Español') })
    await waitFor(() => expect(api.locale).toBe('es-ES'))
  })

  it('maps every language option to its BCP-47 locale', async () => {
    await renderStore()
    const expected: [Parameters<typeof api.chooseLanguage>[0], string][] = [
      ['English', 'en-US'],
      // -u-nu-latn: Latin digits under বাংলা, matching iOS's deliberate choice.
      ['বাংলা', 'bn-BD-u-nu-latn'],
      ['Español', 'es-ES'],
      ['日本語', 'ja-JP'],
      ['简体中文', 'zh-Hans'],
      ['한국어', 'ko-KR'],
    ]
    for (const [language, locale] of expected) {
      await act(async () => { api.chooseLanguage(language) })
      await waitFor(() => expect(api.locale).toBe(locale))
    }
  })
})

describe('desktop bank-statement upload (US4 parity)', () => {
  it('exposes a scan entry in the ledger header', async () => {
    render(<AppStateProvider><TransactionsDesktop /></AppStateProvider>)
    // The header renders regardless of data; the scan/upload affordance the
    // desktop layout used to lack is present.
    expect(await screen.findByLabelText('Scan a receipt or statement')).toBeInTheDocument()
  })

  it('opens the PDF file dialog on web (no on-device OCR → PDF import is the path)', async () => {
    render(<AppStateProvider><TransactionsDesktop /></AppStateProvider>)
    const btn = await screen.findByLabelText('Scan a receipt or statement')

    // jsdom reports a non-native platform, so clicking goes straight to the web
    // PDF import — pickFile() must be called with the PDF accept type, inside
    // the click gesture. (User cancels → resolves null → flow returns to idle.)
    await userEvent.setup().click(btn)
    await waitFor(() => expect(pick.fn).toHaveBeenCalledWith('application/pdf'))
  })
})
