// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

// Isolate the phase dispatcher: stub the Drawer chrome and drive the phase via a
// mocked useCsvImport so we can assert the in-tray uploader (idle phase).
vi.mock('@/components/web/Drawer', () => ({
  Drawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

const { loadFile } = vi.hoisted(() => ({ loadFile: vi.fn() }))
vi.mock('@/lib/csv/useCsvImport', () => ({
  useCsvImport: () => ({
    phase: 'idle',
    drafts: [],
    bankLabel: '',
    summary: null,
    loadFile,
    toggleChecked: vi.fn(),
    updateDraft: vi.fn(),
    skipDraft: vi.fn(),
    startImport: vi.fn(),
    reset: vi.fn(),
  }),
}))

import { CsvImportFlow } from '@/components/csv/CsvImportFlow'

describe('CsvImportFlow — in-tray uploader', () => {
  it('shows the uploader and the list of supported CSVs when no file is loaded', () => {
    render(<CsvImportFlow onClose={vi.fn()} />)
    expect(screen.getByText('Upload a CSV')).toBeTruthy()
    expect(screen.getByText('Supported CSVs')).toBeTruthy()
    // A few of the supported banks are listed.
    expect(screen.getByText('Chase (Credit Card)')).toBeTruthy()
    expect(screen.getByText('American Express')).toBeTruthy()
    expect(screen.getByText('TD Bank (Checking)')).toBeTruthy()
  })

  it('parses the chosen file (hands it to loadFile)', () => {
    const { container } = render(<CsvImportFlow onClose={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['a,b,c'], 'statement.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(loadFile).toHaveBeenCalledWith(file)
  })
})
