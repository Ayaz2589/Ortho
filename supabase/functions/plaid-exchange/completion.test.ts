import { assertEquals } from 'jsr:@std/assert@1'
import { decideCompletionAfterRpcError } from './completion.ts'

Deno.test('committed-but-response-lost: session flipped to completed → success (do NOT revoke)', () => {
  assertEquals(decideCompletionAfterRpcError({ status: 'completed', institutionId: 'inst-1' }), {
    outcome: 'success',
    institutionId: 'inst-1',
  })
})

Deno.test('genuine rollback: session still pending → compensate', () => {
  assertEquals(decideCompletionAfterRpcError({ status: 'pending', institutionId: null }), {
    outcome: 'compensate',
  })
})

Deno.test('completed status but no institution id → compensate (incomplete/garbled flip)', () => {
  assertEquals(decideCompletionAfterRpcError({ status: 'completed', institutionId: null }), {
    outcome: 'compensate',
  })
  assertEquals(decideCompletionAfterRpcError({ status: 'completed', institutionId: '' }), {
    outcome: 'compensate',
  })
})

Deno.test('missing recheck (the re-read itself failed) → compensate, never assume success', () => {
  assertEquals(decideCompletionAfterRpcError(null), { outcome: 'compensate' })
})

Deno.test('abandoned or any other status → compensate', () => {
  assertEquals(decideCompletionAfterRpcError({ status: 'abandoned', institutionId: 'x' }), {
    outcome: 'compensate',
  })
})
