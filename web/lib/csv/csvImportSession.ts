// Pure reducer for the CSV import session state machine.
// Phases: idle → list-view → importing → summary
//         idle → undetected (bank not recognized)
import type { ParsedStatement, StatementPeriod } from '../../scripts/import/engine/types'
import type { CsvDraftRow } from './csvImportModels'
import { parsedTransactionToDraft } from './csvImportModels'

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
  | { type: 'file/parsed'; statement: ParsedStatement; bankLabel: string }
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
      const drafts: Record<string, CsvDraftRow> = {}
      for (const tx of allRows) {
        // TODO(spec-030): pass duplicateOf when duplicate detection is implemented.
        // Currently parsedTransactionToDraft is always called without a second arg,
        // so draft.duplicateOf is always null and duplicatesCount is always 0.
        const draft = parsedTransactionToDraft(tx)
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
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.id]: { ...existing, ...action.patch },
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
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.id]: { ...existing, checked: false },
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
