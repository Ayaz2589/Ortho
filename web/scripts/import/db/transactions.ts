// Transaction CRUD against Supabase, reproducing web/lib/store.tsx semantics so
// CLI rows are indistinguishable from app rows. txRecord/shareRows from persist.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transaction } from '../../../lib/types'
import type { TxFilter } from '../engine/filters'
import { txRecord, shareRows } from './persist'

/** Fetch one transaction by id (RLS-scoped), with owner_ids/splits rehydrated. */
export async function getOne(supabase: SupabaseClient, id: string): Promise<Transaction | null> {
  const { data, error } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`GET_TX: ${error.message}`)
  if (!data) return null
  const tx = data as Transaction
  const { data: shares } = await supabase.from('transaction_shares').select('user_id,percent').eq('transaction_id', id)
  const rows = (shares ?? []) as Array<{ user_id: string; percent: number }>
  tx.owner_ids = rows.length ? rows.map((s) => s.user_id) : [tx.created_by]
  tx.splits = rows.length ? Object.fromEntries(rows.map((s) => [s.user_id, Number(s.percent)])) : null
  return tx
}

export async function listTransactions(
  supabase: SupabaseClient,
  userId: string,
  filter: TxFilter,
  admin: boolean
): Promise<Transaction[]> {
  let q = supabase.from('transactions').select('*')
  if (!admin) q = q.eq('created_by', userId)
  if (filter.category) q = q.eq('category', filter.category)
  if (filter.source) q = q.eq('source', filter.source)
  if (filter.scope) q = q.eq('scope', filter.scope)
  if (filter.kind) q = q.eq('kind', filter.kind)
  if (filter.startISO) q = q.gte('date', filter.startISO)
  if (filter.endISO) q = q.lt('date', filter.endISO)
  const { data, error } = await q.order('date', { ascending: false }).limit(filter.limit ?? 200)
  if (error) throw new Error(`LIST_TX: ${error.message}`)
  return (data ?? []) as Transaction[]
}

/** Mirror store addTransaction. */
export async function createOne(supabase: SupabaseClient, tx: Transaction): Promise<void> {
  const { error } = await supabase.from('transactions').insert(txRecord(tx))
  if (error) throw new Error(`CREATE_TX: ${error.message}`)
  const rows = shareRows(tx)
  if (rows.length) {
    const { error: se } = await supabase.from('transaction_shares').insert(rows)
    if (se) throw new Error(`CREATE_SHARES: ${se.message}`)
  }
}

/** Mirror store updateTransaction + writeShares (delete-then-insert). */
export async function updateOne(supabase: SupabaseClient, tx: Transaction): Promise<void> {
  const { error } = await supabase.from('transactions').update(txRecord(tx)).eq('id', tx.id)
  if (error) throw new Error(`UPDATE_TX: ${error.message}`)
  const { error: de } = await supabase.from('transaction_shares').delete().eq('transaction_id', tx.id)
  if (de) throw new Error(`UPDATE_SHARES_DELETE: ${de.message}`)
  const rows = shareRows(tx)
  if (rows.length) {
    const { error: ie } = await supabase.from('transaction_shares').insert(rows)
    if (ie) throw new Error(`UPDATE_SHARES_INSERT: ${ie.message}`)
  }
}

/** Mirror store deleteTransaction (transaction_shares cascade via FK). */
export async function deleteOne(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw new Error(`DELETE_TX: ${error.message}`)
}
