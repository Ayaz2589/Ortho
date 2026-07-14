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

import { useCallback, useReducer } from 'react'
import { useApp } from '@/lib/store'
import { createScanSessionState, scanSessionReducer } from './scanSession'
import type { ScanDocumentText } from './scanModels'

// The scan pipeline is deferred (spec 022, US2): the heavy parser/heuristics/inference
// graph, the native Scan plugin, and the file picker are dynamically imported inside the
// capture callbacks so they load only when the user actually initiates a scan — not on
// Transactions-route load. Only the lightweight session reducer stays eager (it is needed
// to render). Vitest mocks (test/scan/useScanFlow.test.tsx) apply to these dynamic imports
// by resolved path, so behavior is unchanged.

export function useScanFlow() {
  const { transactions, currency } = useApp()
  const [state, dispatch] = useReducer(scanSessionReducer, undefined, createScanSessionState)

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

  const startCameraCapture = useCallback(async () => {
    dispatch({ type: 'capture/start', source: 'camera' })
    try {
      const { ScanPlugin } = await import('./scanPlugin')
      const { page } = await ScanPlugin.capture()
      await processDocument({ pages: [page] })
    } catch {
      // Cancellation or an unavailable camera — the calm failure phase, not
      // a thrown error (the trigger UI stays usable; Retake tries again).
      dispatch({ type: 'capture/parsed', result: { kind: 'none' }, document: null })
    }
  }, [processDocument])

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
