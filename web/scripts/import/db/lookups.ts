// Read-only lookups: users (owner picker), the operator's household + members
// (split eligibility), and existing rows (dedupe).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Household, Person, User } from '../../../lib/types'
import type { ExistingRow } from '../engine/dedupe'

export async function listUsers(supabase: SupabaseClient): Promise<User[]> {
  const { data, error } = await supabase.from('users').select('id,name,initial,color_key,created_at')
  if (error) throw new Error(`LOOKUP_USERS: ${error.message}`)
  return (data ?? []) as User[]
}

export interface HouseholdInfo {
  household: Household | null
  /** Active people in the operator's household (eligible owners + co-owners). */
  people: Person[]
  /** The person linked to the operator (default owner). Empty if unresolved. */
  defaultPersonId: string
}

export async function resolveHousehold(supabase: SupabaseClient, userId: string): Promise<HouseholdInfo> {
  const { data: mem, error: e1 } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
  if (e1) throw new Error(`LOOKUP_HOUSEHOLD: ${e1.message}`)
  const householdId = mem?.[0]?.household_id
  if (!householdId) return { household: null, people: [], defaultPersonId: '' }

  const { data: hh } = await supabase.from('households').select('*').eq('id', householdId).limit(1)
  const { data: rows, error: e2 } = await supabase
    .from('household_people')
    .select('*')
    .eq('household_id', householdId)
    .is('removed_at', null)
    .order('sort_order', { ascending: true })
  if (e2) throw new Error(`LOOKUP_PEOPLE: ${e2.message}`)
  const people = (rows ?? []) as Person[]
  const defaultPersonId = people.find((p) => p.linked_user_id === userId)?.id ?? people[0]?.id ?? ''
  return { household: (hh?.[0] ?? null) as Household | null, people, defaultPersonId }
}

/** All active people across households — admin-mode owner-name resolution for
 *  `tx list` (service role sees every household). */
export async function listAllPeople(supabase: SupabaseClient): Promise<Person[]> {
  const { data, error } = await supabase
    .from('household_people')
    .select('*')
    .is('removed_at', null)
  if (error) throw new Error(`LOOKUP_ALL_PEOPLE: ${error.message}`)
  return (data ?? []) as Person[]
}

export async function fetchExistingForDedupe(supabase: SupabaseClient, createdBy: string): Promise<ExistingRow[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('created_by,date,amount_cents,source')
    .eq('created_by', createdBy)
  if (error) throw new Error(`LOOKUP_EXISTING: ${error.message}`)
  return (data ?? []) as ExistingRow[]
}
