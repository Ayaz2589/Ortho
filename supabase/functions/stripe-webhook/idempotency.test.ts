import { assertEquals } from 'jsr:@std/assert@1'
import { isReclaimableOutcome, optimisticWriteLanded, RECLAIMABLE_OUTCOMES } from './idempotency.ts'

Deno.test('only received/failed re-claim; every terminal outcome does NOT (no double-apply)', () => {
  assertEquals(isReclaimableOutcome('received'), true)
  assertEquals(isReclaimableOutcome('failed'), true)
  for (const terminal of ['applied', 'skipped_stale', 'skipped_unmatched', 'noop']) {
    assertEquals(isReclaimableOutcome(terminal), false)
  }
})

Deno.test('RECLAIMABLE_OUTCOMES is exactly [received, failed]', () => {
  assertEquals([...RECLAIMABLE_OUTCOMES], ['received', 'failed'])
})

Deno.test('optimistic write: 0 rows updated ⇒ conflict; any positive count ⇒ landed', () => {
  assertEquals(optimisticWriteLanded(0), false)
  assertEquals(optimisticWriteLanded(1), true)
  assertEquals(optimisticWriteLanded(3), true)
})
