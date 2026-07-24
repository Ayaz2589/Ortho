// Persist an in-progress CSV import review so an accidental page refresh doesn't
// throw away the parsed rows the user was editing. Only the `list-view` phase
// (the drafts under review) is worth restoring; every other phase clears it.
//
// sessionStorage (not localStorage) is deliberate: the review survives a refresh
// but is dropped when the tab closes, so a stale half-reviewed statement never
// resurfaces days later.
import type { CsvImportState } from './csvImportSession'

const KEY = 'ortho.csvImport.session.v1'

function store(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    // Access can throw (privacy mode, disabled storage) — treat as unavailable.
    return null
  }
}

/** Save the session when it's a `list-view` (has parsed drafts); otherwise clear
 *  the stored session. Failures (quota, serialization) are swallowed — persistence
 *  is best-effort and never blocks the import flow. */
export function saveCsvSession(state: CsvImportState): void {
  const s = store()
  if (!s) return
  try {
    if (state.phase === 'list-view') s.setItem(KEY, JSON.stringify(state))
    else s.removeItem(KEY)
  } catch {
    /* best-effort */
  }
}

/** Restore a persisted `list-view` session, or null if none/invalid. */
export function loadCsvSession(): CsvImportState | null {
  const s = store()
  if (!s) return null
  try {
    const raw = s.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CsvImportState
    if (parsed?.phase === 'list-view' && parsed.drafts && typeof parsed.drafts === 'object') {
      // JSON turns the period's Dates into strings — rehydrate so the restored
      // state still satisfies the StatementPeriod (Date) contract.
      if (parsed.period) {
        parsed.period = { start: new Date(parsed.period.start), end: new Date(parsed.period.end) }
      }
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function clearCsvSession(): void {
  const s = store()
  if (!s) return
  try {
    s.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** True when a restorable review session is stored — used to auto-open the tray. */
export function hasCsvSession(): boolean {
  return loadCsvSession() !== null
}
