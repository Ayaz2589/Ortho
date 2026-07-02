import { vi } from 'vitest'

/**
 * A configurable, chainable stand-in for the Supabase browser client used by the
 * store (`lib/store.tsx`) and the aggregate wrappers (`lib/api/aggregates.ts`).
 *
 * Guarantees NO real network/DB I/O: every query resolves from the in-memory
 * `dataset` you pass, and every write is recorded into `.calls` so tests can
 * assert persistence happened (and that nothing unexpected did).
 */

export interface SupabaseMockDataset {
  /** Map of table name -> rows returned by `.select()` queries. */
  tables?: Record<string, unknown[]>
  /** Auth user returned by `auth.getUser()`. `null` short-circuits store load. */
  authUser?: { id: string; email?: string } | null
  /** Map of RPC name -> result data (for `lib/api/aggregates.ts`). */
  rpc?: Record<string, unknown>
  /** RPC name -> Error, to exercise error propagation. */
  rpcErrors?: Record<string, Error>
  /** Table name -> error message, to make `.insert()` on that table fail
   *  (exercises the atomic transaction+shares write rollback). */
  insertErrors?: Record<string, string>
  /** Table name -> error message for `.select()` reads (bootstrap fail-loud paths). */
  selectErrors?: Record<string, string>
  /** Table name -> error message for `.delete()` / `.update()` / `.upsert()`. */
  deleteErrors?: Record<string, string>
  updateErrors?: Record<string, string>
  upsertErrors?: Record<string, string>
}

export interface RecordedCall {
  table: string
  op: 'insert' | 'update' | 'delete' | 'upsert'
  payload?: unknown
}

export interface SupabaseMock {
  client: SupabaseClientLike
  calls: RecordedCall[]
  /** Convenience: writes recorded for a given table. */
  callsFor(table: string): RecordedCall[]
  /** Fire the auth-state listener registered by the store (e.g. 'SIGNED_OUT'). */
  emitAuthChange(event: string, session?: unknown): void
}

// A minimal structural type — enough for the store + aggregates to type-check.
export interface SupabaseClientLike {
  auth: {
    getUser: () => Promise<{ data: { user: unknown }; error: null }>
    onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
      data: { subscription: { unsubscribe: () => void } }
    }
  }
  from: (table: string) => QueryBuilder
  rpc: (name: string, params?: unknown) => Promise<{ data: unknown; error: Error | null }>
}

/** Writes may surface an error (used to exercise rollback paths). */
type MutationResult = { data: null; error: { message: string } | null }

interface QueryBuilder extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select: (cols?: string) => QueryBuilder
  eq: (col: string, val: unknown) => QueryBuilder
  in: (col: string, vals: unknown[]) => QueryBuilder
  order: (col: string, opts?: unknown) => QueryBuilder
  limit: (n: number) => QueryBuilder
  single: () => Promise<{ data: unknown; error: null }>
  insert: (payload?: unknown) => Promise<MutationResult>
  update: (payload?: unknown) => QueryBuilder & Promise<MutationResult>
  delete: () => QueryBuilder & Promise<MutationResult>
  upsert: (payload?: unknown, opts?: unknown) => Promise<MutationResult>
}

export function makeSupabaseMock(dataset: SupabaseMockDataset = {}): SupabaseMock {
  const tables = dataset.tables ?? {}
  const calls: RecordedCall[] = []
  const authUser = dataset.authUser === undefined ? { id: 'u-me', email: 'me@example.com' } : dataset.authUser

  function builder(table: string): QueryBuilder {
    const rows = (tables[table] ?? []) as unknown[]
    const selectMsg = dataset.selectErrors?.[table]
    const resolved = selectMsg
      ? { data: null, error: { message: selectMsg } }
      : { data: rows, error: null }
    const writeErrors: Record<RecordedCall['op'], Record<string, string> | undefined> = {
      insert: dataset.insertErrors,
      delete: dataset.deleteErrors,
      update: dataset.updateErrors,
      upsert: dataset.upsertErrors,
    }
    const record = (op: RecordedCall['op'], payload?: unknown) => {
      calls.push({ table, op, payload })
      const msg = writeErrors[op]?.[table]
      return Promise.resolve(
        msg ? { data: null, error: { message: msg } } : { data: null, error: null as null }
      )
    }
    const b: QueryBuilder = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      insert: (payload?: unknown) => record('insert', payload),
      // update()/delete() are chainable (callers do `.update(x).eq(...)`) AND
      // awaitable. The await must resolve with the MUTATION result (so injected
      // update/delete errors surface) — a plain Object.assign would keep the
      // builder's select-resolving `then`.
      update: (payload?: unknown) => mutationChain(record('update', payload)),
      delete: () => mutationChain(record('delete')),
      upsert: (payload?: unknown) => record('upsert', payload),
      then: (onfulfilled, onrejected) => Promise.resolve(resolved).then(onfulfilled, onrejected),
    }
    const mutationChain = (p: Promise<MutationResult>) => {
      const chained = builder(table)
      chained.then = (onfulfilled, onrejected) => p.then(onfulfilled as never, onrejected) as never
      return chained as never
    }
    return b
  }

  // The store subscribes for live sign-out; tests can fire events via
  // `emitAuthChange`.
  const authCallbacks: ((event: string, session: unknown) => void)[] = []

  const client: SupabaseClientLike = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: authUser }, error: null }),
      onAuthStateChange: (cb) => {
        authCallbacks.push(cb)
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
    from: (table: string) => builder(table),
    rpc: (name: string) => {
      const err = dataset.rpcErrors?.[name] ?? null
      return Promise.resolve({ data: err ? null : dataset.rpc?.[name] ?? null, error: err })
    },
  }

  return {
    client,
    calls,
    callsFor: (t) => calls.filter((c) => c.table === t),
    emitAuthChange: (event, session = null) => {
      for (const cb of authCallbacks) cb(event, session)
    },
  }
}

/**
 * Prime localStorage so the store's `refreshRates()` uses cached rates and never
 * calls `fetch`. Pair with a `vi.stubGlobal('fetch', ...)` safety net.
 */
export function primeFxCache(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem('fxRates', JSON.stringify({ usd: 1 }))
  localStorage.setItem('fxRatesFetchedAt', String(Date.now()))
}

/** Install a fetch stub that fails fast, proving no test relies on the network. */
export function stubNoNetwork() {
  return vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network disabled in tests')))
  )
}
