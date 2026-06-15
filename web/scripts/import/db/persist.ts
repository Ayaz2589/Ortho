// Persist transactions, mirroring web/lib/store.tsx txRecord + writeShares so
// imported rows are indistinguishable from app-entered ones (contracts/persistence.md).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transaction } from '../../../lib/types'
import { effectiveSplits } from '../../../lib/format'

/** The exact column set the web store inserts into `transactions`. */
export function txRecord(tx: Transaction) {
  return {
    id: tx.id,
    household_id: tx.household_id,
    merchant: tx.merchant,
    category: tx.category,
    kind: tx.kind,
    scope: tx.scope,
    amount_cents: tx.amount_cents,
    source: tx.source,
    date: tx.date,
    created_by: tx.created_by,
  }
}

/** transaction_shares rows for a shared tx (none for personal). */
export function shareRows(tx: Transaction): Array<{ transaction_id: string; user_id: string; percent: number }> {
  if (tx.scope !== 'shared') return []
  const splits = effectiveSplits(tx)
  return tx.owner_ids.map((uid) => ({ transaction_id: tx.id, user_id: uid, percent: splits[uid] ?? 0 }))
}

/** Insert each transaction (+ its shares). Returns the number written. */
export async function persist(supabase: SupabaseClient, txs: Transaction[]): Promise<number> {
  let written = 0
  for (const tx of txs) {
    const { error } = await supabase.from('transactions').insert(txRecord(tx))
    if (error) throw new Error(`INSERT_TX (${written} written): ${error.message}`)
    const rows = shareRows(tx)
    if (rows.length) {
      const { error: se } = await supabase.from('transaction_shares').insert(rows)
      if (se) throw new Error(`INSERT_SHARES for ${tx.id}: ${se.message}`)
    }
    written++
  }
  return written
}
