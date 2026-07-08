// Persist transactions, mirroring web/lib/store.tsx txRecord + writeShares so
// imported rows are indistinguishable from app-entered ones (contracts/persistence.md).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transaction } from '../../../lib/types'
import { effectiveShares } from '../../../lib/format'

/** The exact column set the web store inserts into `transactions`. */
export function txRecord(tx: Transaction) {
  return {
    id: tx.id,
    household_id: tx.household_id,
    merchant: tx.merchant,
    category: tx.category,
    kind: tx.kind,
    amount_cents: tx.amount_cents,
    source: tx.source,
    date: tx.date,
    created_by: tx.created_by,
    // Who fronted the money — required for settle-up (balanceBetween drops an
    // expense with no payer). The web store writes this; the CLI must too, or
    // imported expenses silently fall out of the reimbursement balance.
    paid_by: tx.paid_by ?? null,
  }
}

/** transaction_shares rows: one cents-share per owner (person), always materialized. */
export function shareRows(tx: Transaction): Array<{ transaction_id: string; person_id: string; amount_cents: number }> {
  const shares = effectiveShares(tx)
  return tx.owner_ids.map((pid) => ({ transaction_id: tx.id, person_id: pid, amount_cents: shares[pid] ?? 0 }))
}

/** Insert each transaction (+ its shares). Returns the number written.
 *  Compensates like the apps (spec 013 US5/A2): a failed shares insert
 *  deletes the just-inserted parent before throwing, so a partial failure
 *  can never leave a share-less row that rehydrates as "creator owns all". */
export async function persist(supabase: SupabaseClient, txs: Transaction[]): Promise<number> {
  let written = 0
  for (const tx of txs) {
    const { error } = await supabase.from('transactions').insert(txRecord(tx))
    if (error) throw new Error(`INSERT_TX (${written} written): ${error.message}`)
    const rows = shareRows(tx)
    if (rows.length) {
      const { error: se } = await supabase.from('transaction_shares').insert(rows)
      if (se) {
        const { error: de } = await supabase.from('transactions').delete().eq('id', tx.id)
        if (de) {
          throw new Error(
            `INSERT_SHARES for ${tx.id} (${written} written): ${se.message}; ` +
              `ROLLBACK_FAILED — orphaned parent ${tx.id}: ${de.message}`
          )
        }
        throw new Error(
          `INSERT_SHARES for ${tx.id} (${written} written): ${se.message} (parent row rolled back)`
        )
      }
    }
    written++
  }
  return written
}
