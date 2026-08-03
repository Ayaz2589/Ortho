'use client'

import { PieChart } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Placeholder } from '../placeholders'

/**
 * Budgets widget body. Spec 035 keeps the calm placeholder; Section 3 (spec 038)
 * replaces it with per-category spend-vs-limit rows via `budgetStatusForMonth`.
 * Body stays PROPLESS (decision D4).
 */
export function BudgetsBody() {
  const { t } = useApp()
  return <Placeholder icon={<PieChart size={15} />} note={t('Preview')} rows={3} />
}
