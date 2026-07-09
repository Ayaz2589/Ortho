# Contract: Scan Capacitor Plugin (JS ↔ Swift)

The one custom native surface this feature introduces. Consumed exclusively by
`web/lib/scan/` and `web/components/scan/` (never called directly from a generic screen).
See `data-model.md` for the `ScanDocumentText`/`ParsedCandidate` shapes referenced below and
`research.md` Decision 5 for the rationale behind each choice here.

## Plugin identity

- Capacitor plugin name: `Scan`
- Swift implementation: `web/ios/App/App/Plugins/Scan/ScanPlugin.swift`, a
  `@CapacitorPlugin(name: "Scan", permissions: [.init(alias: "camera", strings: ["NSCameraUsageDescription"])])`
  subclass of `CAPPlugin`.
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
degrade behavior (FR-010). 2s internal timeout, ported from `ScanRefiner.swift`.

### `rescue(opts: { page: ScanDocumentTextPage }): Promise<ParsedCandidateGuess | null>`

**Optional, iOS 26+ only**, same availability-gating and null-on-unavailable contract as
`refineMerchant`. Last-chance tier called only when the deterministic TS parser returns
`{kind: 'none'}` on non-empty OCR text. 5s internal timeout. Every field on the returned
`ParsedCandidateGuess` is marked as a guess (`GuessedField`) — the plugin never claims high
confidence for model output.

### `checkPermissions(): Promise<{ camera: PermissionState }>` / `requestPermissions(): Promise<{ camera: PermissionState }>`

Standard Capacitor permission-plugin pattern (`PermissionState = 'granted' | 'denied' | 'prompt'`).

## Events

### `notifyListeners('pageCaptured', data: CaptureResult)`

Fired once per photo during a multi-photo statement-capture session (the user photographing several
statement pages in sequence). Chosen over `call.keepAlive` streaming because a scan session is N
discrete captures, not a continuous single-subscription stream.

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
