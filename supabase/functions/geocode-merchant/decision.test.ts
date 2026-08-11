// spec 044 US4 — geocode-merchant's decision routing. Deno.test (matches
// plaid-exchange/completion.test.ts's style). NOT executable in this sandbox (no Deno CLI —
// same class of environment gap as iOS builds; see tasks.md T039) but written correctly per this
// repo's existing edge-function test convention for whenever it runs in an environment with Deno.
import { assertEquals } from 'jsr:@std/assert@1'
import { decideGeocodeRequest } from './decision.ts'

Deno.test('unconfigured server → not_configured, even for a probe request', () => {
  assertEquals(decideGeocodeRequest(false, 'probe', 'Netflix'), { kind: 'not_configured' })
  assertEquals(decideGeocodeRequest(false, undefined, 'Netflix'), { kind: 'not_configured' })
})

Deno.test('configured + probe mode → probe_ok, no merchant required', () => {
  assertEquals(decideGeocodeRequest(true, 'probe', undefined), { kind: 'probe_ok' })
})

Deno.test('configured + non-probe + missing/blank merchant → invalid_request', () => {
  assertEquals(decideGeocodeRequest(true, undefined, undefined), { kind: 'invalid_request' })
  assertEquals(decideGeocodeRequest(true, undefined, ''), { kind: 'invalid_request' })
  assertEquals(decideGeocodeRequest(true, undefined, '   '), { kind: 'invalid_request' })
  assertEquals(decideGeocodeRequest(true, undefined, 123), { kind: 'invalid_request' })
})

Deno.test('configured + non-probe + a real merchant string → proceed', () => {
  assertEquals(decideGeocodeRequest(true, undefined, 'Blue Bottle Coffee'), {
    kind: 'proceed',
    merchant: 'Blue Bottle Coffee',
  })
})
