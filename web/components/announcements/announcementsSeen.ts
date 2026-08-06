// spec 042 — the per-device "seen" ledger for feature announcements. Mirrors
// components/settings/textSize.ts: fully guarded localStorage access that never
// throws (SSR: no localStorage; Safari private mode / disabled storage:
// SecurityError). Per-device by design — a single JSON-array key keeps the whole
// ledger inspectable/clearable and makes the next-unseen query trivial.

import type { Announcement, AnnouncementContext } from './registry'

const STORAGE_KEY = 'ortho.announcementsSeen'

/** The seen ids for this device. Missing/malformed/unreadable ⇒ [] (all unseen). */
export function readSeenAnnouncements(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

/** Whether this device has already seen the announcement with the given id. */
export function hasSeenAnnouncement(id: string): boolean {
  return readSeenAnnouncements().includes(id)
}

/** Record an announcement as seen (idempotent). Best-effort — a throwing/absent store is ignored. */
export function markAnnouncementSeen(id: string): void {
  try {
    const seen = readSeenAnnouncements()
    if (seen.includes(id)) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen, id]))
  } catch {
    // storage unavailable (private mode / disabled) — the popup still closes for
    // this session; it may reappear on a future load, which is acceptable.
  }
}

/**
 * The first announcement in `list` that is both unseen on this device AND
 * relevant (`isRelevant` absent or returns true for `ctx`). null when none.
 * Order-preserving and non-mutating.
 */
export function nextUnseenAnnouncement(
  list: Announcement[],
  ctx: AnnouncementContext
): Announcement | null {
  const seen = readSeenAnnouncements()
  return (
    list.find((a) => !seen.includes(a.id) && (a.isRelevant ? a.isRelevant(ctx) : true)) ?? null
  )
}
