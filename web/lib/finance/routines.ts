// Financial Routines detection engine (spec 044). Pure, deterministic, side-effect-free — mirrors
// insights.ts / personSummary.ts (no React, no DB). Routine *detection* is always recomputed live
// from transactions (README's "derived, never stored" principle); only a user's confirm/dismiss/
// rename decision is persisted (recognized_routine_states), applied on top via applyRoutineStates().
// Pinned by unit + property tests (web/test/finance/routines*.test.ts), not a golden vector — same
// precedent as financialHealth.ts. Contract: specs/044-financial-routines/contracts/routines-engine.md.

import type { RecognizedRoutineState, Transaction, TransactionCategory } from '../types'
import { ROUTINE_THRESHOLDS as T } from './routines-thresholds'

export type RoutineKind = 'recurring_charge' | 'behavioral_habit'
export type RoutineDerivedStatus = 'recognized' | 'lapsed'
export type RoutineStatus = RoutineDerivedStatus | 'confirmed' | 'dismissed'

export interface DetectedRoutine {
  routineKey: string
  kind: RoutineKind
  merchantKey: string
  merchantLabel: string
  category: TransactionCategory | null
  weekday: number | null
  hourBucket: number | null
  personId: string | null
  typicalAmountCents: number
  amountVarianceCents: number
  occurrenceCount: number
  firstSeenAt: string
  lastSeenAt: string
  confidence: number
  derivedStatus: RoutineDerivedStatus
  evidenceTransactionIds: string[]
}

export interface RoutineWithState extends DetectedRoutine {
  status: RoutineStatus
  label: string | null
}

/** Normalize a raw merchant string into a stable grouping key (FR-007). Lowercase, strip a
 *  trailing POS/store-location numeric suffix, collapse whitespace/punctuation. Heuristic, tunable
 *  via routines-thresholds.ts without touching detection logic. */
export function normalizeMerchantKey(merchant: string): string {
  const cleaned = merchant
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const storeCodePattern = new RegExp(
    `\\s\\d{${T.merchantStoreCodeMinDigits},${T.merchantStoreCodeMaxDigits}}$`
  )
  return cleaned.replace(storeCodePattern, '').trim()
}
