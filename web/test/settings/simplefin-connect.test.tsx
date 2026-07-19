// @vitest-environment jsdom
// Spec 028 (US1) — SimpleFIN connect card: paste a setup token → claim → list
// refresh, with calm failures (FR-001/FR-013). Mocks the aggregation client + store.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const aggregation = vi.hoisted(() => ({ claimSimpleFinToken: vi.fn() }))
vi.mock('@/lib/aggregation', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/aggregation')>()
  return { ...real, ...aggregation }
})

const store = vi.hoisted(() => ({ refreshLinkedBanks: vi.fn() }))
vi.mock('@/lib/store', () => ({
  useApp: () => ({
    ...store,
    t: (key: string, ...args: Array<string | number>) =>
      args.length ? key.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : key,
  }),
}))

import { SimpleFinConnect } from '@/components/settings/SimpleFinConnect'

beforeEach(() => {
  store.refreshLinkedBanks.mockResolvedValue(true)
  aggregation.claimSimpleFinToken.mockResolvedValue({
    ok: true,
    value: { institutionId: 'li-9', institutionName: 'Demo Bank', accounts: [] },
  })
})
afterEach(() => vi.clearAllMocks())

describe('SimpleFIN connect card', () => {
  it('shows the read-only, privacy-forward disclosure', () => {
    render(<SimpleFinConnect />)
    expect(screen.getByText(/SimpleFIN Bridge, a bank-connection service/)).toBeInTheDocument()
    expect(screen.getByText(/access is read-only/)).toBeInTheDocument()
  })

  it('disables Connect until a token is entered', () => {
    render(<SimpleFinConnect />)
    const button = screen.getByRole('button', { name: 'Connect with SimpleFIN' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('SimpleFIN setup token'), { target: { value: ' tok ' } })
    expect(button).toBeEnabled()
  })

  it('claims the token, clears the field, refreshes the list, and confirms calmly', async () => {
    render(<SimpleFinConnect />)
    const input = screen.getByLabelText('SimpleFIN setup token') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'setup-token-abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect with SimpleFIN' }))

    await waitFor(() =>
      expect(aggregation.claimSimpleFinToken).toHaveBeenCalledWith('setup-token-abc')
    )
    expect(await screen.findByText('Bank connected.')).toBeInTheDocument()
    expect(store.refreshLinkedBanks).toHaveBeenCalled()
    expect(input.value).toBe('')
    expect(document.querySelector('.text-destructive')).toBeNull()
  })

  it('surfaces a spent/invalid token as one calm line (FR-005/FR-013)', async () => {
    aggregation.claimSimpleFinToken.mockResolvedValue({ ok: false, code: 'claim_failed' })
    render(<SimpleFinConnect />)
    fireEvent.change(screen.getByLabelText('SimpleFIN setup token'), { target: { value: 'used' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect with SimpleFIN' }))
    expect(
      await screen.findByText('That setup token could not be used. Get a fresh one and try again.')
    ).toBeInTheDocument()
    expect(document.querySelector('.text-destructive')).toBeNull()
  })

  it('trims whitespace before claiming', async () => {
    render(<SimpleFinConnect />)
    fireEvent.change(screen.getByLabelText('SimpleFIN setup token'), { target: { value: '  spaced  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect with SimpleFIN' }))
    await waitFor(() => expect(aggregation.claimSimpleFinToken).toHaveBeenCalledWith('spaced'))
  })
})
