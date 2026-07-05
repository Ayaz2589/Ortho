/**
 * An in-memory, chainable stand-in for the Supabase browser client, used by the
 * store when the "Use test data" flag is on (spec 015). It serves the seeded
 * dataset (`seed.ts`) for reads and swallows writes locally, so with test data
 * on NO read or write ever reaches the live backend (contract C-TD-1). The store
 * keeps the UI's source of truth in React state and only reads from this client
 * at bootstrap, so seeded rows fully populate the app and in-app edits remain
 * visible; a reload starts from a clean seed again (contract C-TD-5).
 *
 * The chainable surface is a productionized copy of `test/helpers/supabase-mock.ts`
 * (the seam the store's own tests already exploit) minus the vitest dependency,
 * so it can ship in the app bundle. It is only ever constructed behind
 * `isTestBuild()`.
 */
import { buildSeedTables } from './seed'

type WriteResult = { data: null; error: { message: string } | null }
type ReadResult = { data: unknown[] | null; error: { message: string } | null }

interface QueryBuilder extends PromiseLike<ReadResult> {
  select: (cols?: string) => QueryBuilder
  eq: (col: string, val: unknown) => QueryBuilder
  in: (col: string, vals: unknown[]) => QueryBuilder
  order: (col: string, opts?: unknown) => QueryBuilder
  limit: (n: number) => QueryBuilder
  single: () => Promise<{ data: unknown; error: null }>
  insert: (payload?: unknown) => Promise<WriteResult>
  update: (payload?: unknown) => QueryBuilder & Promise<WriteResult>
  delete: () => QueryBuilder & Promise<WriteResult>
  upsert: (payload?: unknown, opts?: unknown) => Promise<WriteResult>
}

export interface MemoryClient {
  auth: {
    getUser: () => Promise<{ data: { user: unknown }; error: null }>
    onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
      data: { subscription: { unsubscribe: () => void } }
    }
    signOut: () => Promise<{ error: null }>
  }
  from: (table: string) => QueryBuilder
  rpc: (name: string, params?: unknown) => Promise<{ data: unknown; error: null }>
}

export function createMemoryClient(): MemoryClient {
  const { authUser, tables } = buildSeedTables()

  function builder(table: string): QueryBuilder {
    const rows = (tables[table] ?? []) as unknown[]
    const resolved: ReadResult = { data: rows, error: null }
    // Writes are accepted and dropped — the seed is immutable within a session;
    // the store already reflects the change in its local React state.
    const ok = (): Promise<WriteResult> => Promise.resolve({ data: null, error: null })
    // update()/delete() are chainable (callers do `.update(x).eq(...)`) AND
    // awaitable; the await must resolve with the WRITE result, so we override
    // the chained builder's read-resolving `then`.
    const mutationChain = (p: Promise<WriteResult>) => {
      const chained = builder(table)
      chained.then = (onfulfilled, onrejected) => p.then(onfulfilled as never, onrejected) as never
      return chained as never
    }
    const b: QueryBuilder = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      insert: () => ok(),
      update: () => mutationChain(ok()),
      delete: () => mutationChain(ok()),
      upsert: () => ok(),
      then: (onfulfilled, onrejected) => Promise.resolve(resolved).then(onfulfilled, onrejected),
    }
    return b
  }

  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: authUser }, error: null }),
      // Never emits SIGNED_OUT, so the store's live watcher never force-redirects.
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: (table: string) => builder(table),
    // Spec 018: `ensure_entitlement` resolves null here, deliberately — a null
    // row derives a null gate (never the paywall) and hides the Subscription
    // settings section, matching iOS's seeded mode exactly (review 018 [21]).
    // Test-data mode stays fully usable with zero live traffic (C-TD-1).
    rpc: () => Promise.resolve({ data: null, error: null }),
  }
}
