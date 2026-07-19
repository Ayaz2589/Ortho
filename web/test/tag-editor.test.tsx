// @vitest-environment jsdom
// Spec 027 — the inline tag editor: add new / reuse existing / remove chips.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

type Tag = { id: string; household_id: string; name: string; created_at: string }
let ROSTER: Tag[] = []
const addTagSpy = vi.fn((name: string): Tag => {
  const trimmed = name.trim()
  const existing = ROSTER.find((t) => t.name.trim().toLowerCase() === trimmed.toLowerCase())
  if (existing) return existing
  const created = { id: `tag-${ROSTER.length + 1}`, household_id: 'h1', name: trimmed, created_at: '2026-01-01' }
  ROSTER = [...ROSTER, created]
  return created
})

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    tags: ROSTER,
    addTag: addTagSpy,
    t: (k: string, ...a: Array<string | number>) => (a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k),
  }),
}))

import { TagEditor } from '@/components/web/TagEditor'

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <>
      <TagEditor value={value} onChange={setValue} />
      <span data-testid="ids">{value.join(',')}</span>
    </>
  )
}

afterEach(() => {
  ROSTER = [{ id: 'tag-vacay', household_id: 'h1', name: 'vacation', created_at: '2026-01-01' }]
  addTagSpy.mockClear()
})

describe('TagEditor (spec 027)', () => {
  it('typing a new name + Enter creates a tag and attaches its id', async () => {
    ROSTER = []
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Add a tag'), 'work')
    await user.keyboard('{Enter}')
    expect(addTagSpy).toHaveBeenCalledWith('work')
    expect(screen.getByTestId('ids').textContent).toBe('tag-1')
    expect(screen.getByText('work')).toBeInTheDocument()
  })

  it('typing an existing name (any case) reuses the same tag id', async () => {
    ROSTER = [{ id: 'tag-vacay', household_id: 'h1', name: 'vacation', created_at: '2026-01-01' }]
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Add a tag'), 'Vacation')
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('ids').textContent).toBe('tag-vacay')
    // No new tag was created in the roster.
    expect(ROSTER).toHaveLength(1)
  })

  it('the × removes a chip from the transaction only', async () => {
    ROSTER = [{ id: 'tag-vacay', household_id: 'h1', name: 'vacation', created_at: '2026-01-01' }]
    const user = userEvent.setup()
    render(<Harness initial={['tag-vacay']} />)
    expect(screen.getByTestId('ids').textContent).toBe('tag-vacay')
    await user.click(screen.getByRole('button', { name: 'Remove vacation' }))
    expect(screen.getByTestId('ids').textContent).toBe('')
    // The household roster still has the tag (detach ≠ delete).
    expect(ROSTER).toHaveLength(1)
  })

  it('empty / whitespace input adds nothing', async () => {
    ROSTER = []
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Add a tag'), '   ')
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('ids').textContent).toBe('')
    expect(ROSTER).toHaveLength(0)
  })
})
