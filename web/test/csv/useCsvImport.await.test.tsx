// @vitest-environment jsdom
//
// Review 2026-08-24 (store-writepath minors):
// - startImport reported "N added" while every row's RPC was still in flight
//   (addTransaction was fire-and-forget) — a failed write was still counted.
//   The summary must await the writes and report real added/failed counts.
// - profile.parse() exceptions were unhandled: a malformed cell left the
//   import tray silently unresponsive. loadFile must catch and surface a
//   recoverable error state.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook, act } from '@testing-library/react'

// Every write fails (e.g. offline / expired session): the summary must say 0.
const addTransaction = vi.fn(() => Promise.resolve(false))

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    addTransaction,
    transactions: [],
    cards: [],
    currentUserId: 'user-1',
    currentPersonId: 'person-1',
    currentHousehold: { id: 'hh-1', name: 'Home' },
    householdMembers: [{ id: 'person-1', name: 'Me' }],
  }),
}))

import { useCsvImport } from '@/lib/csv/useCsvImport'

const csvText = (
  JSON.parse(readFileSync(resolve(process.cwd(), 'test/import/fixtures/chase-2026-06.pages.json'), 'utf8')) as string[]
).join('\n')

describe('useCsvImport write honesty', () => {
  it('reports real added/failed counts after awaiting every write', async () => {
    const { result } = renderHook(() => useCsvImport())

    await act(async () => {
      await result.current.loadFile(new File([csvText], 'chase.csv', { type: 'text/csv' }))
    })
    const attempted = result.current.drafts.filter((d) => d.checked && !d.isPaymentRow).length
    expect(attempted).toBeGreaterThan(0)

    await act(async () => {
      await result.current.startImport()
    })

    expect(result.current.phase).toBe('summary')
    expect(result.current.summary!.addedCount).toBe(0)
    expect(result.current.summary!.failedCount).toBe(attempted)
  })

  it('a CSV that detects but fails to parse lands in a visible error state, not a dead tray', async () => {
    const { result } = renderHook(() => useCsvImport())

    // Chase header detects; the row's one-decimal amount throws INVALID_AMOUNT.
    const malformed = [
      'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
      '07/20/2026,07/21/2026,STARBUCKS STORE 123,Food & Drink,Sale,-38.5,',
    ].join('\n')

    await act(async () => {
      await result.current.loadFile(new File([malformed], 'chase.csv', { type: 'text/csv' })).catch(() => {})
    })

    expect(result.current.phase).toBe('undetected')
  })
})
