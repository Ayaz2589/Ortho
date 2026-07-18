// @vitest-environment jsdom
//
// spec 021 — the orchestration hook (T053) tying capture -> parse -> the
// scanSession reducer together. Two capture sources, each with a native and a
// web branch (fix/web-scan-fallback):
//   - camera:  native Scan.capture() | web honest degrade (no browser OCR)
//   - file:    native FilePicker + Scan.extractPDF() | web <input> + unpdf
// Photo-library picking has no extractImage() method in the current plugin
// contract (a documented follow-up, not a silent gap; see
// contracts/scan-plugin-api.md).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Platform switch — the hook branches on Capacitor.isNativePlatform(). Default
// native; the web describe block flips it to false in beforeEach.
const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
  registerPlugin: vi.fn(),
}))

const { capture, extractPDF, onPageCaptured } = vi.hoisted(() => ({
  capture: vi.fn(),
  extractPDF: vi.fn(),
  onPageCaptured: vi.fn(),
}))
vi.mock('@/lib/scan/scanPlugin', () => ({ ScanPlugin: { capture, extractPDF, onPageCaptured } }))

const { pickFiles } = vi.hoisted(() => ({ pickFiles: vi.fn() }))
vi.mock('@capawesome/capacitor-file-picker', () => ({ FilePicker: { pickFiles } }))

// Web branch collaborators.
const { pickFile } = vi.hoisted(() => ({ pickFile: vi.fn() }))
vi.mock('@/lib/scan/webCapture', () => ({ pickFile }))
const { extractPdfToDocument } = vi.hoisted(() => ({ extractPdfToDocument: vi.fn() }))
vi.mock('@/lib/scan/webPdf', () => ({ extractPdfToDocument }))

const store = {
  transactions: [] as unknown[],
  currency: 'usd' as string,
}
vi.mock('@/lib/store', () => ({
  useApp: () => ({ transactions: store.transactions, currency: store.currency }),
}))

import { useScanFlow } from '@/lib/scan/useScanFlow'

const F = { x: 0, y: 0, width: 0, height: 0 }

beforeEach(() => {
  isNativePlatform.mockReturnValue(true)
  capture.mockReset()
  extractPDF.mockReset()
  pickFiles.mockReset()
  onPageCaptured.mockReset()
  onPageCaptured.mockResolvedValue({ remove: vi.fn() })
  pickFile.mockReset()
  extractPdfToDocument.mockReset()
  store.transactions = []
  store.currency = 'usd'
})

describe('useScanFlow — native platform', () => {
  it('starts in idle', () => {
    const { result } = renderHook(() => useScanFlow())
    expect(result.current.state.phase).toBe('idle')
  })

  it('camera capture of a receipt-shaped document parses to receiptPrefilled', async () => {
    capture.mockResolvedValue({
      imageUri: 'file:///tmp/x.jpg',
      page: { lines: [{ text: 'CORNER PLACE', frame: F }, { text: '07/01/2026', frame: F }, { text: 'TOTAL  $12.00', frame: F }], tables: [] },
    })
    const { result } = renderHook(() => useScanFlow())

    await act(async () => {
      await result.current.startCameraCapture()
    })

    await waitFor(() => expect(result.current.state.phase).toBe('receiptPrefilled'))
    expect(result.current.state.receiptCandidate?.merchant).toBe('CORNER PLACE')
  })

  it('retains every page of a multi-shot statement capture (B3)', async () => {
    const page1 = { lines: [{ text: 'STATEMENT PERIOD 06/01/2026 - 06/30/2026', frame: F }, { text: '06/05  UBER TRIP  $18.50', frame: F }], tables: [] }
    const page2 = { lines: [{ text: '06/08  BLUE BOTTLE  $6.25', frame: F }], tables: [] }
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
    expect(result.current.state.failureReason).toBe('unreadable')
  })

  it('file import extracts a PDF and parses it', async () => {
    pickFiles.mockResolvedValue({ files: [{ name: 'statement.pdf', mimeType: 'application/pdf', size: 100, path: '/tmp/statement.pdf' }] })
    extractPDF.mockResolvedValue({
      pages: [{ lines: [{ text: 'STATEMENT PERIOD 06/01/2026 - 06/30/2026', frame: F }, { text: '06/05  UBER TRIP  $18.50', frame: F }], tables: [] }],
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

  it('does NOT use the web <input> path on native', async () => {
    pickFiles.mockResolvedValue({ files: [] })
    const { result } = renderHook(() => useScanFlow())
    await act(async () => {
      await result.current.startFileImport()
    })
    expect(pickFile).not.toHaveBeenCalled()
    expect(pickFiles).toHaveBeenCalled()
  })
})

describe('useScanFlow — web platform (fix/web-scan-fallback)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('camera capture degrades honestly (no browser OCR), never touching the native plugin', async () => {
    const { result } = renderHook(() => useScanFlow())

    await act(async () => {
      await result.current.startCameraCapture()
    })

    expect(result.current.state.phase).toBe('failed')
    expect(result.current.state.failureReason).toBe('unsupportedOnWeb')
    expect(capture).not.toHaveBeenCalled()
    expect(onPageCaptured).not.toHaveBeenCalled()
  })

  it('PDF import opens the <input>, extracts via unpdf, and parses a statement', async () => {
    const file = new File(['%PDF'], 'statement.pdf', { type: 'application/pdf' })
    pickFile.mockResolvedValue(file)
    extractPdfToDocument.mockResolvedValue({
      pages: [{ lines: [
        { text: 'STATEMENT PERIOD 06/01/2026 - 06/30/2026', frame: F },
        { text: '06/05  UBER TRIP  $18.50', frame: F },
      ], tables: [] }],
    })
    const { result } = renderHook(() => useScanFlow())

    await act(async () => {
      await result.current.startFileImport()
    })

    expect(pickFile).toHaveBeenCalledWith('application/pdf')
    expect(extractPdfToDocument).toHaveBeenCalledWith(file)
    // Same parser as native — a one-row statement is still a statement.
    await waitFor(() => expect(result.current.state.phase).toBe('interstitial'))
    // Never reaches for the native plugins on web.
    expect(extractPDF).not.toHaveBeenCalled()
    expect(pickFiles).not.toHaveBeenCalled()
  })

  it('PDF import that the user cancels stays idle (no failure)', async () => {
    pickFile.mockResolvedValue(null)
    const { result } = renderHook(() => useScanFlow())

    await act(async () => {
      await result.current.startFileImport()
    })

    expect(extractPdfToDocument).not.toHaveBeenCalled()
    expect(result.current.state.phase).toBe('idle')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('an unreadable (image-only) PDF surfaces the failed phase AND logs the cause', async () => {
    pickFile.mockResolvedValue(new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' }))
    extractPdfToDocument.mockRejectedValue(new Error('UNPARSEABLE_PDF: no extractable text'))
    const { result } = renderHook(() => useScanFlow())

    await act(async () => {
      await result.current.startFileImport()
    })

    await waitFor(() => expect(result.current.state.phase).toBe('failed'))
    expect(result.current.state.failureReason).toBe('unreadable')
    // The whole point of the fix: a real failure is no longer swallowed silently.
    expect(errorSpy).toHaveBeenCalled()
  })
})
