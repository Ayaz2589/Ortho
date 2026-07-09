# Contract: Scan Capacitor Plugin (JS ↔ Swift)

The one custom native surface this feature introduces. Consumed exclusively by
`web/lib/scan/` and `web/components/scan/` (never called directly from a generic screen).
See `data-model.md` for the `ScanDocumentText`/`ParsedCandidate` shapes referenced below and
`research.md` Decision 5 for the rationale behind each choice here.

## Plugin identity

- Capacitor plugin name: `Scan`
- Swift implementation: `web/ios/App/App/Plugins/Scan/ScanPlugin.swift`.
  **Correction (caught during implementation):** this contract originally specified a declarative
  `@CapacitorPlugin(name:, permissions:)` attribute — that syntax is Capacitor's **Android**
  (Kotlin) plugin pattern, confirmed against ionic-team/capacitor-docs and against every real
  first-party iOS plugin shipped in this project's own `node_modules` (`StatusBarPlugin.swift`,
  `AppPlugin.swift`). The actual iOS pattern is `CAPBridgedPlugin` conformance
  (`identifier`/`jsName`/`pluginMethods`) plus overriding `CAPPlugin`'s existing
  `checkPermissions`/`requestPermissions` methods, driven by `NSCameraUsageDescription` in
  `Info.plist` at the OS level — there is no separate alias-to-plist-key mapping on iOS the way
  there is on Android. Same plugin name (`"Scan"`), same camera-permission gating outcome, same
  method surface below; only the declaration syntax differs from what this doc first said.
- TS interface: `web/lib/scan/scanPlugin.ts` (thin typed wrapper around
  `Capacitor.registerPlugin<ScanPlugin>('Scan')`).

## Methods

### `capture(): Promise<CaptureResult>`

Presents the native full-screen camera UI (ported from `ScanCaptureView.swift`) with the existing
live-OCR-gated shutter behavior (arms after 2 consecutive readable frames, 2.5s auto-capture hold).
Resolves once, on a completed capture; rejects if the user cancels or the camera is unavailable.

```ts
interface CaptureResult {
  imageUri: string              // file:// URI — pass through Capacitor.convertFileSrc() before <img src>
  page: ScanDocumentTextPage    // OCR already ran natively during capture — no second round-trip
}
```

**Why OCR happens inside `capture()`, not as a separate call**: avoids a redundant JS→native round
trip; the deskewed image is already in memory natively when OCR completes.

### `extractPDF(opts: { fileUri: string }): Promise<{ pages: ScanDocumentTextPage[] }>`

Extracts text/tables from every page of a PDF at `fileUri` (typically the result of the file-picker
plugin, see plan.md's plugin matrix). Internally branches per page: digital text layer
(`PDFPage.string`) when present, otherwise render-to-image-then-OCR — both branches stay inside this
one native call; JS never needs to know which branch ran.

### `refineMerchant(opts: { merchant: string }): Promise<{ merchant: string; category?: string } | null>`

**Optional, iOS 26+ only.** Gated internally on `SystemLanguageModel.default.availability ==
.available`; resolves `null` immediately (not an error) when unavailable, matching today's silent
degrade behavior (FR-010). 2s internal timeout, ported from `ScanRefiner.swift`. The plugin
unconditionally answers "what does the model make of this text" — the caller (TS) decides whether
refinement is worth requesting at all (e.g. skip when household history already supplied a display
spelling).

**Implementation note:** Capacitor's iOS bridge can only resolve a call with a JSON object
(`call.resolve([String: Any])`) — there is no native `call.resolve(nil)`. The plugin resolves an
empty object for the "unavailable/failed/timed out" case; `scanPlugin.ts` (the TS wrapper) is
responsible for mapping an empty/absent result to the `null` this contract describes.

### `rescue(opts: { page: ScanDocumentTextPage }): Promise<ParsedCandidateGuess | null>`

**Optional, iOS 26+ only**, same availability-gating and null-on-unavailable contract as
`refineMerchant` (including the empty-object-means-null resolution above). Last-chance tier called
only when the deterministic TS parser returns `{kind: 'none'}` on non-empty OCR text. 5s internal
timeout. Every field on the returned `ParsedCandidateGuess` is marked as a guess (`GuessedField`) —
the plugin never claims high confidence for model output.

**`ParsedCandidateGuess` shape** (raw, unvalidated — matches `web/ios/App/App/Plugins/Scan/ScanRefiner.swift`'s `RescueGuess.jsObject` exactly):

```ts
interface ParsedCandidateGuess {
  merchantRaw: string
  date: string       // free-form as the model read it (e.g. "2026-07-08" or "Jul 8"); "" if unknown
  amount: string      // free-form, may include a currency symbol/code (e.g. "$24.51" or "EUR 23,50"); "" if unknown
  direction: 'debit' | 'credit'
}
```

Per research.md Decision 4, the plugin does **not** parse `date`/`amount` into `PartialDate`/cents
or attempt merchant-history/duplicate enrichment — it has no access to that context. The caller
(`web/lib/scan/scanInference.ts` / the eventual scan-flow orchestrator) re-parses `date`/`amount`
through the same `scanHeuristics.ts` primitives every other tier uses, then validates the result
exactly like the forgiving-fallback tier (non-empty amount that parses to a nonzero value).

### `checkPermissions(): Promise<{ camera: PermissionState }>` / `requestPermissions(): Promise<{ camera: PermissionState }>`

Standard Capacitor permission-plugin pattern (`PermissionState = 'granted' | 'denied' | 'prompt'`).

## Events

### `notifyListeners('pageCaptured', data: CaptureResult)`

Fired once per photo during a multi-photo statement-capture session (the user photographing several
statement pages in sequence). Chosen over `call.keepAlive` streaming because a scan session is N
discrete captures, not a continuous single-subscription stream.

**Session lifecycle (clarified during implementation — this contract only sketched the event in one
sentence; the following is the concrete interpretation `ScanPlugin.swift` implements):** the
camera UI opens on `capture()` and stays open across multiple shots. The **first** photo resolves
the original `capture()` promise (per the method signature above) and the on-screen Cancel button
relabels to Done. **Every subsequent** photo in the same session fires `pageCaptured` instead of a
second promise resolution. Tapping Done/Cancel ends the session and dismisses the camera. The
underlying live-OCR-gated shutter (arm/disarm hysteresis) re-arms after each photo. This is a
genuine multi-shot capability the frozen native app never had (it only ever captured one photo per
session; multi-page statements went through the PDF import path instead) — flagged here as a
product/UX decision worth a design pass, not something to treat as settled by this doc alone.

## Error handling

All methods reject with a `{code, message}` shape following standard Capacitor plugin-call error
conventions. `capture()`/`extractPDF()` never reject on "nothing readable found" — that is a valid
`ScanDocumentText` with empty `lines`/`tables`, handled downstream by the TS parser's `.none` tier
and surfaced to the user per spec Edge Cases ("document couldn't be read").

## What this contract deliberately does NOT expose

- No merchant/category/duplicate logic — that's `web/lib/scan/scanParser.ts` and `scanInference.ts`,
  pure TypeScript, tested independently (see `data-model.md`, research.md Decision 4).
- No transaction-write call — an accepted `ParsedCandidate` goes through the existing app-wide
  transaction-add path, unchanged by this feature.
