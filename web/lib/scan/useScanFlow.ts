// Orchestration hook (spec 021, T053): capture -> parse -> the scanSession
// reducer. Scoped to two capture sources for this pass:
//   - camera: the custom Scan plugin's capture() (live-OCR-gated shutter,
//     OCR already ran natively by the time it resolves)
//   - file: @capawesome/capacitor-file-picker's pickFiles() (PDF statements)
//     + the Scan plugin's extractPDF()
// Photo-library picking is NOT wired here — the plugin contract has no
// extractImage() method for an arbitrary already-picked photo (only capture()
// does live OCR); see contracts/scan-plugin-api.md. A documented follow-up,
// not a silent gap.
'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { PluginListenerHandle } from '@capacitor/core'
import { useApp } from '@/lib/store'
import { createScanSessionState, scanSessionReducer } from './scanSession'
import type { ScanDocumentText, ScanDocumentTextPage } from './scanModels'

// The scan pipeline is deferred (spec 022, US2): the heavy parser/heuristics/inference
// graph, the native Scan plugin, and the file picker are dynamically imported inside the
// capture callbacks so they load only when the user actually initiates a scan — not on
// Transactions-route load. Only the lightweight session reducer stays eager (it is needed
// to render). Vitest mocks (test/scan/useScanFlow.test.tsx) apply to these dynamic imports
// by resolved path, so behavior is unchanged.

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

  const startCameraCapture = useCallback(async () => {
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
    } catch {
      // Cancellation or an unavailable camera — the calm failure phase, not
      // a thrown error (the trigger UI stays usable; Retake tries again).
      removePageListener()
      dispatch({ type: 'capture/parsed', result: { kind: 'none' }, document: null })
    }
  }, [accumulatePage, removePageListener])

  const startFileImport = useCallback(async () => {
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
    } catch {
      dispatch({ type: 'capture/parsed', result: { kind: 'none' }, document: null })
    }
  }, [processDocument])

  return { state, dispatch, startCameraCapture, startFileImport }
}
