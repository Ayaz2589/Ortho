/**
 * measure-bundle.ts — bundle-size measurement for spec 022 (US4 / T004).
 *
 * Reports the initial-load JavaScript of each built route and supports a
 * before/after diff, so every code-split in this feature is proven with a real
 * number rather than assumed (FR-012, SC-006).
 *
 * WHY HTML-derived initial-load: Turbopack names chunks with opaque content
 * hashes (e.g. `05-c3ty_6dwfk.js`), so "initial-load" cannot be inferred from a
 * filename. Instead, for each `out/<route>.html` we read the `<script
 * src=/_next/static/chunks/*.js>` tags it references — that IS the route's
 * initial-load set. Chunks loaded on demand by `next/dynamic` are, by
 * definition, not referenced by the HTML, so a successful split shows up as a
 * chunk *leaving* a route's initial-load set. See
 * specs/022-web-bundle-optimization/contracts/bundle-measurement.md.
 *
 * This is dev/ops tooling — it is never imported by the app bundle. Run:
 *   npm run measure:bundle -- [--json <path>] [--baseline <path>] [--out-dir <dir>]
 * Prereq: `npm run build` has produced web/out/.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, basename, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkSize {
  rawBytes: number
  gzipBytes: number
}

/** basename → size */
export type SizeMap = Record<string, ChunkSize>

export interface RouteReport {
  route: string
  chunks: string[]
  rawBytes: number
  gzipBytes: number
}

export interface Report {
  routes: RouteReport[]
  /** union of every route's initial-load chunks (unique) */
  initialLoadUnionRawBytes: number
  initialLoadUnionGzipBytes: number
  /** every chunk on disk (whether or not referenced by an HTML entry) */
  totalRawBytes: number
  chunkCount: number
}

export interface RouteDelta {
  route: string
  rawDelta: number
  gzipDelta: number
  addedToInitial: string[]
  removedFromInitial: string[]
}

// ---------------------------------------------------------------------------
// Pure functions (unit-tested — T003)
// ---------------------------------------------------------------------------

const CHUNK_REF = /\/_next\/static\/chunks\/([^"']+?\.js)/g

/** Sorted, unique chunk basenames referenced by an HTML entry's <script> tags. */
export function extractChunkRefs(html: string): string[] {
  const names = new Set<string>()
  for (const m of html.matchAll(CHUNK_REF)) names.add(basename(m[1]))
  return [...names].sort()
}

export function formatBytes(n: number, opts: { signed?: boolean } = {}): string {
  const sign = opts.signed ? (n >= 0 ? '+' : '-') : n < 0 ? '-' : ''
  const abs = Math.abs(n)
  let body: string
  if (abs < 1024) body = `${abs} B`
  else if (abs < 1024 * 1024) body = `${(abs / 1024).toFixed(1)} KB`
  else body = `${(abs / 1024 / 1024).toFixed(1)} MB`
  return `${sign}${body}`
}

export function sumSizes(files: string[], sizeMap: SizeMap): ChunkSize {
  return files.reduce<ChunkSize>(
    (acc, f) => {
      const s = sizeMap[f]
      if (s) {
        acc.rawBytes += s.rawBytes
        acc.gzipBytes += s.gzipBytes
      }
      return acc
    },
    { rawBytes: 0, gzipBytes: 0 }
  )
}

export function diffRoutes(before: RouteReport[], after: RouteReport[]): RouteDelta[] {
  const byRoute = (rs: RouteReport[]) => new Map(rs.map((r) => [r.route, r]))
  const b = byRoute(before)
  const a = byRoute(after)
  const routes = [...new Set([...b.keys(), ...a.keys()])].sort()
  return routes.map((route) => {
    const bef = b.get(route)
    const aft = a.get(route)
    const befChunks = new Set(bef?.chunks ?? [])
    const aftChunks = new Set(aft?.chunks ?? [])
    return {
      route,
      rawDelta: (aft?.rawBytes ?? 0) - (bef?.rawBytes ?? 0),
      gzipDelta: (aft?.gzipBytes ?? 0) - (bef?.gzipBytes ?? 0),
      addedToInitial: [...aftChunks].filter((c) => !befChunks.has(c)).sort(),
      removedFromInitial: [...befChunks].filter((c) => !aftChunks.has(c)).sort(),
    }
  })
}

// ---------------------------------------------------------------------------
// Impure I/O
// ---------------------------------------------------------------------------

/** Read every *.js under chunksDir → { basename: {rawBytes, gzipBytes} }. */
export function readChunkSizes(chunksDir: string): SizeMap {
  const map: SizeMap = {}
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.js')) {
        const buf = readFileSync(p)
        map[basename(entry.name)] = { rawBytes: buf.length, gzipBytes: gzipSync(buf).length }
      }
    }
  }
  walk(chunksDir)
  return map
}

/** Read every out/<route>.html → its initial-load chunk basenames. */
export function readHtmlEntries(outDir: string): { route: string; chunks: string[] }[] {
  const entries: { route: string; chunks: string[] }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '_next') continue // asset dir, not a route
        walk(p)
      } else if (entry.name.endsWith('.html')) {
        const rel = relative(outDir, p).replace(/\.html$/, '')
        const route = '/' + (rel === 'index' ? '' : rel)
        entries.push({ route, chunks: extractChunkRefs(readFileSync(p, 'utf8')) })
      }
    }
  }
  walk(outDir)
  return entries
}

export function buildReport(outDir: string): Report {
  const chunksDir = join(outDir, '_next', 'static', 'chunks')
  const sizeMap = readChunkSizes(chunksDir)
  const htmlEntries = readHtmlEntries(outDir)
  const routes: RouteReport[] = htmlEntries
    .map(({ route, chunks }) => {
      const { rawBytes, gzipBytes } = sumSizes(chunks, sizeMap)
      return { route, chunks, rawBytes, gzipBytes }
    })
    .sort((x, y) => y.rawBytes - x.rawBytes)

  const unionChunks = [...new Set(htmlEntries.flatMap((e) => e.chunks))]
  const union = sumSizes(unionChunks, sizeMap)
  const totalRawBytes = Object.values(sizeMap).reduce((n, s) => n + s.rawBytes, 0)

  return {
    routes,
    initialLoadUnionRawBytes: union.rawBytes,
    initialLoadUnionGzipBytes: union.gzipBytes,
    totalRawBytes,
    chunkCount: Object.keys(sizeMap).length,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function printReport(report: Report): void {
  console.log('\nInitial-load JS per route (from built HTML <script> tags):\n')
  console.log('  route                         raw        gzip     chunks')
  console.log('  ' + '-'.repeat(60))
  for (const r of report.routes) {
    console.log(
      '  ' +
        r.route.padEnd(28) +
        formatBytes(r.rawBytes).padStart(10) +
        formatBytes(r.gzipBytes).padStart(11) +
        String(r.chunks.length).padStart(9)
    )
  }
  console.log('  ' + '-'.repeat(60))
  console.log(
    `  Initial-load union: ${formatBytes(report.initialLoadUnionRawBytes)} raw / ` +
      `${formatBytes(report.initialLoadUnionGzipBytes)} gzip`
  )
  console.log(
    `  Total JS on disk:   ${formatBytes(report.totalRawBytes)} raw across ${report.chunkCount} chunks\n`
  )
}

function printDiff(before: Report, after: Report): void {
  console.log('\nBefore/after initial-load per route:\n')
  const deltas = diffRoutes(before.routes, after.routes)
  for (const d of deltas) {
    if (d.rawDelta === 0 && d.addedToInitial.length === 0 && d.removedFromInitial.length === 0) continue
    console.log(`  ${d.route}`)
    console.log(
      `    Δ ${formatBytes(d.rawDelta, { signed: true })} raw / ${formatBytes(d.gzipDelta, { signed: true })} gzip`
    )
    if (d.removedFromInitial.length) console.log(`    left initial-load: ${d.removedFromInitial.join(', ')}`)
    if (d.addedToInitial.length) console.log(`    entered initial-load: ${d.addedToInitial.join(', ')}`)
  }
  const unionDelta = after.initialLoadUnionRawBytes - before.initialLoadUnionRawBytes
  console.log(
    `\n  Union initial-load Δ: ${formatBytes(unionDelta, { signed: true })} raw ` +
      `(${formatBytes(before.initialLoadUnionRawBytes)} → ${formatBytes(after.initialLoadUnionRawBytes)})\n`
  )
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out[key] = next
        i++
      } else out[key] = true
    }
  }
  return out
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const outDir = (args['out-dir'] as string) ?? join(process.cwd(), 'out')
  const report = buildReport(outDir)
  printReport(report)

  if (args.json) {
    writeFileSync(args.json as string, JSON.stringify(report, null, 2) + '\n')
    console.log(`  Wrote JSON report → ${args.json}`)
  }
  const baselinePath = (args.baseline ?? args.compare) as string | undefined
  if (baselinePath) {
    const before = JSON.parse(readFileSync(baselinePath, 'utf8')) as Report
    printDiff(before, report)
  }
}

// Only run the CLI when invoked directly (so tests can import the pure functions).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (err) {
    console.error('measure-bundle failed:', (err as Error).message)
    process.exit(1)
  }
}
