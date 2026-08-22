// @vitest-environment jsdom
// spec 032 US2 — the export panel defaults to the app's current language +
// currency (SC-002) and lets the user change either.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const t = (k: string, ...a: Array<string | number>) =>
  a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t,
    language: 'Español',
    currency: 'gbp',
    rate: () => 1,
    currentHousehold: { id: 'hh1', name: 'Home' },
    currentUserId: 'u1',
    currentPersonId: 'p1',
    people: [],
    transactions: [],
    properties: [],
    rentalPayments: [],
    tags: [],
    addTransaction: vi.fn(),
    addProperty: vi.fn(),
    addRentalPayment: vi.fn(),
    addTag: vi.fn(),
    resolveUser: (id: string) => ({ id, name: 'X', initial: 'X', color_key: 'sage', created_at: '' }),
  }),
}))

import { DataExportPanel } from '@/components/settings/DataExportPanel'

afterEach(cleanup)

describe('DataExportPanel', () => {
  it('defaults the language + currency selectors to the app’s current values', () => {
    render(<DataExportPanel />)
    const lang = screen.getByLabelText('Export language') as HTMLSelectElement
    const cur = screen.getByLabelText('Export currency') as HTMLSelectElement
    expect(lang.value).toBe('Español')
    expect(cur.value).toBe('gbp')
  })

  it('lets the user pick a different language and currency', async () => {
    const user = userEvent.setup()
    render(<DataExportPanel />)
    const lang = screen.getByLabelText('Export language') as HTMLSelectElement
    const cur = screen.getByLabelText('Export currency') as HTMLSelectElement
    await user.selectOptions(lang, '日本語')
    await user.selectOptions(cur, 'jpy')
    expect(lang.value).toBe('日本語')
    expect(cur.value).toBe('jpy')
  })

  it('offers a download action', () => {
    render(<DataExportPanel />)
    expect(screen.getByText('Download PDF')).toBeTruthy()
  })
})
