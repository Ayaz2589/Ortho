// Persist transactions via the upsert_transaction atomic RPC, mirroring
// web/lib/store.tsx so imported rows are indistinguishable from app-entered
// ones (contracts/persistence.md, spec 027-ledger-atomic-persistence).
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

/** Upsert each transaction and its shares atomically via the RPC. Returns the number written. */
export async function persist(supabase: SupabaseClient, txs: Transaction[]): Promise<number> {
  let written = 0
  for (const tx of txs) {
    const { error } = await supabase.rpc('upsert_transaction', {
      p_tx: txRecord(tx),
      p_shares: shareRows(tx),
    })
    if (error) throw new Error(`UPSERT_TX (${written} written): ${(error as { message: string }).message}`)
    written++
  }
  return written
}
