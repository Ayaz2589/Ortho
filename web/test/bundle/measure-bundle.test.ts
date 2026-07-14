import { describe, it, expect } from 'vitest'
import {
  extractChunkRefs,
  formatBytes,
  sumSizes,
  diffRoutes,
  type RouteReport,
  type SizeMap,
} from '../../scripts/measure-bundle'

// Pure-function unit tests for the bundle-size measurement tool (spec 022, US4 / T003).
// No filesystem: every case feeds synthetic HTML strings / size maps, so the suite is
// deterministic and isolated (Constitution VI). The impure readChunkSizes()/readHtmlEntries()
// are exercised against the real out/ by `npm run measure:bundle`, not here.

describe('extractChunkRefs', () => {
  it('returns the sorted, unique chunk basenames referenced by an HTML entry', () => {
    const html = `
      <script src="/_next/static/chunks/turbopack-abc.js"></script>
      <script src="/_next/static/chunks/0zcaq48ugw6e7.js" async></script>
      <script src="/_next/static/chunks/06nk--u5-459t.js"></script>
      <script src="/_next/static/chunks/0zcaq48ugw6e7.js"></script>
    `
    expect(extractChunkRefs(html)).toEqual([
      '06nk--u5-459t.js',
      '0zcaq48ugw6e7.js',
      'turbopack-abc.js',
    ])
  })

  it('ignores non-chunk scripts and inline scripts', () => {
    const html = `
      <script src="/_next/static/media/lato.js"></script>
      <script>self.__next_f=[]</script>
      <script src="https://cdn.example.com/thing.js"></script>
      <script src="/_next/static/chunks/keep-me.js"></script>
    `
    expect(extractChunkRefs(html)).toEqual(['keep-me.js'])
  })

  it('reduces a nested chunk path to its basename', () => {
    const html = `<script src="/_next/static/chunks/pages/nested-xyz.js"></script>`
    expect(extractChunkRefs(html)).toEqual(['nested-xyz.js'])
  })

  it('returns an empty array when there are no chunk scripts', () => {
    expect(extractChunkRefs('<html><body>hi</body></html>')).toEqual([])
  })
})

describe('formatBytes', () => {
  it('formats bytes, KB, and MB with one decimal above 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(410 * 1024)).toBe('410.0 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('shows a sign for a signed delta when asked', () => {
    expect(formatBytes(-2048, { signed: true })).toBe('-2.0 KB')
    expect(formatBytes(2048, { signed: true })).toBe('+2.0 KB')
    expect(formatBytes(0, { signed: true })).toBe('+0 B')
  })
})

describe('sumSizes', () => {
  const sizeMap: SizeMap = {
    'a.js': { rawBytes: 100, gzipBytes: 40 },
    'b.js': { rawBytes: 200, gzipBytes: 80 },
    'c.js': { rawBytes: 50, gzipBytes: 20 },
  }

  it('sums raw and gzip sizes of the given files', () => {
    expect(sumSizes(['a.js', 'b.js'], sizeMap)).toEqual({ rawBytes: 300, gzipBytes: 120 })
  })

  it('treats an unknown file as zero (missing from the size map)', () => {
    expect(sumSizes(['a.js', 'missing.js'], sizeMap)).toEqual({ rawBytes: 100, gzipBytes: 40 })
  })

  it('returns zero for an empty list', () => {
    expect(sumSizes([], sizeMap)).toEqual({ rawBytes: 0, gzipBytes: 0 })
  })
})

describe('diffRoutes', () => {
  const before: RouteReport[] = [
    {
      route: '/dashboard',
      chunks: ['app.js', 'recharts.js', 'shared.js'],
      rawBytes: 700,
      gzipBytes: 260,
    },
    { route: '/settings', chunks: ['app.js', 'shared.js'], rawBytes: 300, gzipBytes: 120 },
  ]

  it('reports the per-route initial-load delta and what moved out of initial-load', () => {
    const after: RouteReport[] = [
      // recharts left the Dashboard initial-load (now an on-demand chunk, not in the HTML)
      { route: '/dashboard', chunks: ['app.js', 'shared.js'], rawBytes: 300, gzipBytes: 120 },
      { route: '/settings', chunks: ['app.js', 'shared.js'], rawBytes: 300, gzipBytes: 120 },
    ]
    const deltas = diffRoutes(before, after)
    const dash = deltas.find((d) => d.route === '/dashboard')!
    expect(dash.rawDelta).toBe(-400)
    expect(dash.gzipDelta).toBe(-140)
    expect(dash.removedFromInitial).toEqual(['recharts.js'])
    expect(dash.addedToInitial).toEqual([])

    const settings = deltas.find((d) => d.route === '/settings')!
    expect(settings.rawDelta).toBe(0)
    expect(settings.removedFromInitial).toEqual([])
  })

  it('handles a route that only exists in one side', () => {
    const after: RouteReport[] = [
      { route: '/dashboard', chunks: ['app.js', 'recharts.js', 'shared.js'], rawBytes: 700, gzipBytes: 260 },
      { route: '/new', chunks: ['app.js'], rawBytes: 100, gzipBytes: 40 },
    ]
    const deltas = diffRoutes(before, after)
    const added = deltas.find((d) => d.route === '/new')!
    expect(added.rawDelta).toBe(100)
    expect(added.addedToInitial).toEqual(['app.js'])
    const removed = deltas.find((d) => d.route === '/settings')!
    expect(removed.rawDelta).toBe(-300)
    expect(removed.removedFromInitial).toEqual(['app.js', 'shared.js'])
  })
})
