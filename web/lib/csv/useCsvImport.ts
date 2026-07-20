'use client'
// React hook for the CSV import session. Wraps csvImportReducer with file reading,
// bank detection, draft map construction, and store write on confirm.
import { useReducer, useCallback } from 'react'
import { CSV_PROFILES } from '../../scripts/import/profiles/csv-index'
import { detectBank } from '../../scripts/import/engine/detectBank'
import { csvImportReducer, initialCsvImportState } from './csvImportSession'
import { checkedDrafts, totalSpendCents } from './csvImportModels'
import type { CsvDraftRow } from './csvImportModels'
import type { CsvImportState } from './csvImportSession'
import { useApp } from '../store'
import type { Transaction } from '../types'

function buildTransaction(
  draft: CsvDraftRow,
  bankSource: string,
  currentUserId: string,
  currentPersonId: string,
  now: string
): Transaction {
  const ownerIds = draft.ownerIds.length > 0 ? draft.ownerIds : [currentPersonId]
  const shares: Record<string, number> =
    draft.splits ??
    Object.fromEntries(
      ownerIds.map((pid, i) => {
        const evenCents = Math.floor(draft.amountCents / ownerIds.length)
        // Give any remainder to the first owner
        const extra = i === 0 ? draft.amountCents - evenCents * ownerIds.length : 0
        return [pid, evenCents + extra]
      })
    )

  return {
    id: crypto.randomUUID(),
    household_id: '',
    merchant: draft.merchant,
    category: draft.category,
    kind: draft.source.kind,
    amount_cents: draft.amountCents,
    source: bankSource,
    date: draft.dateISO.slice(0, 10),
    created_by: currentUserId,
    created_at: now,
    updated_at: now,
    owner_ids: ownerIds,
    shares,
    tags: draft.tags,
    notes: draft.notes ?? null,
  }
}

export function useCsvImport() {
  const [state, dispatch] = useReducer(csvImportReducer, initialCsvImportState)
  const { addTransaction, currentUserId, currentPersonId } = useApp()

  const loadFile = useCallback(
    async (file: File) => {
      const text = await file.text()
      const result = detectBank(text, null, CSV_PROFILES)
      if (!result.ok) {
        dispatch({ type: 'file/undetected' })
        return
      }
      const statement = result.profile.parse([text])
      dispatch({ type: 'file/parsed', statement, bankLabel: result.profile.label })
    },
    [dispatch]
  )

  const toggleChecked = useCallback(
    (id: string) => dispatch({ type: 'draft/toggleChecked', id }),
    [dispatch]
  )

  const updateDraft = useCallback(
    (id: string, patch: Partial<Omit<CsvDraftRow, 'id' | 'source'>>) =>
      dispatch({ type: 'draft/update', id, patch }),
    [dispatch]
  )

  const skipDraft = useCallback(
    (id: string) => dispatch({ type: 'draft/skip', id }),
    [dispatch]
  )

  const startImport = useCallback(async () => {
    if (state.phase !== 'list-view') return
    dispatch({ type: 'import/start' })
    const now = new Date().toISOString()
    const bankSource = state.bankLabel
    const toAdd = checkedDrafts(Object.values(state.drafts))
    const excluded = Object.values(state.drafts).filter((d) => d.isPaymentRow)
    const skipped = Object.values(state.drafts).filter((d) => !d.checked && !d.isPaymentRow && !d.duplicateOf)
    const duplicates = Object.values(state.drafts).filter((d) => d.duplicateOf && !d.checked)

    for (const draft of toAdd) {
      const tx = buildTransaction(draft, bankSource, currentUserId, currentPersonId, now)
      addTransaction(tx)
    }

    dispatch({
      type: 'import/done',
      addedCount: toAdd.length,
      skippedCount: skipped.length,
      excludedCount: excluded.length,
      duplicatesCount: duplicates.length,
      totalSpendCents: totalSpendCents(Object.values(state.drafts)),
    })
  }, [state, addTransaction, currentUserId, currentPersonId])

  const reset = useCallback(() => dispatch({ type: 'reset' }), [dispatch])

  const drafts: CsvDraftRow[] =
    state.phase === 'list-view'
      ? Object.values(state.drafts).sort(
          (a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime()
        )
      : []

  const bankLabel = state.phase === 'list-view' ? state.bankLabel : ''
  const period = state.phase === 'list-view' ? state.period : null
  const summary = state.phase === 'summary' ? state : null

  return {
    phase: state.phase,
    drafts,
    bankLabel,
    period,
    summary,
    loadFile,
    toggleChecked,
    updateDraft,
    skipDraft,
    startImport,
    reset,
  }
}

export type UseCsvImport = ReturnType<typeof useCsvImport>
