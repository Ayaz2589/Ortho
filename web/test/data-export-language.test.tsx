// @vitest-environment jsdom
//
// Review 2026-08-24, major C2: the "Export language" picker only drove
// number/date locale and font choice — every translated string in the PDF came
// from the app-UI t passed into buildDataFile, so the exported document
// rendered in the app's language regardless of the chosen export language.
// The panel must build the PDF's translate from the SELECTED language.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Translate } from '@/lib/i18n'

const captured: { t?: Translate } = {}
vi.mock('@/lib/dataFile/export', () => ({
  buildDataFile: vi.fn(async (_app: unknown, _opts: unknown, t: Translate) => {
    captured.t = t
    return { bytes: new Uint8Array([1]), filename: 'x.pdf' }
  }),
}))

// The app-UI translate is the identity — if the PDF receives THIS t, the
// export language had no effect.
const appT = (k: string, ...a: Array<string | number>) =>
  a.length ? k.replace(/\{(\d+)\}/g, (m, i) => String(a[Number(i)] ?? m)) : k

vi.mock('@/lib/store', () => ({
  useApp: () => ({
    t: appT,
    language: 'English',
    currency: 'usd',
    rate: () => 1,
    currentHousehold: { id: 'hh1', name: 'Home' },
    currentUserId: 'u1',
    currentPersonId: 'p1',
    people: [],
    transactions: [],
    properties: [],
    rentalPayments: [],
    tags: [],
    resolveUser: (id: string) => ({ id, name: 'X', initial: 'X', color_key: 'sage', created_at: '' }),
  }),
}))

import { DataExportPanel } from '@/components/settings/DataExportPanel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  captured.t = undefined
})

describe('DataExportPanel export language (C2)', () => {
  it('the PDF translate resolves through the SELECTED language catalog', async () => {
    // jsdom lacks the object-URL methods; add them without replacing the class.
    URL.createObjectURL = () => 'blob:test'
    URL.revokeObjectURL = () => {}
    const user = userEvent.setup()
    render(<DataExportPanel />)

    await user.selectOptions(screen.getByLabelText('Export language') as HTMLSelectElement, '日本語')
    await user.click(screen.getByRole('button', { name: /download/i }))

    await waitFor(() => expect(captured.t).toBeDefined())
    // 'Transactions' exists in the ja catalog; the app-UI identity t would
    // return it unchanged, which is exactly the bug.
    expect(captured.t!('Transactions')).not.toBe('Transactions')
  })
})
