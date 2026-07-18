// One capture's lifecycle, ported to a plain TypeScript reducer (spec 021,
// ported from
// iOS/Ortho-iOS/Features/Transactions/Scan/ScanSession.swift).
// Contract: specs/021-capacitor-ios-consolidation/data-model.md
// ("ScanSession (UI state machine)").
//
// Phase state machine: idle -> parsing -> receiptPrefilled | interstitial ->
// reviewing -> summary | failed. Disposition tracking (pending/added/
// skipped/leftOutDuplicate/leftOutPayment) mirrors the Swift enum 1:1 —
// product-approved behavior, not something to redesign.
//
// This module is UI-framework-agnostic beyond matching React's
// `useReducer(reducer, initialState)` shape: `ScanSessionState` is a plain
// immutable value, `ScanSessionAction` is a discriminated union, and
// `scanSessionReducer` is a pure `(state, action) => state` function. The
// `select*` helpers below mirror `ScanSession.swift`'s computed properties
// (`rowCount`, `currentCandidate`, etc.) as plain functions over the state,
// since a reducer has no room for stored computed properties.
//
// No transaction ever saves in here: accepts are counted, the caller (the
// eventual AddTransactionSheet-equivalent, wired in a later task) performs
// the actual optimistic add per row (FR-009) and only then dispatches
// `review/accept`.

import type { ParsedCandidate, ScanDocumentText, ScanParseResult } from './scanModels'

/** Mirrors Swift's `ScanSession.Source`. */
export type ScanSource = 'camera' | 'photoLibrary' | 'file'

/** Mirrors Swift's `ScanSession.Phase`. */
export type ScanSessionPhase =
  | 'idle'
  | 'parsing'
  | 'receiptPrefilled'
  | 'interstitial'
  | 'reviewing'
  | 'summary'
  | 'failed'

/** Mirrors Swift's `ScanSession.Disposition`. */
export type Disposition =
  | 'pending'
  | 'added'
  | 'skipped' // user Skip in the wizard
  | 'leftOutDuplicate' // pre-skipped by the interstitial toggle
  | 'leftOutPayment' // card-payment row, always pre-skipped (FR-012)

/** Keyed by `ParsedCandidate.id` (Swift keys by `UUID`; TS candidates carry
 *  a string `id` already — see scanModels.ts). */
export type DispositionMap = Record<string, Disposition>

/** Why a capture landed on the `failed` phase. `unreadable` is the ordinary
 *  "nothing parseable" outcome (native + web); `unsupportedOnWeb` is the
 *  honest web-only degrade for photo receipts, which need OCR the browser has
 *  no equivalent of (fix/web-scan-fallback) — kept distinct so the UI can show
 *  targeted copy instead of the generic "couldn't read this". */
export type ScanFailureReason = 'unreadable' | 'unsupportedOnWeb'

export interface ScanSessionState {
  phase: ScanSessionPhase
  /** Extracted text of the last capture — in-memory only, dies with the
   *  session like everything else here (FR-003). */
  lastDocument: ScanDocumentText | null
  candidates: ParsedCandidate[]
  dispositions: DispositionMap
  receiptCandidate: ParsedCandidate | null
  /** Wizard queue (pending candidates in document order) + position. */
  queue: ParsedCandidate[]
  cursor: number
  /** Last capture source, so Retake reopens the same one (FR-017). */
  lastSource: ScanSource | null
  /** Interstitial toggle, default ON (FR-007). */
  skipDuplicates: boolean
  /** Only meaningful while `phase === 'failed'`; see `ScanFailureReason`. */
  failureReason: ScanFailureReason
}

export function createScanSessionState(): ScanSessionState {
  return {
    phase: 'idle',
    lastDocument: null,
    candidates: [],
    dispositions: {},
    receiptCandidate: null,
    queue: [],
    cursor: 0,
    lastSource: null,
    skipDuplicates: true,
    failureReason: 'unreadable',
  }
}

export type ScanSessionAction =
  | { type: 'capture/start'; source: ScanSource }
  | { type: 'capture/parsed'; result: ScanParseResult; document?: ScanDocumentText | null }
  | { type: 'capture/unsupported' }
  | { type: 'toggleSkipDuplicates'; value: boolean }
  | { type: 'review/start' }
  | { type: 'review/accept' }
  | { type: 'review/skip' }
  | { type: 'review/stop' }
  | { type: 'retake' }
  | { type: 'reset' }

export function scanSessionReducer(state: ScanSessionState, action: ScanSessionAction): ScanSessionState {
  switch (action.type) {
    case 'capture/start':
      return { ...state, phase: 'parsing', lastSource: action.source }

    case 'capture/parsed':
      return handleParseResult(state, action.result, action.document ?? null)

    // Photo receipts on the web have no OCR (no VisionKit in the browser), so
    // the web camera path degrades honestly instead of silently failing.
    case 'capture/unsupported':
      return { ...state, phase: 'failed', failureReason: 'unsupportedOnWeb', lastSource: 'camera' }

    case 'toggleSkipDuplicates': {
      const skipDuplicates = action.value
      // Re-applies pre-skips live, matching Swift's `didSet { if phase ==
      // .interstitial { applyPreskips() } }`.
      if (state.phase !== 'interstitial') {
        return { ...state, skipDuplicates }
      }
      return {
        ...state,
        skipDuplicates,
        dispositions: applyPreskips(state.candidates, state.dispositions, skipDuplicates),
      }
    }

    case 'review/start': {
      const queue = state.candidates.filter((c) => state.dispositions[c.id] === 'pending')
      return {
        ...state,
        queue,
        cursor: 0,
        phase: queue.length === 0 ? 'summary' : 'reviewing',
      }
    }

    case 'review/accept': {
      const current = selectCurrentCandidate(state)
      if (!current) return state
      return advance({
        ...state,
        dispositions: { ...state.dispositions, [current.id]: 'added' },
      })
    }

    case 'review/skip': {
      const current = selectCurrentCandidate(state)
      if (!current) return state
      return advance({
        ...state,
        dispositions: { ...state.dispositions, [current.id]: 'skipped' },
      })
    }

    // Always available; rows already added stay (they were real adds).
    case 'review/stop':
      return { ...state, phase: 'summary' }

    // Only the phase resets — captured data (candidates/dispositions/queue)
    // is left alone, matching Swift's `retake()` exactly.
    case 'retake':
      return { ...state, phase: 'idle' }

    // Full reset, EXCEPT `skipDuplicates`: Swift's `reset()` never touches
    // it (it is a persisted preference, not capture data).
    case 'reset':
      return { ...createScanSessionState(), skipDuplicates: state.skipDuplicates }

    default:
      return state
  }
}

function handleParseResult(
  state: ScanSessionState,
  result: ScanParseResult,
  document: ScanDocumentText | null
): ScanSessionState {
  switch (result.kind) {
    case 'none':
      return { ...state, lastDocument: document, phase: 'failed', failureReason: 'unreadable' }

    case 'receipt':
      return {
        ...state,
        lastDocument: document,
        receiptCandidate: result.candidate,
        phase: 'receiptPrefilled',
      }

    case 'statement': {
      const dispositions: DispositionMap = {}
      for (const row of result.candidates) dispositions[row.id] = 'pending'
      return {
        ...state,
        lastDocument: document,
        candidates: result.candidates,
        dispositions: applyPreskips(result.candidates, dispositions, state.skipDuplicates),
        phase: 'interstitial',
      }
    }
  }
}

/** Payment rows are always pre-skipped; duplicates follow the toggle.
 *  Nothing here saves or discards permanently — Stop/summary is the only
 *  exit, and pending rows simply never get added. */
function applyPreskips(
  candidates: ParsedCandidate[],
  dispositions: DispositionMap,
  skipDuplicates: boolean
): DispositionMap {
  const next = { ...dispositions }
  for (const candidate of candidates) {
    if (candidate.isPaymentRow) {
      next[candidate.id] = 'leftOutPayment'
    } else if (candidate.duplicateOf != null) {
      next[candidate.id] = skipDuplicates ? 'leftOutDuplicate' : 'pending'
    }
  }
  return next
}

function advance(state: ScanSessionState): ScanSessionState {
  const isLastRow = state.cursor >= state.queue.length - 1
  if (isLastRow) {
    return { ...state, phase: 'summary' }
  }
  return { ...state, cursor: state.cursor + 1 }
}

// MARK: - Selectors (mirror ScanSession.swift's computed properties, FR-010)

export function selectRowCount(state: ScanSessionState): number {
  return state.candidates.length
}

export function selectDuplicateCount(state: ScanSessionState): number {
  return state.candidates.filter((c) => c.duplicateOf != null && !c.isPaymentRow).length
}

export function selectPaymentCount(state: ScanSessionState): number {
  return state.candidates.filter((c) => c.isPaymentRow).length
}

export function selectAddedCount(state: ScanSessionState): number {
  return Object.values(state.dispositions).filter((d) => d === 'added').length
}

/** User skips + payment pre-skips read as "skipped" in the summary. */
export function selectSkippedCount(state: ScanSessionState): number {
  return Object.values(state.dispositions).filter((d) => d === 'skipped' || d === 'leftOutPayment').length
}

export function selectLeftOutDuplicateCount(state: ScanSessionState): number {
  return Object.values(state.dispositions).filter((d) => d === 'leftOutDuplicate').length
}

/** Non-null only while reviewing — callers loop on this (the demo
 *  auto-accept does literally), so it MUST go nil/null when the wizard
 *  ends. */
export function selectCurrentCandidate(state: ScanSessionState): ParsedCandidate | null {
  if (state.phase !== 'reviewing') return null
  return state.queue[state.cursor] ?? null
}

export function selectIsLastRow(state: ScanSessionState): boolean {
  return state.cursor >= state.queue.length - 1
}

export function selectIsWizardActive(state: ScanSessionState): boolean {
  return state.phase === 'reviewing'
}
