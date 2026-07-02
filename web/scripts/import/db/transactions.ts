// Transaction CRUD against Supabase, reproducing web/lib/store.tsx semantics so
// CLI rows are indistinguishable from app rows. txRecord/shareRows from persist.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transaction } from '../../../lib/types'
import { txRecord, shareRows } from './persist'

/** Fetch one transaction by id (RLS-scoped), with owner_ids/splits rehydrated. */
export async function getOne(supabase: SupabaseClient, id: string): Promise<Transaction | null> {
  const { data, error } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`GET_TX: ${error.message}`)
  if (!data) return null
  const tx = data as Transaction
  const { data: shares } = await supabase.from('transaction_shares').select('person_id,amount_cents').eq('transaction_id', id)
  const rows = (shares ?? []) as Array<{ person_id: string; amount_cents: number }>
  tx.owner_ids = rows.length ? rows.map((s) => s.person_id) : [tx.created_by]
  tx.shares = rows.length
    ? Object.fromEntries(rows.map((s) => [s.person_id, Number(s.amount_cents)]))
    : { [tx.created_by]: tx.amount_cents }
  return tx
}

export interface ListResult {
  rows: Transaction[]
  /** True when the fetch filled `limit` — the operator must be told the list
   *  is cut (spec 013 US5: an explicit cap, never a silent one). */
  truncated: boolean
}

/**
 * Fetch household transactions for `tx list` (spec 013 US5). Scope matches
 * the apps: the WHOLE household (`householdId`; pass null in admin mode for
 * all households) — never `created_by`. Only the date window narrows in SQL;
 * every other criterion runs through the shared `filterTransactions`
 * in-process. Rows are rehydrated with owner_ids/shares (one batched
 * transaction_shares read) so owner filters and owner-name search work.
 */
export async function listTransactions(
  supabase: SupabaseClient,
  householdId: string | null,
  window: { startISO?: string; endISO?: string },
  limit: number
): Promise<ListResult> {
  let q = supabase.from('transactions').select('*')
  if (householdId !== null) q = q.eq('household_id', householdId)
  if (window.startISO) q = q.gte('date', window.startISO)
  if (window.endISO) q = q.lt('date', window.endISO)
  const { data, error } = await q.order('date', { ascending: false }).limit(limit)
  if (error) throw new Error(`LIST_TX: ${error.message}`)
  const rows = (data ?? []) as Transaction[]

  if (rows.length > 0) {
    const { data: shares, error: se } = await supabase
      .from('transaction_shares')
      .select('transaction_id,person_id,amount_cents')
      .in('transaction_id', rows.map((r) => r.id))
    if (se) throw new Error(`LIST_SHARES: ${se.message}`)
    const byTx = new Map<string, Array<{ person_id: string; amount_cents: number }>>()
    for (const s of (shares ?? []) as Array<{ transaction_id: string; person_id: string; amount_cents: number }>) {
      const arr = byTx.get(s.transaction_id) ?? []
      arr.push(s)
      byTx.set(s.transaction_id, arr)
    }
    for (const tx of rows) {
      const own = byTx.get(tx.id) ?? []
      tx.owner_ids = own.length ? own.map((s) => s.person_id) : [tx.created_by]
      tx.shares = own.length
        ? Object.fromEntries(own.map((s) => [s.person_id, Number(s.amount_cents)]))
        : { [tx.created_by]: tx.amount_cents }
    }
  }
  return { rows, truncated: rows.length >= limit }
}

/** Mirror store addTransaction — including its compensation: a failed shares
 *  write deletes the just-inserted parent so no share-less row can persist
 *  and rehydrate as "creator owns all" (spec 013 US5/A2). */
export async function createOne(supabase: SupabaseClient, tx: Transaction): Promise<void> {
  const { error } = await supabase.from('transactions').insert(txRecord(tx))
  if (error) throw new Error(`CREATE_TX: ${error.message}`)
  const rows = shareRows(tx)
  if (rows.length) {
    const { error: se } = await supabase.from('transaction_shares').insert(rows)
    if (se) {
      const { error: de } = await supabase.from('transactions').delete().eq('id', tx.id)
      if (de) {
        throw new Error(
          `CREATE_SHARES: ${se.message}; ROLLBACK_FAILED — orphaned parent ${tx.id}: ${de.message}`
        )
      }
      throw new Error(`CREATE_SHARES: ${se.message} (parent row rolled back)`)
    }
  }
}

/** Mirror store updateTransaction + writeShares (delete-then-insert), with the
 *  store's compensation: if the re-insert fails, restore the previous shares
 *  so the row never rehydrates as "creator owns all" (spec 013 US5/A2). */
export async function updateOne(supabase: SupabaseClient, tx: Transaction): Promise<void> {
  // Capture the prior shares before touching anything — they are the rollback.
  const { data: prior, error: pe } = await supabase
    .from('transaction_shares')
    .select('transaction_id,person_id,amount_cents')
    .eq('transaction_id', tx.id)
  if (pe) throw new Error(`UPDATE_SHARES_READ: ${pe.message}`)

  const { error } = await supabase.from('transactions').update(txRecord(tx)).eq('id', tx.id)
  if (error) throw new Error(`UPDATE_TX: ${error.message}`)
  const { error: de } = await supabase.from('transaction_shares').delete().eq('transaction_id', tx.id)
  if (de) throw new Error(`UPDATE_SHARES_DELETE: ${de.message}`)
  const rows = shareRows(tx)
  if (rows.length) {
    const { error: ie } = await supabase.from('transaction_shares').insert(rows)
    if (ie) {
      const { error: re } = await supabase.from('transaction_shares').insert(prior ?? [])
      if (re) {
        throw new Error(
          `UPDATE_SHARES_INSERT: ${ie.message}; ROLLBACK_FAILED — ${tx.id} left share-less: ${re.message}`
        )
      }
      throw new Error(`UPDATE_SHARES_INSERT: ${ie.message} (previous shares restored)`)
    }
  }
}

/** Mirror store deleteTransaction (transaction_shares cascade via FK). */
export async function deleteOne(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw new Error(`DELETE_TX: ${error.message}`)
}
