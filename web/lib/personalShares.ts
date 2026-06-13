// Personal-scope transactions can be split with LOCAL (device-only) users. Those
// participant IDs/splits must never go to Supabase (local users have no account
// there), so we persist them on-device, keyed by transaction id, and merge them
// back when transactions reload from the server. Mirrors the iOS `personalShares`
// store. See lib/store.tsx (rehydrate + add/update/delete) for the wiring.

export interface PersonalShare {
  owner_ids: string[]
  /** Explicit per-owner percentages (sum 100); null = split evenly. */
  splits: Record<string, number> | null
}

const KEY = 'personalShares'

export function readPersonalShares(): Record<string, PersonalShare> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, PersonalShare>) : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, PersonalShare>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function writePersonalShare(txId: string, share: PersonalShare): void {
  const all = readPersonalShares()
  all[txId] = share
  writeAll(all)
}

export function removePersonalShare(txId: string): void {
  const all = readPersonalShares()
  if (txId in all) {
    delete all[txId]
    writeAll(all)
  }
}

/** Drop stored shares whose transaction no longer exists (e.g. deleted elsewhere). */
export function prunePersonalShares(keepIds: Set<string>): void {
  const all = readPersonalShares()
  let changed = false
  for (const id of Object.keys(all)) {
    if (!keepIds.has(id)) {
      delete all[id]
      changed = true
    }
  }
  if (changed) writeAll(all)
}

/**
 * Resolve a personal transaction's owners/splits: a saved local share wins,
 * otherwise it's just the creator. Pure — the merge logic the store/tests use.
 */
export function resolvePersonalOwners(
  txId: string,
  createdBy: string,
  saved: Record<string, PersonalShare>
): PersonalShare {
  const s = saved[txId]
  if (s && s.owner_ids.length > 0) return { owner_ids: s.owner_ids, splits: s.splits }
  return { owner_ids: [createdBy], splits: null }
}
