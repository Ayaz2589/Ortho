// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WidgetPanel, usePanelCaption } from '@/components/widgets/WidgetPanel'

// Spec 057, US1 / FR-013, FR-014, D5: the scope caption states which period and
// which subject a panel's figures describe. A panel that ignores an axis MUST
// omit that half rather than state something untrue — never both, subject-only,
// period-only, or neither, depending on what the panel actually honours.

vi.mock('@/lib/store', () => ({
  useApp: () => ({ t: (k: string) => k }),
}))

afterEach(cleanup)

function CaptionPanel({ subject, period }: { subject?: string; period?: string }) {
  usePanelCaption({ subject, period })
  return <div>content</div>
}

describe('WidgetPanel scope caption', () => {
  it('states both subject and period when the panel honours both axes', () => {
    render(
      <WidgetPanel open title="Budgets" onClose={() => {}}>
        <CaptionPanel subject="Household" period="June 2026" />
      </WidgetPanel>
    )
    expect(screen.getByText('Household · June 2026')).toBeTruthy()
  })

  it('states only the subject when the panel ignores the time axis', () => {
    render(
      <WidgetPanel open title="Recent activity" onClose={() => {}}>
        <CaptionPanel subject="Alice" />
      </WidgetPanel>
    )
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText(/·/)).toBeNull()
  })

  it('states only the period when the panel ignores the people axis', () => {
    render(
      <WidgetPanel open title="Some widget" onClose={() => {}}>
        <CaptionPanel period="June 2026" />
      </WidgetPanel>
    )
    expect(screen.getByText('June 2026')).toBeTruthy()
  })

  it('renders no caption at all when the panel honours neither axis', () => {
    render(
      <WidgetPanel open title="Home equity" onClose={() => {}}>
        <CaptionPanel />
      </WidgetPanel>
    )
    expect(screen.queryByTestId('panel-caption')).toBeNull()
  })
})
