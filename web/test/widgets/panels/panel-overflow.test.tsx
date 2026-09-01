// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WidgetPanel } from '@/components/widgets/WidgetPanel'
import { PanelRow, ReconciledMonthCard } from '@/components/widgets/panels/kit'
import { CycleStrip } from '@/components/widgets/panels/kit/CycleStrip'
import type { CycleDot } from '@/lib/finance/topMerchants'
import { edgeAnchoredTransform } from '@/lib/ui/edgeAnchor'

// Spec 058 — the reported bug: on a phone, opening a widget's detail panel let
// the panel scroll sideways. Four separate causes lived behind that one
// symptom, and each is pinned here.

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: (k: string, ...a: unknown[]) => k.replace(/\{(\d+)\}/g, (_, i) => String(a[Number(i)] ?? '')),
    formatMoney: (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2)}`,
    locale: 'en-US',
  }),
}))

afterEach(cleanup)

describe('WidgetPanel scroll region', () => {
  // CAUSE 1 — the frame itself. The region set `overflow-y: auto` and left
  // `overflow-x` at its initial `visible`. Per CSS Overflow 3, when one axis is
  // neither `visible` nor `clip`, a `visible` on the other axis computes to
  // `auto` — so the region became horizontally scrollable too, and ANY wide
  // child made the whole panel pan.
  it('does not become horizontally scrollable when it scrolls vertically', () => {
    render(
      <WidgetPanel open title="Spending" onClose={() => {}}>
        <div>content</div>
      </WidgetPanel>
    )
    const region = screen.getByTestId('panel-scroll-region')
    expect(region.style.overflowY).toBe('auto')
    expect(region.style.overflowX).toBe('hidden')
  })
})

describe('PanelRow', () => {
  // CAUSE 2 — a label/value line is a flex row, and flex items default to
  // `min-width: auto`, so they refuse to shrink below their content. A long
  // merchant name ("SQ *BLUE BOTTLE COFFEE — WILLIAMSBURG") therefore widened
  // the panel instead of truncating.
  it('lets a long label truncate instead of widening the row', () => {
    render(<PanelRow label="SQ *BLUE BOTTLE COFFEE WILLIAMSBURG BROOKLYN" value="$12.00" />)
    const label = screen.getByText(/BLUE BOTTLE/)
    expect(label.className).toMatch(/\bmin-w-0\b/)
    expect(label.className).toMatch(/\btruncate\b/)
  })

  it('keeps the value intact while the label gives way', () => {
    render(<PanelRow label="Coffee" value="$12.00" />)
    expect(screen.getByText('$12.00').className).toMatch(/\bshrink-0\b/)
  })

  // The two sides take caller-supplied className overrides. Containment must
  // come from PanelRow itself, or any caller passing its own emphasis classes
  // silently loses it — which is how this regressed in the first place.
  it('applies containment even when the caller overrides the classNames', () => {
    render(
      <PanelRow
        label="A very long merchant name indeed"
        value="$1.00"
        labelClassName="text-text font-semibold"
        valueClassName="tabular-nums text-positive"
      />
    )
    const label = screen.getByText(/very long merchant/)
    expect(label.className).toMatch(/\bmin-w-0\b/)
    expect(label.className).toMatch(/\btruncate\b/)
    expect(screen.getByText('$1.00').className).toMatch(/\bshrink-0\b/)
  })
})

describe('ReconciledMonthCard', () => {
  // CAUSE 3 — three money columns in a fixed `flex` row with an 18px gap. On a
  // 320px phone the three unbreakable currency strings exceed the card, and
  // (again, `min-width: auto`) they would not shrink.
  it('wraps its metric columns instead of overflowing a narrow card', () => {
    render(
      <ReconciledMonthCard
        tag="Best"
        label="June 2026"
        rate={0.32}
        incomeCents={1234567}
        expenseCents={987654}
        savedCents={246913}
      />
    )
    const row = screen.getByTestId('recon-metrics')
    expect(row.className).toMatch(/\bflex-wrap\b/)
    for (const col of screen.getAllByTestId('recon-column')) {
      expect(col.className).toMatch(/\bmin-w-0\b/)
    }
  })
})

describe('CycleStrip', () => {
  // CAUSE 4 — dots and tick labels sat at `left: <pct>%` with a blanket
  // `translateX(-50%)`. The day-1 dot hung half off the left edge and the
  // day-31 dot half off the right, widening the strip past its panel.
  const dot = (key: string, day: number, amountCents: number, landed: boolean): CycleDot => ({
    key,
    merchantKey: key,
    merchantLabel: key.toUpperCase(),
    day,
    amountCents,
    landed,
    stackIndex: 0,
    landedDate: landed ? `2026-08-${String(day).padStart(2, '0')}` : null,
  })
  const dots: CycleDot[] = [dot('a', 1, 1200, true), dot('b', 15, 9900, true), dot('c', 31, 4500, false)]

  it('anchors the first and last dot inside the strip rather than centring them', () => {
    render(<CycleStrip dots={dots} todayDay={null} />)
    const rendered = screen.getAllByTestId('cycle-dot')
    expect(rendered[0].style.transform).toBe(edgeAnchoredTransform(0))
    expect(rendered[2].style.transform).toBe(edgeAnchoredTransform(100))
  })

  it('still centres a dot in the middle of the strip', () => {
    render(<CycleStrip dots={dots} todayDay={null} />)
    // Day 15 of the 1..31 track sits at (15-1)/30 → 46.67%, not 50%.
    expect(screen.getAllByTestId('cycle-dot')[1].style.transform).toBe(edgeAnchoredTransform((14 / 30) * 100))
  })

  it('anchors the day tick labels inside the strip too', () => {
    render(<CycleStrip dots={dots} todayDay={null} />)
    const ticks = screen.getAllByTestId('cycle-tick')
    expect(ticks[0].style.transform).toBe(edgeAnchoredTransform(0))
    expect(ticks[2].style.transform).toBe(edgeAnchoredTransform(100))
  })

  it('anchors the "today" caption, which is nowrap and can be wide', () => {
    render(<CycleStrip dots={dots} todayDay={31} />)
    expect(screen.getByTestId('cycle-today-label').style.transform).toBe(edgeAnchoredTransform(100))
  })
})

describe('CycleStrip today rule', () => {
  // The "today" marker is a 1px vertical rule. Centred at day 31 it still puts
  // half a pixel past the edge — small, but it is the same defect and it
  // compounds with the dot beside it.
  it('anchors the today rule line so it cannot poke past the strip edge', () => {
    render(<CycleStrip dots={[] as CycleDot[]} todayDay={31} />)
    expect(screen.getByTestId('cycle-today-line').style.transform).toBe(edgeAnchoredTransform(100))
  })
})
