// @vitest-environment jsdom
// Hook-level check that importing seeds each draft's payment source from a card
// matching the detected bank (and leaves it unset when nothing matches).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook, act } from '@testing-library/react'

const addTransaction = vi.fn()
let mockCards: { id: string; household_id: string; name: string; created_at: string }[] = []

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    addTransaction,
    transactions: [],
    cards: mockCards,
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

async function loadChase() {
  const { result } = renderHook(() => useCsvImport())
  await act(async () => {
    await result.current.loadFile(new File([csvText], 'chase.csv', { type: 'text/csv' }))
  })
  return result
}

describe('useCsvImport payment-source seeding', () => {
  beforeEach(() => {
    mockCards = []
  })

  it('seeds a matching card as every row’s payment source', async () => {
    mockCards = [{ id: 'c1', household_id: 'hh-1', name: 'Chase Freedom', created_at: '' }]
    const result = await loadChase()
    expect(result.current.phase).toBe('list-view')
    expect(result.current.drafts.length).toBeGreaterThan(0)
    expect(result.current.drafts.every((d) => d.paymentSource === 'Chase Freedom')).toBe(true)
  })

  it('leaves the source unset when no card matches the bank', async () => {
    mockCards = [{ id: 'c1', household_id: 'hh-1', name: 'Amex Gold', created_at: '' }]
    const result = await loadChase()
    expect(result.current.drafts.every((d) => d.paymentSource === '')).toBe(true)
  })
})
