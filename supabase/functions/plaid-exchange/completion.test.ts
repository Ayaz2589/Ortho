import { assertEquals } from 'jsr:@std/assert@1'
import { decideCompletionAfterRpcError, postCommitAction } from './completion.ts'

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

// postCommitAction folds the payload-availability dimension in. The load-bearing
// case is the last one: a CONFIRMED commit whose payload read blipped must NOT
// compensate (that would revoke the token the RPC just stored) — it answers
// exchange_failed and leaves the live link intact.
Deno.test('postCommitAction: confirmed commit + payload built → success', () => {
  assertEquals(postCommitAction({ outcome: 'success', institutionId: 'inst-1' }, true), 'success')
})

Deno.test('postCommitAction: confirmed commit + payload MISSING → exchange_failed (never compensate)', () => {
  assertEquals(
    postCommitAction({ outcome: 'success', institutionId: 'inst-1' }, false),
    'exchange_failed',
  )
})

Deno.test('postCommitAction: unconfirmed commit → compensate (regardless of payload flag)', () => {
  assertEquals(postCommitAction({ outcome: 'compensate' }, false), 'compensate')
  assertEquals(postCommitAction({ outcome: 'compensate' }, true), 'compensate')
})
