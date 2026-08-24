// @vitest-environment jsdom
//
// Review 2026-08-24 (test gap): store-level people CRUD was pinned but no test
// rendered the Household page or HouseholdDrawer, leaving the UI-level
// attribution guards unpinned — the account holder must never be removable,
// the last person must never be removable, and remove must be two-step. Also
// pins the swatch fix from the same review: color buttons must expose a
// localized color NAME as their accessible name, not the raw palette key.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { User } from '@/lib/types'

const h = vi.hoisted(() => ({
  members: [] as User[],
  currentPersonId: 'u1',
  addPerson: vi.fn(),
  renamePerson: vi.fn(),
  setPersonColor: vi.fn(),
  removePerson: vi.fn(),
  updateHouseholdName: vi.fn(),
}))

const user = (id: string, name: string): User => ({
  id,
  name,
  initial: name[0].toUpperCase(),
  color_key: 'sage',
  created_at: '2026-01-01T00:00:00.000Z',
})

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    currentHousehold: { id: 'h1', owner_id: 'u1', name: 'Home', created_at: '2026-01-01' },
    currentPersonId: h.currentPersonId,
    householdMembers: h.members,
    linkedInstitutions: [],
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    monthlySpentBy: () => 0,
    updateHouseholdName: h.updateHouseholdName,
    addPerson: h.addPerson,
    renamePerson: h.renamePerson,
    setPersonColor: h.setPersonColor,
    removePerson: h.removePerson,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import HouseholdPage from '@/app/(app)/settings/household/page'

beforeEach(() => {
  h.members = [user('u1', 'Alex'), user('u2', 'Sam')]
  h.currentPersonId = 'u1'
  h.addPerson.mockClear()
  h.renamePerson.mockClear()
  h.setPersonColor.mockClear()
  h.removePerson.mockClear()
  h.updateHouseholdName.mockClear()
})
afterEach(cleanup)

const openMember = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
}

describe('Household member management UI', () => {
  it('lists every member and opens the person drawer from a row', () => {
    render(<HouseholdPage />)
    expect(screen.getByText('Alex')).toBeTruthy()
    expect(screen.getByText('Sam')).toBeTruthy()
    openMember('Sam')
    expect(screen.getByText('Person')).toBeTruthy()
  })

  it('never offers Remove for the signed-in person (the account holder)', () => {
    render(<HouseholdPage />)
    openMember('Alex')
    expect(screen.queryByText('Remove person')).toBeNull()
  })

  it('never offers Remove in a one-person household', () => {
    // Even for a row that is NOT the signed-in person — the two guards are
    // independent (`!isCurrentPerson && householdMembers.length > 1`).
    h.members = [user('u2', 'Sam')]
    render(<HouseholdPage />)
    openMember('Sam')
    expect(screen.queryByText('Remove person')).toBeNull()
  })

  it('removing another member is two-step and calls removePerson with their id', () => {
    render(<HouseholdPage />)
    openMember('Sam')
    fireEvent.click(screen.getByText('Remove person'))
    // First tap only asks — nothing removed yet.
    expect(h.removePerson).not.toHaveBeenCalled()
    expect(screen.getByText('Remove this person? Past transactions keep their name.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(h.removePerson).toHaveBeenCalledWith('u2')
  })

  it('cancel backs out of the remove confirmation without removing', () => {
    render(<HouseholdPage />)
    openMember('Sam')
    fireEvent.click(screen.getByText('Remove person'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.removePerson).not.toHaveBeenCalled()
    expect(screen.getByText('Remove person')).toBeTruthy()
  })

  it('adds a person with the chosen name and color; Add is disabled while the name is empty', () => {
    render(<HouseholdPage />)
    fireEvent.click(screen.getByText('Add person'))
    const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('e.g. Alex'), { target: { value: '  Jordan  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Slate' }))
    fireEvent.click(add)
    expect(h.addPerson).toHaveBeenCalledWith('Jordan', 'slate')
  })

  it('renames a member and updates their color on Save', () => {
    render(<HouseholdPage />)
    openMember('Sam')
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Sammy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mauve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(h.renamePerson).toHaveBeenCalledWith('u2', 'Sammy')
    expect(h.setPersonColor).toHaveBeenCalledWith('u2', 'mauve')
  })

  it('an unchanged Save calls neither renamePerson nor setPersonColor', () => {
    render(<HouseholdPage />)
    openMember('Sam')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(h.renamePerson).not.toHaveBeenCalled()
    expect(h.setPersonColor).not.toHaveBeenCalled()
  })

  it('color swatches expose localized color names, not raw palette keys (a11y)', () => {
    render(<HouseholdPage />)
    fireEvent.click(screen.getByText('Add person'))
    for (const name of ['Peach', 'Slate', 'Sage', 'Terracotta', 'Mauve', 'Sand']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: 'peach' })).toBeNull()
  })
})
