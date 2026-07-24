// @vitest-environment jsdom
// A parsed review session survives an accidental refresh: after loadFile the
// drafts are persisted, and a fresh useCsvImport() (as on a page reload) restores
// them without re-uploading.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook, act } from '@testing-library/react'

const addTransaction = vi.fn()

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    addTransaction,
    transactions: [],
    cards: [{ id: 'c1', household_id: 'hh-1', name: 'Chase Freedom', created_at: '' }],
    currentUserId: 'user-1',
    currentPersonId: 'person-1',
    currentHousehold: { id: 'hh-1', name: 'Home' },
    householdMembers: [{ id: 'person-1', name: 'Me' }],
  }),
}))

import { useCsvImport } from '@/lib/csv/useCsvImport'
import { hasCsvSession } from '@/lib/csv/csvImportPersistence'

const csvText = (
  JSON.parse(readFileSync(resolve(process.cwd(), 'test/import/fixtures/chase-2026-06.pages.json'), 'utf8')) as string[]
).join('\n')

beforeEach(() => sessionStorage.clear())

describe('useCsvImport session restore', () => {
  it('restores the parsed drafts into a fresh hook after a refresh', async () => {
    // 1) Upload + parse in the "pre-refresh" hook.
    const first = renderHook(() => useCsvImport())
    await act(async () => {
      await first.result.current.loadFile(new File([csvText], 'chase.csv', { type: 'text/csv' }))
    })
    expect(first.result.current.phase).toBe('list-view')
    const beforeCount = first.result.current.drafts.length
    expect(beforeCount).toBeGreaterThan(0)
    expect(hasCsvSession()).toBe(true)

    // Simulate the page unmounting on refresh.
    first.unmount()

    // 2) A brand-new hook (no loadFile) should come back up already in list-view.
    const second = renderHook(() => useCsvImport())
    expect(second.result.current.phase).toBe('list-view')
    expect(second.result.current.drafts.length).toBe(beforeCount)
    expect(second.result.current.drafts.some((d) => /Amazon/.test(d.merchant))).toBe(true)
    // The matched payment source is preserved too.
    expect(second.result.current.drafts.every((d) => d.paymentSource === 'Chase Freedom')).toBe(true)
  })

  it('does not restore after the session is committed (import cleared)', async () => {
    const first = renderHook(() => useCsvImport())
    await act(async () => {
      await first.result.current.loadFile(new File([csvText], 'chase.csv', { type: 'text/csv' }))
    })
    await act(async () => {
      await first.result.current.startImport()
    })
    // startImport → importing/summary clears the persisted session.
    expect(hasCsvSession()).toBe(false)
    first.unmount()

    const second = renderHook(() => useCsvImport())
    expect(second.result.current.phase).not.toBe('list-view')
  })
})
