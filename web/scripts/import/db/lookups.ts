// Read-only lookups: users (owner picker), the operator's household + members
// (split eligibility), and existing rows (dedupe).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Household, User } from '../../../lib/types'
import type { ExistingRow } from '../engine/dedupe'

export async function listUsers(supabase: SupabaseClient): Promise<User[]> {
  const { data, error } = await supabase.from('users').select('id,name,initial,color_key,created_at')
  if (error) throw new Error(`LOOKUP_USERS: ${error.message}`)
  return (data ?? []) as User[]
}

export interface HouseholdInfo {
  household: Household | null
  /** All members of the operator's household (eligible co-owners for splits). */
  members: User[]
}

export async function resolveHousehold(supabase: SupabaseClient, userId: string): Promise<HouseholdInfo> {
  const { data: mem, error: e1 } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
  if (e1) throw new Error(`LOOKUP_HOUSEHOLD: ${e1.message}`)
  const householdId = mem?.[0]?.household_id
  if (!householdId) return { household: null, members: [] }

  const { data: hh } = await supabase.from('households').select('*').eq('id', householdId).limit(1)
  const { data: rows, error: e2 } = await supabase
    .from('household_members')
    .select('users(id,name,initial,color_key,created_at)')
    .eq('household_id', householdId)
  if (e2) throw new Error(`LOOKUP_MEMBERS: ${e2.message}`)
  // supabase types the joined relation as an array; normalize to flat User[].
  const members = ((rows ?? []) as unknown as Array<{ users: User | User[] | null }>)
    .flatMap((r) => (Array.isArray(r.users) ? r.users : r.users ? [r.users] : []))
    .filter((u): u is User => Boolean(u && u.id))
  return { household: (hh?.[0] ?? null) as Household | null, members }
}

export async function fetchExistingForDedupe(supabase: SupabaseClient, createdBy: string): Promise<ExistingRow[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('created_by,date,amount_cents,source')
    .eq('created_by', createdBy)
  if (error) throw new Error(`LOOKUP_EXISTING: ${error.message}`)
  return (data ?? []) as ExistingRow[]
}
