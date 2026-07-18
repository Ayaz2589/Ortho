// Deterministic UUID mapping for DB seeding (spec 026).
//
// The in-memory corpus uses READABLE ids (e.g. "order-mismatch-a4-p-alpha") — good
// for tests and debugging. But the Supabase schema types every id/FK column as
// `uuid`, which rejects arbitrary strings. `uuidFrom` maps each readable key to a
// stable, canonical-format UUID (a SHA-256-derived v-agnostic UUID — Postgres
// accepts any 32-hex value in canonical 8-4-4-4-12 grouping), so the seeder can
// write valid rows while every foreign key stays internally consistent (the same
// key always maps to the same UUID).

import { createHash } from 'node:crypto'

export function uuidFrom(key: string): string {
  const h = createHash('sha256').update(key).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}
