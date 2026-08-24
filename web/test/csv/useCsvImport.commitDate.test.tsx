// @vitest-environment jsdom
// Pin the committed date SHAPE of the web CSV import (review 2026-08-24, major
// A3): every other write path stores transaction dates as the shared noon-UTC
// instant (`YYYY-MM-DDT12:00:00.000Z`, spec 004 — TxForm, the CLI importer, and
// bank sync all agree), so an imported row renders on the same calendar day in
// every timezone. The web CSV flow used to slice the profile's noon-UTC
// instant down to a bare `YYYY-MM-DD`, which parses as *midnight* UTC and
// shifts the row to the previous local day for every viewer west of UTC.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook, act } from '@testing-library/react'
import type { Transaction } from '@/lib/types'

const addTransaction = vi.fn()

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

describe('useCsvImport committed date convention', () => {
  it('commits every imported row at the shared noon-UTC instant', async () => {
    const { result } = renderHook(() => useCsvImport())

    await act(async () => {
      await result.current.loadFile(new File([csvText], 'chase.csv', { type: 'text/csv' }))
    })
    expect(result.current.phase).toBe('list-view')

    await act(async () => {
      await result.current.startImport()
    })

    expect(addTransaction).toHaveBeenCalled()
    for (const call of addTransaction.mock.calls) {
      const tx = call[0] as Transaction
      expect(tx.date).toMatch(/^\d{4}-\d{2}-\d{2}T12:00:00\.000Z$/)
    }
  })
})
