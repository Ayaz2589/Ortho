// The shared literal vectors from specs/018-subscription-system/contracts/entitlement-state.md.
// Embedded VERBATIM here and in web/test/entitlements.test.ts.
// Amend the contract before touching these.
export const VECTOR_NOW = '2026-07-05T12:00:00Z'

export const VECTORS: ReadonlyArray<
  readonly [id: string, status: string, accessExpiresAt: string | null, expected: string]
> = [
  ['V01', 'admin', null, 'admin'],
  ['V02', 'admin', '2020-01-01T00:00:00Z', 'admin'],
  ['V03', 'trialing', '2026-07-20T00:00:00Z', 'trialing'],
  ['V04', 'trialing', '2026-07-04T12:00:00Z', 'trialing'],
  ['V05', 'trialing', '2026-07-03T12:00:00Z', 'lapsed'],
  ['V06', 'trialing', '2026-07-03T11:59:59Z', 'lapsed'],
  ['V07', 'trialing', null, 'lapsed'],
  ['V08', 'active', '2026-08-01T00:00:00Z', 'active'],
  ['V09', 'active', '2026-07-04T00:00:00Z', 'active'],
  ['V10', 'active', '2026-07-01T00:00:00Z', 'lapsed'],
  ['V11', 'active', null, 'lapsed'],
  ['V12', 'past_due', '2026-07-10T00:00:00Z', 'grace'],
  ['V13', 'past_due', '2026-07-01T00:00:00Z', 'grace'],
  ['V14', 'past_due', '2026-06-18T00:00:00Z', 'lapsed'],
  ['V15', 'canceled', '2026-07-10T00:00:00Z', 'active'],
  ['V16', 'canceled', '2026-07-05T12:00:00Z', 'lapsed'],
  ['V17', 'canceled', '2026-07-05T11:59:59Z', 'lapsed'],
  ['V18', 'paused', '2026-08-01T00:00:00Z', 'lapsed'],
  ['V19', 'unpaid', '2026-08-01T00:00:00Z', 'lapsed'],
]

export const VECTORS_SHA256 = '88715c8317256e5c6162e6479e3451e94bff56edbc70c0853c1fd0aaa36a48e2'

export function serializeVectors(
  vectors: typeof VECTORS
): string {
  return vectors.map(([id, s, e, g]) => `${id}|${s}|${e ?? 'null'}|${g}`).join('\n')
}
