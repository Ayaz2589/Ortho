# Contract — Bundle Measurement Script

`web/scripts/measure-bundle.ts`, run via `npm run measure:bundle` (Node/`tsx`). Reports built chunk
sizes for before/after comparison. Never shipped in the app bundle.

## CLI

```
npm run measure:bundle -- [--baseline <path>] [--compare <path>] [--json <path>] [--chunks-dir <path>]
```

- (no flags): build report from `web/out/_next/static/chunks` and print the human-readable table.
- `--json <path>`: also write the report as JSON to `<path>` (used to save a baseline).
- `--baseline <path>`: read a previously-saved JSON as the "before".
- `--compare <path>` (or run after `--baseline`): print the diff (initial-load delta + moved chunks).
- `--chunks-dir <path>`: override the default `out/_next/static/chunks` (for tests/fixtures).

Prerequisite: `npm run build` has produced `web/out/` (the script reads built artifacts, it does not
build).

## Input

The directory of built JS chunks (default `web/out/_next/static/chunks`). Each `*.js` file is read for
raw size; gzip size via `zlib.gzipSync`.

## Output — human-readable

A table sorted by raw size (largest first): `file | kind | raw | gzip`, followed by summary lines:
`Initial-load JS (raw / gzip)`, `Total JS (raw)`, and chunk count. On diff: `Initial-load Δ (raw /
gzip)` with sign, and a list of chunks added/removed/grown/shrunk.

## Output — JSON

Matches `data-model.md §3` (`chunks[]`, `initialLoadRawBytes`, `initialLoadGzipBytes`,
`totalRawBytes`; diff adds `initialLoadDeltaBytes`, `movedToAsync`, `perChunkDelta`).

## How "initial-load" is determined (Turbopack refinement)

Turbopack names chunks with opaque **content hashes** (`05-c3ty_6dwfk.js`), so initial-load cannot be
inferred from filenames. Instead, initial-load is derived **from the built HTML**: for each
`out/**/*.html` entry, the set of `<script src="/_next/static/chunks/….js">` it references IS that
route's initial-load chunk set. A route's initial-load size is the summed size of those chunks;
on-demand (`next/dynamic`) chunks are, by definition, NOT referenced by the HTML and load at runtime.
This makes "did `recharts` leave the Dashboard initial load" directly checkable: after the split,
`dashboard.html` no longer references the recharts chunk.

## Pure functions (unit-tested first — D6.1)

- `extractChunkRefs(html) -> string[]` (sorted unique chunk basenames referenced by an HTML entry)
- `formatBytes(n) -> string` (e.g. `"410.2 KB"`)
- `sumSizes(files, sizeMap) -> { rawBytes, gzipBytes }`
- `diffRoutes(before, after) -> RouteDelta[]` (per-route initial-load raw/gzip delta + chunks
  added/removed from initial-load, i.e. `movedToAsync`)

These operate on plain data (no filesystem), so tests feed synthetic HTML strings / size maps —
deterministic and isolated (Constitution VI). The filesystem reads (`readChunkSizes(dir)`,
`readHtmlEntries(outDir)`) are the only impure parts and are exercised via `--out-dir` /
`--chunks-dir` against the real `out/` (or a fixture) if covered.

## Guarantees

- Deterministic given the same `out/` (no clock/network/random).
- Does not modify the build or the app; read-only over `out/`.
- Exit code 0 on success; non-zero only on bad args / missing `out/` (never on a "regression" — size
  budgeting is out of scope).
