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

const { capture, extractPDF, onPageCaptured } = vi.hoisted(() => ({
  capture: vi.fn(),
  extractPDF: vi.fn(),
  onPageCaptured: vi.fn(),
}))
vi.mock('@/lib/scan/scanPlugin', () => ({ ScanPlugin: { capture, extractPDF, onPageCaptured } }))

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
    onPageCaptured.mockReset()
    onPageCaptured.mockResolvedValue({ remove: vi.fn() })
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

  it('retains every page of a multi-shot statement capture (B3)', async () => {
    const f = { x: 0, y: 0, width: 0, height: 0 }
    const page1 = { lines: [{ text: 'STATEMENT PERIOD 06/01/2026 - 06/30/2026', frame: f }, { text: '06/05  UBER TRIP  $18.50', frame: f }], tables: [] }
    const page2 = { lines: [{ text: '06/08  BLUE BOTTLE  $6.25', frame: f }], tables: [] }
    capture.mockResolvedValue({ imageUri: 'file:///tmp/1.jpg', page: page1 })
    let pageHandler: ((data: { imageUri: string; page: typeof page1 }) => void) | undefined
    onPageCaptured.mockImplementation((h) => {
      pageHandler = h as typeof pageHandler
      return Promise.resolve({ remove: vi.fn() })
    })

    const { result } = renderHook(() => useScanFlow())
    await act(async () => {
      await result.current.startCameraCapture()
    })
    // Listener subscribed before the first page; first page parsed a statement.
    expect(onPageCaptured).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.state.phase).toBe('interstitial'))
    expect(result.current.state.lastDocument?.pages).toHaveLength(1)

    // A second photo arrives via pageCaptured — it must NOT be dropped: the
    // document re-parses with both pages.
    await act(async () => {
      pageHandler?.({ imageUri: 'file:///tmp/2.jpg', page: page2 })
    })
    await waitFor(() => expect(result.current.state.lastDocument?.pages).toHaveLength(2))
    expect(result.current.state.phase).toBe('interstitial')
  })

  it('removes the pageCaptured listener when the hook unmounts', async () => {
    const remove = vi.fn()
    onPageCaptured.mockResolvedValue({ remove })
    capture.mockResolvedValue({ imageUri: 'file:///tmp/1.jpg', page: { lines: [], tables: [] } })
    const { result, unmount } = renderHook(() => useScanFlow())
    await act(async () => {
      await result.current.startCameraCapture()
    })
    unmount()
    expect(remove).toHaveBeenCalled()
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
