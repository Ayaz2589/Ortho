// @vitest-environment jsdom
//
// spec 021 — the orchestration hook (T053) tying capture -> parse -> the
// scanSession reducer together: camera capture via the custom Scan plugin,
// PDF import via the file-picker plugin + Scan.extractPDF(). Scoped to these
// two sources for this pass — photo-library picking has no extractImage()
// method in the current plugin contract (a documented follow-up, not a
// silent gap; see contracts/scan-plugin-api.md).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { capture, extractPDF } = vi.hoisted(() => ({
  capture: vi.fn(),
  extractPDF: vi.fn(),
}))
vi.mock('@/lib/scan/scanPlugin', () => ({ ScanPlugin: { capture, extractPDF } }))

const { pickFiles } = vi.hoisted(() => ({ pickFiles: vi.fn() }))
vi.mock('@capawesome/capacitor-file-picker', () => ({ FilePicker: { pickFiles } }))

const store = {
  transactions: [] as unknown[],
  currency: 'usd' as string,
}
vi.mock('@/lib/store', () => ({
  useApp: () => ({ transactions: store.transactions, currency: store.currency }),
}))

import { useScanFlow } from '@/lib/scan/useScanFlow'

describe('useScanFlow', () => {
  beforeEach(() => {
    capture.mockReset()
    extractPDF.mockReset()
    pickFiles.mockReset()
    store.transactions = []
    store.currency = 'usd'
  })

  it('starts in idle', () => {
    const { result } = renderHook(() => useScanFlow())
    expect(result.current.state.phase).toBe('idle')
  })

  it('camera capture of a receipt-shaped document parses to receiptPrefilled', async () => {
    capture.mockResolvedValue({
      imageUri: 'file:///tmp/x.jpg',
      page: { lines: [{ text: 'CORNER PLACE', frame: { x: 0, y: 0, width: 0, height: 0 } }, { text: '07/01/2026', frame: { x: 0, y: 0, width: 0, height: 0 } }, { text: 'TOTAL  $12.00', frame: { x: 0, y: 0, width: 0, height: 0 } }], tables: [] },
    })
    const { result } = renderHook(() => useScanFlow())

    await act(async () => {
      await result.current.startCameraCapture()
    })

    await waitFor(() => expect(result.current.state.phase).toBe('receiptPrefilled'))
    expect(result.current.state.receiptCandidate?.merchant).toBe('CORNER PLACE')
  })

  it('camera cancellation lands on the failed phase, never throws', async () => {
    capture.mockRejectedValue(new Error('Scan cancelled.'))
    const { result } = renderHook(() => useScanFlow())

    await act(async () => {
      await result.current.startCameraCapture()
    })

    await waitFor(() => expect(result.current.state.phase).toBe('failed'))
  })

  it('file import extracts a PDF and parses it', async () => {
    pickFiles.mockResolvedValue({ files: [{ name: 'statement.pdf', mimeType: 'application/pdf', size: 100, path: '/tmp/statement.pdf' }] })
    extractPDF.mockResolvedValue({
      pages: [{ lines: [{ text: 'STATEMENT PERIOD 06/01/2026 - 06/30/2026', frame: { x: 0, y: 0, width: 0, height: 0 } }, { text: '06/05  UBER TRIP  $18.50', frame: { x: 0, y: 0, width: 0, height: 0 } }], tables: [] }],
    })
    const { result } = renderHook(() => useScanFlow())

    await act(async () => {
      await result.current.startFileImport()
    })

    expect(extractPDF).toHaveBeenCalledWith({ fileUri: 'file:///tmp/statement.pdf' })
    await waitFor(() => expect(result.current.state.phase).toBe('interstitial'))
  })

  it('file import does nothing (stays idle) when the user cancels the picker', async () => {
    pickFiles.mockResolvedValue({ files: [] })
    const { result } = renderHook(() => useScanFlow())

    await act(async () => {
      await result.current.startFileImport()
    })

    expect(extractPDF).not.toHaveBeenCalled()
    expect(result.current.state.phase).toBe('idle')
  })

  it('resets to idle without touching persisted preferences', async () => {
    capture.mockRejectedValue(new Error('cancelled'))
    const { result } = renderHook(() => useScanFlow())
    await act(async () => {
      await result.current.startCameraCapture()
    })
    await waitFor(() => expect(result.current.state.phase).toBe('failed'))

    act(() => result.current.dispatch({ type: 'reset' }))
    expect(result.current.state.phase).toBe('idle')
  })
})
