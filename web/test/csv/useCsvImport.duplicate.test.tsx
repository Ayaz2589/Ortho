// @vitest-environment jsdom
// End-to-end (hook-level) check that duplicate detection runs when the CSV is
// PARSED (loadFile), not at commit time: a manually-added ledger row is flagged
// the moment the file is loaded, before the user touches "Add transactions".
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook, act } from '@testing-library/react'

const addTransaction = vi.fn()

// A manually-entered "Amazon" on the same day + amount as the Chase fixture's
// "Amazon Prime" row (2026-06-01, $16.32).
const manualTx = {
  id: 'manual-amazon',
  date: '2026-06-01',
  amount_cents: 1632,
  merchant: 'Amazon',
}

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    addTransaction,
    transactions: [manualTx],
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

describe('useCsvImport duplicate detection at parse time', () => {
  it('flags a manually-added ledger row as a duplicate as soon as the CSV is parsed', async () => {
    const { result } = renderHook(() => useCsvImport())

    await act(async () => {
      await result.current.loadFile(new File([csvText], 'chase.csv', { type: 'text/csv' }))
    })

    expect(result.current.phase).toBe('list-view')
    const amazonPrime = result.current.drafts.find((d) => d.merchant === 'Amazon Prime')
    expect(amazonPrime).toBeDefined()
    // Detected at parse — before any "Add transactions" click.
    expect(amazonPrime!.duplicateOf).toBe('manual-amazon')
    expect(amazonPrime!.checked).toBe(false)
    // A non-matching row stays a normal, checked draft.
    const other = result.current.drafts.find((d) => d.merchant === 'Amazon Mktpl' && d.amountCents === 15237)
    expect(other!.duplicateOf).toBeNull()
    expect(other!.checked).toBe(true)
  })
})
