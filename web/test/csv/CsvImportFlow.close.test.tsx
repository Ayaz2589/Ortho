// @vitest-environment jsdom
// Regression test: closing the CSV import panel must clear the persisted session
// so it does not auto-reopen on the next visit to the Transactions page.
// The fix is an imperative clearCsvSession() call in CsvImportFlow.handleClose —
// the useEffect-based approach races with the component unmount and loses.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

// Stub the Drawer chrome. DrawerHeader must render an accessible close button
// so the test can click it and trigger handleClose.
vi.mock('@/components/web/Drawer', () => ({
  Drawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ onClose }: { title: string; onClose: () => void }) => (
    <button aria-label="Close" onClick={onClose} />
  ),
}))

// Stub sub-components so they don't need context providers.
vi.mock('@/components/csv/CsvImportList', () => ({
  CsvImportList: () => <div data-testid="csv-list" />,
}))
vi.mock('@/components/csv/CsvImportSummary', () => ({
  CsvImportSummary: () => null,
}))
vi.mock('@/components/csv/CsvRowEditModal', () => ({
  CsvRowEditModal: () => null,
}))

// Drive the phase via a stubbed hook — pinned to list-view so the close button
// (rendered by DrawerHeader in that branch) is always present.
const { reset } = vi.hoisted(() => ({ reset: vi.fn() }))
vi.mock('@/lib/csv/useCsvImport', () => ({
  useCsvImport: () => ({
    phase: 'list-view',
    drafts: [],
    bankLabel: 'Chase',
    summary: null,
    loadFile: vi.fn(),
    toggleChecked: vi.fn(),
    updateDraft: vi.fn(),
    skipDraft: vi.fn(),
    startImport: vi.fn(),
    reset,
  }),
}))

// Imports after vi.mock so the mocks are in place.
import { CsvImportFlow } from '@/components/csv/CsvImportFlow'
import { saveCsvSession, hasCsvSession } from '@/lib/csv/csvImportPersistence'
import type { CsvImportState } from '@/lib/csv/csvImportSession'

// A minimal list-view session to pre-populate sessionStorage.
const SESSION: CsvImportState = {
  phase: 'list-view',
  bankLabel: 'Chase',
  period: { start: new Date('2026-06-01'), end: new Date('2026-06-30') },
  drafts: {},
}

beforeEach(() => {
  sessionStorage.clear()
  reset.mockClear()
})

describe('CsvImportFlow — close clears sessionStorage', () => {
  it('(a) clicking the close button removes the session key so the panel does not reopen', () => {
    saveCsvSession(SESSION)
    expect(hasCsvSession()).toBe(true) // precondition: session is persisted

    const onClose = vi.fn()
    render(<CsvImportFlow onClose={onClose} />)

    // The DrawerHeader stub renders aria-label="Close"
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    // Session must be gone — hasCsvSession() is the same guard used by the
    // Transactions page's auto-open useEffect.
    expect(hasCsvSession()).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('(b) unmounting WITHOUT close preserves the session (refresh-restore path)', () => {
    saveCsvSession(SESSION)

    // Simulate a page refresh: mount then unmount without clicking close.
    const { unmount } = render(<CsvImportFlow onClose={vi.fn()} />)
    unmount()

    // Session must still be present so the auto-open guard fires on next mount.
    expect(hasCsvSession()).toBe(true)
  })
})
