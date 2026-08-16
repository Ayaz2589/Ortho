// Pure reducer for the CSV import session state machine.
// Phases: idle → list-view → importing → summary
//         idle → undetected (bank not recognized)
import type { ParsedStatement, StatementPeriod } from '../../scripts/import/engine/types'
import type { CsvDraftRow } from './csvImportModels'
import { parsedTransactionToDraft } from './csvImportModels'
import { findDuplicateId, type DuplicateCandidate } from './duplicateMatch'

// ── State ────────────────────────────────────────────────────────────────────

export type CsvImportPhase = 'idle' | 'list-view' | 'importing' | 'summary' | 'undetected'

export type CsvImportState =
  | { phase: 'idle' }
  | { phase: 'undetected' }
  | {
      phase: 'list-view'
      bankLabel: string
      period: StatementPeriod
      drafts: Record<string, CsvDraftRow>
    }
  | { phase: 'importing' }
  | {
      phase: 'summary'
      addedCount: number
      skippedCount: number
      excludedCount: number
      duplicatesCount: number
      totalSpendCents: number
    }

export const initialCsvImportState: CsvImportState = { phase: 'idle' }

// ── Actions ──────────────────────────────────────────────────────────────────

export type CsvImportAction =
  | {
      type: 'file/parsed'
      statement: ParsedStatement
      bankLabel: string
      defaultOwnerIds?: string[]
      defaultPayerId?: string | null
      // Card name matching the imported bank, seeded as every row's payment
      // source ('' when no card matches).
      defaultSource?: string
      // Existing ledger rows to check each parsed row against for duplicates.
      existing?: DuplicateCandidate[]
    }
  | { type: 'file/undetected' }
  | { type: 'draft/update'; id: string; patch: Partial<Omit<CsvDraftRow, 'id' | 'source'>> }
  | { type: 'draft/toggleChecked'; id: string }
  | { type: 'draft/skip'; id: string }
  | { type: 'import/start' }
  | {
      type: 'import/done'
      addedCount: number
      skippedCount: number
      excludedCount: number
      duplicatesCount: number
      totalSpendCents: number
    }
  | { type: 'reset' }

// ── Reducer ──────────────────────────────────────────────────────────────────

export function csvImportReducer(state: CsvImportState, action: CsvImportAction): CsvImportState {
  switch (action.type) {
    case 'file/parsed': {
      const allRows = action.statement.sections.flatMap((s) => s.rows)
      const existing = action.existing ?? []
      const drafts: Record<string, CsvDraftRow> = {}
      for (const tx of allRows) {
        // Flag rows that probably duplicate an existing ledger transaction (same
        // day + amount + similar merchant) so they're excluded by default but
        // shown in review. Empty `existing` → no matches, as before. Skip already
        // excluded rows (e.g. card payments) — they never import, and flagging
        // them would double-count as both "excluded" and "duplicate".
        const duplicateOf = tx.excluded ? null : findDuplicateId(tx, existing)
        const draft = parsedTransactionToDraft(
          tx,
          duplicateOf,
          action.defaultOwnerIds ?? [],
          action.defaultPayerId ?? null,
          action.defaultSource ?? ''
        )
        drafts[draft.id] = draft
      }
      return {
        phase: 'list-view',
        bankLabel: action.bankLabel,
        period: action.statement.period,
        drafts,
      }
    }

    case 'file/undetected':
      return { phase: 'undetected' }

    case 'draft/update': {
      if (state.phase !== 'list-view') return state
      const existing = state.drafts[action.id]
      if (!existing) return state
      // Mark the row edited only when the patch actually changes a value — so a
      // no-op save (open the editor, Save without changes) doesn't flag it.
      const existingRec = existing as unknown as Record<string, unknown>
      const patchRec = action.patch as Record<string, unknown>
      const changed = Object.keys(patchRec).some(
        (k) => JSON.stringify(existingRec[k]) !== JSON.stringify(patchRec[k])
      )
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.id]: { ...existing, ...action.patch, edited: existing.edited || changed },
        },
      }
    }

    case 'draft/toggleChecked': {
      if (state.phase !== 'list-view') return state
      const existing = state.drafts[action.id]
      if (!existing || existing.isPaymentRow) return state
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.id]: { ...existing, checked: !existing.checked },
        },
      }
    }

    case 'draft/skip': {
      if (state.phase !== 'list-view') return state
      const existing = state.drafts[action.id]
      if (!existing) return state
      // Mark skipped so it drops out of the review list (and never imports).
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.id]: { ...existing, checked: false, skipped: true },
        },
      }
    }

    case 'import/start':
      return { phase: 'importing' }

    case 'import/done':
      return {
        phase: 'summary',
        addedCount: action.addedCount,
        skippedCount: action.skippedCount,
        excludedCount: action.excludedCount,
        duplicatesCount: action.duplicatesCount,
        totalSpendCents: action.totalSpendCents,
      }

    case 'reset':
      return initialCsvImportState

    default:
      return state
  }
}
