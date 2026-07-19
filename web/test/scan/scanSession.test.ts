// Tests for the ScanSession UI state machine — Phase transitions and
// Disposition tracking (spec 021, ported from
// iOS/Ortho-iOS/Features/Transactions/Scan/ScanSession.swift).
//
// Coverage mirrors the Swift file's own invariants (there is no XCTest
// analogue to port verbatim — ScanSession.swift has no dedicated unit-test
// file of its own, only indirect exercise via the SwiftUI views): phase
// transitions on a receipt vs. a statement parse result; payment rows are
// ALWAYS pre-skipped regardless of the skip-duplicates toggle; duplicate
// rows are pre-skipped only when the toggle is on and flip live while still
// on the interstitial; the review wizard's accept/skip/stop flow and its
// per-disposition summary counts, including the "zero-count segments
// omitted" rule surfaced here as counts of 0.

import { describe, expect, it } from 'vitest'
import {
  createScanSessionState,
  scanSessionReducer,
  selectAddedCount,
  selectCurrentCandidate,
  selectDuplicateCount,
  selectIsLastRow,
  selectIsWizardActive,
  selectLeftOutDuplicateCount,
  selectPaymentCount,
  selectRowCount,
  selectSkippedCount,
  type ScanSessionState,
} from '../../lib/scan/scanSession'
import type { ParsedCandidate } from '../../lib/scan/scanModels'

function candidate(overrides: Partial<ParsedCandidate> = {}): ParsedCandidate {
  return {
    id: 'candidate-id',
    merchantRaw: 'CORNER PLACE',
    merchant: 'CORNER PLACE',
    date: { year: 2026, month: 7, day: 1 },
    amountCents: 1200,
    direction: 'debit',
    currency: 'usd',
    originalAmount: null,
    isPaymentRow: false,
    guesses: new Set(),
    categoryGuess: null,
    ownersGuess: null,
    duplicateOf: null,
    ...overrides,
  }
}

describe('scanSessionReducer — phase transitions', () => {
  it('starts idle', () => {
    const state = createScanSessionState()
    expect(state.phase).toBe('idle')
  })

  it('capture/start moves idle -> parsing and records the source', () => {
    const state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/start',
      source: 'camera',
    })
    expect(state.phase).toBe('parsing')
    expect(state.lastSource).toBe('camera')
  })

  it('a receipt parse result moves parsing -> receiptPrefilled and stores the candidate', () => {
    const receipt = candidate({ id: 'r1' })
    const state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'receipt', candidate: receipt },
    })
    expect(state.phase).toBe('receiptPrefilled')
    expect(state.receiptCandidate).toEqual(receipt)
  })

  it('a statement parse result moves parsing -> interstitial and stores all candidates', () => {
    const rows = [candidate({ id: 'a' }), candidate({ id: 'b' })]
    const state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: rows },
    })
    expect(state.phase).toBe('interstitial')
    expect(state.candidates).toEqual(rows)
  })

  it('a none parse result moves parsing -> failed with the unreadable reason', () => {
    const state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'none' },
    })
    expect(state.phase).toBe('failed')
    expect(state.failureReason).toBe('unreadable')
  })

  it('capture/unsupported fails with the web-only reason and pins the source to camera', () => {
    // fix/web-scan-fallback: the web camera path has no browser OCR, so it
    // degrades honestly instead of dead-ending as a generic "couldn't read".
    const state = scanSessionReducer(createScanSessionState(), { type: 'capture/unsupported' })
    expect(state.phase).toBe('failed')
    expect(state.failureReason).toBe('unsupportedOnWeb')
    expect(state.lastSource).toBe('camera')
  })

  it('reset clears an unsupportedOnWeb failure back to the default reason', () => {
    let state = scanSessionReducer(createScanSessionState(), { type: 'capture/unsupported' })
    state = scanSessionReducer(state, { type: 'reset' })
    expect(state.phase).toBe('idle')
    expect(state.failureReason).toBe('unreadable')
  })

  it('retake only resets phase to idle, leaving captured data alone', () => {
    const rows = [candidate({ id: 'a' })]
    const interstitial = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: rows },
    })
    const state = scanSessionReducer(interstitial, { type: 'retake' })
    expect(state.phase).toBe('idle')
    expect(state.candidates).toEqual(rows)
  })

  it('reset clears everything back to idle but preserves the skipDuplicates toggle', () => {
    const rows = [candidate({ id: 'a' })]
    let state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: rows },
    })
    state = scanSessionReducer(state, { type: 'toggleSkipDuplicates', value: false })
    state = scanSessionReducer(state, { type: 'reset' })
    expect(state.phase).toBe('idle')
    expect(state.candidates).toEqual([])
    expect(state.dispositions).toEqual({})
    expect(state.receiptCandidate).toBeNull()
    expect(state.queue).toEqual([])
    expect(state.cursor).toBe(0)
    expect(state.lastSource).toBeNull()
    expect(state.skipDuplicates).toBe(false)
  })
})

describe('scanSessionReducer — pre-skip rules', () => {
  it('a payment row is always pre-skipped, even with skipDuplicates off', () => {
    let state = createScanSessionState()
    state = scanSessionReducer(state, { type: 'toggleSkipDuplicates', value: false })
    const payment = candidate({ id: 'p1', isPaymentRow: true })
    state = scanSessionReducer(state, {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: [payment] },
    })
    expect(state.dispositions['p1']).toBe('leftOutPayment')
  })

  it('a payment row is pre-skipped even when it is also flagged as a duplicate', () => {
    const paymentDuplicate = candidate({ id: 'p1', isPaymentRow: true, duplicateOf: 'existing-1' })
    const state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: [paymentDuplicate] },
    })
    expect(state.dispositions['p1']).toBe('leftOutPayment')
  })

  it('a duplicate row is pre-skipped when skipDuplicates is on (the default)', () => {
    const duplicate = candidate({ id: 'd1', duplicateOf: 'existing-1' })
    const state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: [duplicate] },
    })
    expect(state.skipDuplicates).toBe(true)
    expect(state.dispositions['d1']).toBe('leftOutDuplicate')
  })

  it('a duplicate row stays pending when skipDuplicates is off', () => {
    let state = createScanSessionState()
    state = scanSessionReducer(state, { type: 'toggleSkipDuplicates', value: false })
    const duplicate = candidate({ id: 'd1', duplicateOf: 'existing-1' })
    state = scanSessionReducer(state, {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: [duplicate] },
    })
    expect(state.dispositions['d1']).toBe('pending')
  })

  it('a non-payment, non-duplicate row stays pending', () => {
    const plain = candidate({ id: 'x1' })
    const state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: [plain] },
    })
    expect(state.dispositions['x1']).toBe('pending')
  })

  it('toggling skipDuplicates while on the interstitial re-applies pre-skips live', () => {
    const duplicate = candidate({ id: 'd1', duplicateOf: 'existing-1' })
    let state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: [duplicate] },
    })
    expect(state.dispositions['d1']).toBe('leftOutDuplicate')

    state = scanSessionReducer(state, { type: 'toggleSkipDuplicates', value: false })
    expect(state.dispositions['d1']).toBe('pending')

    state = scanSessionReducer(state, { type: 'toggleSkipDuplicates', value: true })
    expect(state.dispositions['d1']).toBe('leftOutDuplicate')
  })

  it('toggling skipDuplicates off the interstitial (e.g. idle) does not touch dispositions', () => {
    const state = scanSessionReducer(createScanSessionState(), {
      type: 'toggleSkipDuplicates',
      value: false,
    })
    expect(state.phase).toBe('idle')
    expect(state.dispositions).toEqual({})
    expect(state.skipDuplicates).toBe(false)
  })
})

describe('scanSessionReducer — interstitial counts', () => {
  it('rowCount/duplicateCount/paymentCount reflect the candidate set', () => {
    const rows = [
      candidate({ id: 'a' }),
      candidate({ id: 'b', duplicateOf: 'existing-1' }),
      candidate({ id: 'c', isPaymentRow: true }),
      // A payment row that also looks like a duplicate counts only as a
      // payment for duplicateCount (mirrors Swift's `!$0.isPaymentRow` guard).
      candidate({ id: 'd', isPaymentRow: true, duplicateOf: 'existing-2' }),
    ]
    const state = scanSessionReducer(createScanSessionState(), {
      type: 'capture/parsed',
      result: { kind: 'statement', candidates: rows },
    })
    expect(selectRowCount(state)).toBe(4)
    expect(selectDuplicateCount(state)).toBe(1)
    expect(selectPaymentCount(state)).toBe(2)
  })
})

function toInterstitial(rows: ParsedCandidate[], skipDuplicates = true): ScanSessionState {
  let state = createScanSessionState()
  if (!skipDuplicates) {
    state = scanSessionReducer(state, { type: 'toggleSkipDuplicates', value: false })
  }
  return scanSessionReducer(state, {
    type: 'capture/parsed',
    result: { kind: 'statement', candidates: rows },
  })
}

describe('scanSessionReducer — review wizard', () => {
  it('review/start builds the queue from pending candidates only, in document order', () => {
    const rows = [
      candidate({ id: 'a' }),
      candidate({ id: 'b', isPaymentRow: true }),
      candidate({ id: 'c' }),
    ]
    const interstitial = toInterstitial(rows)
    const state = scanSessionReducer(interstitial, { type: 'review/start' })
    expect(state.phase).toBe('reviewing')
    expect(state.queue.map((c) => c.id)).toEqual(['a', 'c'])
    expect(state.cursor).toBe(0)
  })

  it('review/start with an empty pending queue skips straight to summary', () => {
    const rows = [candidate({ id: 'a', isPaymentRow: true })]
    const interstitial = toInterstitial(rows)
    const state = scanSessionReducer(interstitial, { type: 'review/start' })
    expect(state.phase).toBe('summary')
    expect(state.queue).toEqual([])
  })

  it('currentCandidate is null outside the reviewing phase', () => {
    const rows = [candidate({ id: 'a' })]
    const interstitial = toInterstitial(rows)
    expect(selectCurrentCandidate(interstitial)).toBeNull()
  })

  it('currentCandidate tracks the cursor while reviewing', () => {
    const rows = [candidate({ id: 'a' }), candidate({ id: 'b' })]
    const interstitial = toInterstitial(rows)
    const reviewing = scanSessionReducer(interstitial, { type: 'review/start' })
    expect(selectCurrentCandidate(reviewing)?.id).toBe('a')
    expect(selectIsLastRow(reviewing)).toBe(false)
    expect(selectIsWizardActive(reviewing)).toBe(true)
  })

  it('review/accept marks the current candidate added and advances the cursor', () => {
    const rows = [candidate({ id: 'a' }), candidate({ id: 'b' })]
    let state = toInterstitial(rows)
    state = scanSessionReducer(state, { type: 'review/start' })
    state = scanSessionReducer(state, { type: 'review/accept' })
    expect(state.dispositions['a']).toBe('added')
    expect(state.phase).toBe('reviewing')
    expect(selectCurrentCandidate(state)?.id).toBe('b')
  })

  it('review/skip marks the current candidate skipped and advances the cursor', () => {
    const rows = [candidate({ id: 'a' }), candidate({ id: 'b' })]
    let state = toInterstitial(rows)
    state = scanSessionReducer(state, { type: 'review/start' })
    state = scanSessionReducer(state, { type: 'review/skip' })
    expect(state.dispositions['a']).toBe('skipped')
    expect(selectCurrentCandidate(state)?.id).toBe('b')
  })

  it('accepting the last row in the queue moves to summary', () => {
    const rows = [candidate({ id: 'a' })]
    let state = toInterstitial(rows)
    state = scanSessionReducer(state, { type: 'review/start' })
    state = scanSessionReducer(state, { type: 'review/accept' })
    expect(state.phase).toBe('summary')
    expect(selectCurrentCandidate(state)).toBeNull()
  })

  it('review/stop is always available and jumps straight to summary, keeping prior adds', () => {
    const rows = [candidate({ id: 'a' }), candidate({ id: 'b' }), candidate({ id: 'c' })]
    let state = toInterstitial(rows)
    state = scanSessionReducer(state, { type: 'review/start' })
    state = scanSessionReducer(state, { type: 'review/accept' }) // a -> added
    state = scanSessionReducer(state, { type: 'review/stop' })
    expect(state.phase).toBe('summary')
    expect(state.dispositions['a']).toBe('added')
    expect(state.dispositions['b']).toBe('pending')
  })

  it('accept/skip on a candidate outside the reviewing phase is a no-op', () => {
    const rows = [candidate({ id: 'a' })]
    const interstitial = toInterstitial(rows)
    const state = scanSessionReducer(interstitial, { type: 'review/accept' })
    expect(state).toEqual(interstitial)
  })
})

describe('scanSessionReducer — summary counts', () => {
  it('counts added, skipped (incl. payment pre-skips), and left-out duplicates separately', () => {
    const rows = [
      candidate({ id: 'a' }), // will be accepted
      candidate({ id: 'b' }), // will be user-skipped
      candidate({ id: 'c', isPaymentRow: true }), // pre-skipped payment -> reads as skipped
      candidate({ id: 'd', duplicateOf: 'existing-1' }), // pre-skipped duplicate
    ]
    let state = toInterstitial(rows)
    state = scanSessionReducer(state, { type: 'review/start' })
    state = scanSessionReducer(state, { type: 'review/accept' }) // a
    state = scanSessionReducer(state, { type: 'review/skip' }) // b
    expect(state.phase).toBe('summary')

    expect(selectAddedCount(state)).toBe(1)
    expect(selectSkippedCount(state)).toBe(2) // user-skip b + payment pre-skip c
    expect(selectLeftOutDuplicateCount(state)).toBe(1)
  })

  it('a zero-count disposition reports 0 so the view can omit that segment', () => {
    const rows = [candidate({ id: 'a' })]
    let state = toInterstitial(rows)
    state = scanSessionReducer(state, { type: 'review/start' })
    state = scanSessionReducer(state, { type: 'review/accept' })

    expect(selectAddedCount(state)).toBe(1)
    expect(selectSkippedCount(state)).toBe(0)
    expect(selectLeftOutDuplicateCount(state)).toBe(0)
  })

  it('nothing added or skipped when every row is pre-skipped', () => {
    const rows = [candidate({ id: 'a', isPaymentRow: true })]
    let state = toInterstitial(rows)
    state = scanSessionReducer(state, { type: 'review/start' }) // empty queue -> summary directly
    expect(state.phase).toBe('summary')
    expect(selectAddedCount(state)).toBe(0)
    expect(selectSkippedCount(state)).toBe(1)
    expect(selectLeftOutDuplicateCount(state)).toBe(0)
  })
})
