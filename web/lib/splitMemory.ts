import type { Transaction } from './types'

export interface SplitMemory {
  ownerIds: string[]
  shares: Record<string, number>
}

/** Returns the most-recent multi-person transaction for the exact merchant name,
 *  or null if there is none (unknown merchant, solo split, or transfer). */
export function getLastSplitForMerchant(merchant: string, transactions: Transaction[]): SplitMemory | null {
  const match = transactions
    .filter(
      (tx) =>
        tx.kind !== 'transfer' &&
        tx.merchant === merchant &&
        tx.owner_ids.length >= 2
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

  if (!match) return null
  return { ownerIds: match.owner_ids, shares: match.shares }
}
