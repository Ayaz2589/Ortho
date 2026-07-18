// Orchestration hook (spec 021, T053): capture -> parse -> the scanSession
// reducer. Two capture sources, each with a native and a web branch:
//   - camera:
//       native → the custom Scan plugin's capture() (live-OCR-gated shutter,
//         OCR already ran natively by the time it resolves)
//       web    → no browser OCR (no VisionKit), so it degrades honestly to the
//         `unsupportedOnWeb` failure instead of dead-ending silently
//         (fix/web-scan-fallback). See the OCR options note in the PR.
//   - file (PDF statements):
//       native → @capawesome/capacitor-file-picker's pickFiles() + the Scan
//         plugin's extractPDF()
//       web    → an <input type="file"> (webCapture.pickFile) + unpdf text
//         extraction (webPdf.extractPdfToDocument); both feed the SAME
//         scanParser pipeline, so candidates are identical across platforms.
// Photo-library picking is NOT wired here — the plugin contract has no
// extractImage() method for an arbitrary already-picked photo (only capture()
// does live OCR); see contracts/scan-plugin-api.md. A documented follow-up,
// not a silent gap.
'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { useApp } from '@/lib/store'
import { createScanSessionState, scanSessionReducer } from './scanSession'
import { pickFile } from './webCapture'
import type { ScanDocumentText, ScanDocumentTextPage } from './scanModels'

// The scan pipeline is deferred (spec 022, US2): the heavy parser/heuristics/inference
// graph, the native Scan plugin, the file picker, and the unpdf PDF reader are dynamically
// imported inside the capture callbacks so they load only when the user actually initiates a
// scan — not on Transactions-route load. Only the lightweight session reducer and the tiny,
// dependency-free web file-dialog helper stay eager (the latter must run inside the click
// gesture, so it can't sit behind an await). Vitest mocks (test/scan/useScanFlow.test.tsx)
// apply to these dynamic imports by resolved path, so behavior is unchanged.

/** Log a genuine scan failure so it's visible in the console, but stay quiet on
 *  an ordinary user cancellation. Before fix/web-scan-fallback every rejection —
 *  including the web build's `UNIMPLEMENTED` plugin errors — was swallowed into
 *  the same calm `{kind:'none'}` as an unreadable document, so real breakage was
 *  invisible. This keeps the calm UI but makes the cause diagnosable. */
function reportScanError(context: string, err: unknown): void {
  if (isCancellation(err)) return
  console.error(`[scan] ${context} failed:`, err)
}

function isCancellation(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()
  return message.includes('cancel') || message.includes('dismiss')
}

export function useScanFlow() {
  const { transactions, currency } = useApp()
  const [state, dispatch] = useReducer(scanSessionReducer, undefined, createScanSessionState)

  // Pages accumulated across a multi-shot camera session. A ref (not state) so
  // the pageCaptured listener always appends to the latest set without a stale
  // closure, and the reducer stays the single source of UI truth.
  const pagesRef = useRef<ScanDocumentTextPage[]>([])
  const pageListenerRef = useRef<PluginListenerHandle | null>(null)

  const removePageListener = useCallback(() => {
    pageListenerRef.current?.remove()
    pageListenerRef.current = null
  }, [])

  // Tear down the native listener if the component unmounts mid-session.
  useEffect(() => removePageListener, [removePageListener])

  const processDocument = useCallback(
    async (document: ScanDocumentText) => {
      const [{ parseScan }, { buildScanContext }] = await Promise.all([
        import('./scanParser'),
        import('./scanInference'),
      ])
      const context = buildScanContext(transactions, currency, new Date())
      const result = parseScan(document, context)
      dispatch({ type: 'capture/parsed', result, document })
    },
    [transactions, currency]
  )

  // Append one captured page and re-parse the growing document, so a multi-page
  // statement keeps every page instead of dropping all but the first (spec 023
  // B3). Re-parsing is deterministic and replaces the candidate list from the
  // full set; it runs while the native camera is still up (Done dismisses it),
  // so it never disrupts a review already in progress.
  const accumulatePage = useCallback(
    async (page: ScanDocumentTextPage) => {
      pagesRef.current = [...pagesRef.current, page]
      await processDocument({ pages: pagesRef.current })
    },
    [processDocument]
  )

  const startNativeCameraCapture = useCallback(async () => {
    dispatch({ type: 'capture/start', source: 'camera' })
    pagesRef.current = []
    removePageListener() // drop any listener left over from a prior session
    try {
      const { ScanPlugin } = await import('./scanPlugin')
      // Subscribe BEFORE capture() so a fast second shot can't slip through.
      // capture() resolves with the first page; every subsequent photo arrives
      // via pageCaptured until the user taps Done (which dismisses the camera
      // natively — the session's implicit end).
      pageListenerRef.current = await ScanPlugin.onPageCaptured(({ page }) => {
        void accumulatePage(page)
      })
      const { page } = await ScanPlugin.capture()
      await accumulatePage(page)
    } catch (err) {
      // Cancellation or an unavailable camera — the calm failure phase, not
      // a thrown error (the trigger UI stays usable; Retake tries again). A
      // genuine failure is logged (never the same silent swallow as before).
      removePageListener()
      reportScanError('camera capture', err)
      dispatch({ type: 'capture/parsed', result: { kind: 'none' }, document: null })
    }
  }, [accumulatePage, removePageListener])

  const startCameraCapture = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      // The browser has no on-device OCR (VisionKit is iOS-only), so a photo
      // can't become parseable text here. Surface that honestly rather than
      // opening a camera that dead-ends — the PDF import path still works, and
      // adding heavy in-browser OCR is a deliberate future decision (see PR).
      dispatch({ type: 'capture/unsupported' })
      return
    }
    await startNativeCameraCapture()
  }, [startNativeCameraCapture])

  const startWebPdfImport = useCallback(async () => {
    // pickFile() must .click() the <input> inside the originating user gesture,
    // so it runs synchronously here BEFORE any await.
    const file = await pickFile('application/pdf')
    if (!file) {
      // User dismissed the file dialog — back to idle, not a failure (no
      // capture actually happened), matching the native picker-cancel branch.
      dispatch({ type: 'reset' })
      return
    }
    dispatch({ type: 'capture/start', source: 'file' })
    try {
      const { extractPdfToDocument } = await import('./webPdf')
      const document = await extractPdfToDocument(file)
      await processDocument(document)
    } catch (err) {
      reportScanError('web PDF import', err)
      dispatch({ type: 'capture/parsed', result: { kind: 'none' }, document: null })
    }
  }, [processDocument])

  const startNativeFileImport = useCallback(async () => {
    dispatch({ type: 'capture/start', source: 'file' })
    try {
      const [{ FilePicker }, { ScanPlugin }] = await Promise.all([
        import('@capawesome/capacitor-file-picker'),
        import('./scanPlugin'),
      ])
      const picked = await FilePicker.pickFiles({ types: ['application/pdf'] })
      const file = picked.files[0]
      if (!file?.path) {
        // User cancelled the picker — back to idle, not a failure state (no
        // capture actually happened).
        dispatch({ type: 'reset' })
        return
      }
      const fileUri = file.path.startsWith('file://') ? file.path : `file://${file.path}`
      const { pages } = await ScanPlugin.extractPDF({ fileUri })
      await processDocument({ pages })
    } catch (err) {
      reportScanError('PDF import', err)
      dispatch({ type: 'capture/parsed', result: { kind: 'none' }, document: null })
    }
  }, [processDocument])

  const startFileImport = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      await startWebPdfImport()
      return
    }
    await startNativeFileImport()
  }, [startWebPdfImport, startNativeFileImport])

  return { state, dispatch, startCameraCapture, startFileImport }
}
