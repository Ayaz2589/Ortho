// Typed JS wrapper around the native Scan Capacitor plugin (spec 021).
// Contract: specs/021-capacitor-ios-consolidation/contracts/scan-plugin-api.md
//
// The only file that calls `registerPlugin` for this plugin — every other
// scan module talks to it through this wrapper, never Capacitor.registerPlugin
// directly, so the "empty object means null" bridge quirk (Capacitor's iOS
// side can never resolve a bare JS null) stays contained in one place.

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type {
  ParsedCandidate,
  ScanDocumentTextPage,
} from './scanModels'

export interface CaptureResult {
  imageUri: string
  page: ScanDocumentTextPage
}

export interface RefinedMerchantResult {
  merchant: string
  category?: string
}

/** Raw, unvalidated model guess — see the contract's `ParsedCandidateGuess`.
 *  `date`/`amount` are free-form text; the caller re-parses them through
 *  scanHeuristics.ts, exactly like the forgiving-fallback tier. */
export interface ParsedCandidateGuess {
  merchantRaw: string
  date: string
  amount: string
  direction: ParsedCandidate['direction']
}

export type ScanPermissionState = 'granted' | 'denied' | 'prompt'

interface NativeScanPlugin {
  capture(): Promise<CaptureResult>
  extractPDF(opts: { fileUri: string }): Promise<{ pages: ScanDocumentTextPage[] }>
  refineMerchant(opts: { merchant: string }): Promise<Partial<RefinedMerchantResult>>
  rescue(opts: { page: ScanDocumentTextPage }): Promise<Partial<ParsedCandidateGuess>>
  checkPermissions(): Promise<{ camera: ScanPermissionState }>
  requestPermissions(): Promise<{ camera: ScanPermissionState }>
  addListener(eventName: 'pageCaptured', listener: (data: CaptureResult) => void): Promise<PluginListenerHandle>
}

const native = registerPlugin<NativeScanPlugin>('Scan')

/** Capacitor's iOS bridge can only resolve a call with a JSON object — there
 *  is no native `call.resolve(nil)`. The plugin resolves an empty object for
 *  "unavailable/failed/timed out"; this maps that back to the `null` the
 *  contract describes (detected by the absence of every required field). */
function nullIfEmpty<T extends object>(result: T, requiredKey: keyof T): T | null {
  return result && requiredKey in result ? result : null
}

export const ScanPlugin = {
  capture(): Promise<CaptureResult> {
    return native.capture()
  },

  extractPDF(opts: { fileUri: string }): Promise<{ pages: ScanDocumentTextPage[] }> {
    return native.extractPDF(opts)
  },

  async refineMerchant(opts: { merchant: string }): Promise<RefinedMerchantResult | null> {
    const result = await native.refineMerchant(opts)
    return nullIfEmpty(result, 'merchant') as RefinedMerchantResult | null
  },

  async rescue(opts: { page: ScanDocumentTextPage }): Promise<ParsedCandidateGuess | null> {
    const result = await native.rescue(opts)
    return nullIfEmpty(result, 'merchantRaw') as ParsedCandidateGuess | null
  },

  checkPermissions(): Promise<{ camera: ScanPermissionState }> {
    return native.checkPermissions()
  },

  requestPermissions(): Promise<{ camera: ScanPermissionState }> {
    return native.requestPermissions()
  },

  /** Fires once per photo AFTER the first (which resolves `capture()`
   *  itself) during a multi-photo statement-capture session — see the
   *  contract's "Session lifecycle" note. Returns the Capacitor listener
   *  handle so the caller can `remove()` it when the session ends/unmounts
   *  (spec 023 B3 wires this in `useScanFlow`). */
  onPageCaptured(handler: (data: CaptureResult) => void): Promise<PluginListenerHandle> {
    return native.addListener('pageCaptured', handler)
  },
}
