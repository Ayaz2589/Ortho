// Shared fakes for the aggregation-core suite. The core never touches a real
// network: FetchLike is injected (extraction contract), so tests hand it a
// recording fake.
import type { FetchLike } from '../src/index'

export type RecordedCall = {
  url: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export function fakeFetch(
  respond: (call: RecordedCall) => { status: number; body?: unknown; badJson?: boolean }
): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const fetch: FetchLike = async (url, init) => {
    const call: RecordedCall = {
      url,
      method: init.method,
      headers: init.headers,
      body: JSON.parse(init.body) as Record<string, unknown>,
    }
    calls.push(call)
    const res = respond(call)
    return {
      status: res.status,
      json: async () => {
        if (res.badJson) throw new SyntaxError('bad json')
        return res.body
      },
    }
  }
  return { fetch, calls }
}

export function throwingFetch(): FetchLike {
  return async () => {
    throw new TypeError('network down')
  }
}

export const CONFIG = { clientId: 'cid_test', secret: 'sec_test', env: 'sandbox' as const }

// ── SimpleFIN fakes (spec 028) — GET (no body) + text/json responses ──
import type { SimpleFinFetch } from '../src/index'

export type RecordedSfinCall = { url: string; method: string; headers: Record<string, string> }

export function fakeSfinFetch(
  respond: (call: RecordedSfinCall) => { status: number; text?: string; json?: unknown; badJson?: boolean }
): { fetch: SimpleFinFetch; calls: RecordedSfinCall[] } {
  const calls: RecordedSfinCall[] = []
  const fetch: SimpleFinFetch = async (url, init) => {
    const call: RecordedSfinCall = { url, method: init.method, headers: init.headers }
    calls.push(call)
    const res = respond(call)
    return {
      status: res.status,
      text: async () => res.text ?? '',
      json: async () => {
        if (res.badJson) throw new SyntaxError('bad json')
        return res.json
      },
    }
  }
  return { fetch, calls }
}

export function throwingSfinFetch(): SimpleFinFetch {
  return async () => {
    throw new TypeError('network down')
  }
}
