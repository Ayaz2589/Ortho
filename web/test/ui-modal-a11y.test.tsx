// @vitest-environment jsdom
//
// Full-review a11y finding: the shared mobile Modal (AddCardModal,
// TransactionDetailModal) had no dialog semantics and no focus trap, unlike the
// desktop WebModal/Drawer. Tab escaped behind the scrim and screen readers were
// never told a dialog opened. This locks the parity fix.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeSupabaseMock, primeFxCache, stubNoNetwork, type SupabaseMock } from './helpers/supabase-mock'

const h = vi.hoisted(() => ({ mock: null as SupabaseMock | null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => h.mock!.client }))

import { AppStateProvider } from '@/lib/store'
import { Modal } from '@/components/ui'

describe('mobile Modal a11y', () => {
  beforeEach(() => {
    localStorage.clear()
    primeFxCache()
    stubNoNetwork()
    h.mock = makeSupabaseMock({ authUser: null })
  })

  it('exposes dialog semantics and moves focus into the panel on open', () => {
    render(
      <AppStateProvider>
        <Modal open onClose={() => {}} title="Add card">
          <button type="button">Save</button>
        </Modal>
      </AppStateProvider>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Add card')
    // useFocusTrap moved focus inside the panel rather than leaving it on <body>.
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})
