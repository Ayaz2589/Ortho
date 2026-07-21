'use client'
// React hook for the CSV import session. Wraps csvImportReducer with file reading,
// bank detection, draft map construction, and store write on confirm.
import { useReducer, useCallback, useMemo } from 'react'
import { CSV_PROFILES } from '../../scripts/import/profiles/csv-index'
import { detectBank } from '../../scripts/import/engine/detectBank'
import { csvImportReducer, initialCsvImportState } from './csvImportSession'
import { checkedDrafts, totalSpendCents } from './csvImportModels'
import type { CsvDraftRow } from './csvImportModels'
import type { DuplicateCandidate } from './duplicateMatch'
import { resolveDefaultOwnerId } from '../defaultOwner'
import type { CsvImportState } from './csvImportSession'
import { orderedOwnerIds, computeShares } from '../splits'
import type { SplitInput } from '../splits'
import { useApp } from '../store'
import type { Transaction } from '../types'

function buildTransaction(
  draft: CsvDraftRow,
  bankSource: string,
  currentUserId: string,
  currentPersonId: string,
  householdId: string,
  now: string
): Transaction {
  const rawOwners = draft.ownerIds.length > 0 ? draft.ownerIds : [currentPersonId]
  // Canonicalize owner order so the leftover cent lands on the same owner as
  // app-entered transactions (orderedOwnerIds = ascending UUID sort, per lib/splits).
  const owners = orderedOwnerIds(rawOwners)
  const split: SplitInput = draft.splits
    ? { method: 'percent', percents: draft.splits }
    : { method: 'even' }
  const shares = computeShares(draft.amountCents, owners, split)

  return {
    id: crypto.randomUUID(),
    household_id: householdId,
    merchant: draft.merchant,
    category: draft.category,
    kind: draft.source.kind,
    amount_cents: draft.amountCents,
    source: bankSource,
    date: draft.dateISO.slice(0, 10),
    created_by: currentUserId,
    created_at: now,
    updated_at: now,
    owner_ids: owners,
    shares,
    tags: draft.tags,
    notes: draft.notes ?? null,
  }
}

export function useCsvImport() {
  const [state, dispatch] = useReducer(csvImportReducer, initialCsvImportState)
  const { addTransaction, transactions, currentUserId, currentPersonId, currentHousehold, householdMembers } = useApp()

  // The importing user, shared with the transaction form so imported and
  // hand-entered rows resolve their owner identically.
  const defaultOwnerId = resolveDefaultOwnerId(currentPersonId, householdMembers, currentUserId) || null

  // Existing ledger rows to check imported rows against for duplicates (any
  // owner in the household). Recomputed only when the ledger changes.
  const existing: DuplicateCandidate[] = useMemo(
    () => transactions.map((t) => ({ id: t.id, date: t.date, amountCents: t.amount_cents, merchant: t.merchant })),
    [transactions]
  )

  const loadFile = useCallback(
    async (file: File) => {
      const text = await file.text()
      const result = detectBank(text, null, CSV_PROFILES)
      if (!result.ok) {
        dispatch({ type: 'file/undetected' })
        return
      }
      const statement = result.profile.parse([text])
      dispatch({ type: 'file/parsed', statement, bankLabel: result.profile.label, defaultOwnerId, existing })
    },
    [dispatch, defaultOwnerId, existing]
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
    if (!currentHousehold) return
    dispatch({ type: 'import/start' })
    const now = new Date().toISOString()
    const bankSource = state.bankLabel
    const allDrafts = Object.values(state.drafts)
    const toAdd = checkedDrafts(allDrafts)
    const excluded = allDrafts.filter((d) => d.isPaymentRow)
    const skipped = allDrafts.filter((d) => d.skipped)
    const duplicates = allDrafts.filter((d) => d.duplicateOf && !d.checked && !d.skipped)

    for (const draft of toAdd) {
      const tx = buildTransaction(draft, bankSource, currentUserId, currentPersonId, currentHousehold.id, now)
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
  }, [state, addTransaction, currentUserId, currentPersonId, currentHousehold])

  const reset = useCallback(() => dispatch({ type: 'reset' }), [dispatch])

  const drafts: CsvDraftRow[] = useMemo(() => {
    if (state.phase !== 'list-view') return []
    // ISO dates sort correctly with string comparison — no Date construction needed.
    return Object.values(state.drafts).sort((a, b) => b.dateISO.localeCompare(a.dateISO))
  }, [state])

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
