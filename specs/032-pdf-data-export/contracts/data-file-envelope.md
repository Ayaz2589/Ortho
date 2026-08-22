# Contract: Data File Envelope & Section Registry

Governs the machine-readable payload embedded in the exported PDF and the extensibility seam.

## Constants

- `SUPPORTED_FORMAT_VERSION = 1`
- Attachment name = `ortho-export.json`, mime = `application/json`.
- App marker: `app.name === 'ortho'`.

## Export pipeline (`export.ts`)

```
buildDataFile(store, { language, currency, includeSections }) : Promise<Uint8Array>
```
1. `serialize`: for each registered section whose key ∈ `includeSections`, call `section.serialize(store)` → `records`, wrap as `SectionPayload { key, sectionVersion, records }`.
2. Assemble `ExportEnvelope` (canonical USD cents in records; `display = { language, currency }`; `generatedAt` injected).
3. `renderModel`: for each section, `section.renderModel(records, ctx)` where `ctx` carries `t/locale/currency/rate/formatMoney/resolveUser` (display conversion happens **only here**).
4. `generate.ts`: draw visible pages from the render models with the language's embedded font; then `attach(JSON.stringify(envelope))`; `save()` → bytes.

**Guarantees**
- G1: Section record payloads are byte-identical regardless of `display.currency`/`display.language` (currency conversion never touches records). *(vector-tested)*
- G2: An empty household yields a valid envelope with `records: []` per section and an `emptyLabel` in the render model. *(tested)*
- G3: Adding a new section requires only `register(newSection)` — no edits to `export.ts`, `import.ts`, or existing sections. *(structural; compat-tested)*

## Import read (`readPdf.ts` + `envelope.ts`)

```
readEnvelope(bytes) : Promise<{ ok: true, envelope } | { ok: false, reason }>
```
1. `unpdf.getAttachments()` → locate `ortho-export.json`; absent → `{ ok: false, reason: 'not-ortho-file' }`.
2. `JSON.parse` → `validate(envelope)`:
   - missing/`> SUPPORTED_FORMAT_VERSION` `formatVersion` → `{ ok: false, reason: 'unsupported-version' }`
   - `app.name !== 'ortho'` → `{ ok: false, reason: 'not-ortho-file' }`
   - malformed JSON / decode error → `{ ok: false, reason: 'corrupt' }`

**Guarantees**
- G4: `readEnvelope` performs **no writes** and returns a typed reason on every failure path (FR-013). *(tested)*
- G5: An envelope containing an unknown section `key` still returns `ok: true`; the unknown section is surfaced as `known: false` downstream, never fatal (FR-020). *(vector-tested)*
- G6: An envelope missing a section this build supports imports the present sections and simply omits the missing one (no error). *(vector-tested)*

## Registry (`registry.ts`)

- `register(section: DataSection)` adds to an ordered map keyed by `section.key`; duplicate keys throw at registration (developer error).
- `registeredSections(): DataSection[]` returns insertion order (stable export/summary order).
- v1 registers `transactions` then `housing` at module load.
