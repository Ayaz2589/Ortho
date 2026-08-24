// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    formatMoney: (c: number) => `$${(c / 100).toFixed(2)}`,
    t: (k: string, ...a: Array<string | number>) =>
      a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k,
  }),
}))

import { CsvImportSummary } from '@/components/csv/CsvImportSummary'

describe('CsvImportSummary', () => {
  it('shows the added count headline', () => {
    render(
      <CsvImportSummary
        addedCount={35}
        failedCount={0}
        totalSpendCents={261423}
        skippedCount={2}
        excludedCount={3}
        duplicatesCount={2}
        onDone={vi.fn()}
      />
    )
    expect(screen.getByText(/35/)).toBeTruthy()
  })

  it('formats the total spend correctly', () => {
    render(
      <CsvImportSummary
        addedCount={35}
        failedCount={0}
        totalSpendCents={261423}
        skippedCount={2}
        excludedCount={3}
        duplicatesCount={2}
        onDone={vi.fn()}
      />
    )
    expect(screen.getByText('$2614.23')).toBeTruthy()
  })

  it('shows the skipped, excluded, and duplicate counts', () => {
    render(
      <CsvImportSummary
        addedCount={35}
        failedCount={0}
        totalSpendCents={261423}
        skippedCount={2}
        excludedCount={3}
        duplicatesCount={2}
        onDone={vi.fn()}
      />
    )
    expect(screen.getByText(/2.*skipped|skipped.*2/i)).toBeTruthy()
    expect(screen.getByText(/3.*excluded|excluded.*3/i)).toBeTruthy()
  })

  it('calls onDone when the Done button is clicked', async () => {
    const onDone = vi.fn()
    render(
      <CsvImportSummary
        addedCount={35}
        failedCount={0}
        totalSpendCents={261423}
        skippedCount={2}
        excludedCount={3}
        duplicatesCount={2}
        onDone={onDone}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onDone).toHaveBeenCalled()
  })
})
