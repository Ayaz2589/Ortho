// @vitest-environment jsdom
// spec 032 US3 — the import panel: preview counts → confirm → summary, and a
// non-Ortho file is rejected with no changes. The dataFile pipeline is mocked
// here (its behavior is covered by the node-env dataFile suites); this asserts
// the component wiring.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const t = (k: string, ...a: Array<string | number>) =>
  a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t }),
}))

const readEnvelope = vi.fn()
const planImport = vi.fn()
const applyImport = vi.fn()

vi.mock('@/lib/dataFile/readPdf', () => ({ readEnvelope: (...a: unknown[]) => readEnvelope(...a) }))
vi.mock('@/lib/dataFile/import', () => ({
  planImport: (...a: unknown[]) => planImport(...a),
  applyImport: (...a: unknown[]) => applyImport(...a),
}))

import { DataImportPanel } from '@/components/settings/DataImportPanel'

function pdf(name = 'x.pdf') {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' })
}

afterEach(() => {
  cleanup()
  readEnvelope.mockReset()
  planImport.mockReset()
  applyImport.mockReset()
})

describe('DataImportPanel', () => {
  it('rejects a non-Ortho file and makes no changes', async () => {
    readEnvelope.mockResolvedValue({ ok: false, reason: 'not-ortho-file' })
    const user = userEvent.setup()
    render(<DataImportPanel />)
    await user.upload(screen.getByLabelText('Choose a PDF to import'), pdf())
    await waitFor(() => expect(screen.getByText(/doesn’t look like an Ortho data file/)).toBeTruthy())
    expect(applyImport).not.toHaveBeenCalled()
  })

  it('previews per-section counts, then applies on confirm and shows a summary', async () => {
    readEnvelope.mockResolvedValue({ ok: true, envelope: { sections: [] } })
    const result = {
      ok: true,
      fileLabel: 'Home · 2026-07-27',
      sections: [{ key: 'transactions', known: true, added: 2, skippedById: 1, skippedByContent: 0 }],
    }
    planImport.mockReturnValue({ result, plans: [{ key: 'transactions', plan: { add: [1, 2], skipById: [1], skipByContent: [] } }] })

    const user = userEvent.setup()
    render(<DataImportPanel />)
    await user.upload(screen.getByLabelText('Choose a PDF to import'), pdf())

    await waitFor(() => expect(screen.getByText('add 2 · already there 1')).toBeTruthy())

    await user.click(screen.getByText('Add 2 items'))
    expect(applyImport).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy())
    expect(screen.getByText('added 2 · already there 1')).toBeTruthy()
  })

  it('disables the confirm button when nothing new would be added', async () => {
    readEnvelope.mockResolvedValue({ ok: true, envelope: { sections: [] } })
    planImport.mockReturnValue({
      result: { ok: true, fileLabel: '', sections: [{ key: 'transactions', known: true, added: 0, skippedById: 3, skippedByContent: 0 }] },
      plans: [],
    })
    const user = userEvent.setup()
    render(<DataImportPanel />)
    await user.upload(screen.getByLabelText('Choose a PDF to import'), pdf())
    await waitFor(() => expect(screen.getByText('Nothing new to add')).toBeTruthy())
    expect((screen.getByText('Nothing new to add').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
