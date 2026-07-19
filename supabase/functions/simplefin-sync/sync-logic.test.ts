import { assertEquals } from 'jsr:@std/assert@1'
import { isManualRefreshBlocked, pickDefaultPerson, type HouseholdPerson } from './sync-logic.ts'

const HOUR = 60 * 60 * 1000

Deno.test('isManualRefreshBlocked: never blocked when there is no prior manual refresh', () => {
  assertEquals(isManualRefreshBlocked(null, Date.now()), false)
})

Deno.test('isManualRefreshBlocked: blocked within the cooldown window', () => {
  const now = 10 * HOUR
  const tenMinAgo = new Date(now - 10 * 60 * 1000).toISOString()
  assertEquals(isManualRefreshBlocked(tenMinAgo, now), true)
})

Deno.test('isManualRefreshBlocked: allowed once the cooldown has passed', () => {
  const now = 10 * HOUR
  const twoHoursAgo = new Date(now - 2 * HOUR).toISOString()
  assertEquals(isManualRefreshBlocked(twoHoursAgo, now), false)
})

Deno.test('isManualRefreshBlocked: unparseable timestamp is treated as not blocked', () => {
  assertEquals(isManualRefreshBlocked('not-a-date', Date.now()), false)
})

const people: HouseholdPerson[] = [
  { id: 'p-owner', linked_user_id: 'user-1', sort_order: 1, removed_at: null },
  { id: 'p-partner', linked_user_id: 'user-2', sort_order: 0, removed_at: null },
  { id: 'p-removed', linked_user_id: 'user-3', sort_order: -1, removed_at: '2026-01-01T00:00:00Z' },
]

Deno.test('pickDefaultPerson: prefers the person linked to the connecting member', () => {
  assertEquals(pickDefaultPerson(people, 'user-1'), 'p-owner')
})

Deno.test('pickDefaultPerson: falls back to the lowest sort_order active person', () => {
  // createdBy has no linked person → lowest sort_order among active (p-partner=0).
  assertEquals(pickDefaultPerson(people, 'user-nobody'), 'p-partner')
})

Deno.test('pickDefaultPerson: never returns a removed person', () => {
  const onlyRemoved: HouseholdPerson[] = [
    { id: 'p-removed', linked_user_id: 'user-3', sort_order: 0, removed_at: '2026-01-01T00:00:00Z' },
  ]
  assertEquals(pickDefaultPerson(onlyRemoved, 'user-3'), null)
})

Deno.test('pickDefaultPerson: null when there are no people', () => {
  assertEquals(pickDefaultPerson([], 'user-1'), null)
})
