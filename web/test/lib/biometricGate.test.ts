// @vitest-environment jsdom
//
// spec 021 — FR-011: gate access behind Face ID/Touch ID where the device
// supports it; never block a device with no biometric enrollment. Also
// re-locks on background and re-authenticates on foreground (spec User
// Story 3 acceptance scenario 1), sharing the same @capacitor/app
// appStateChange signal store.tsx's liveness listener uses.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { checkBiometry, authenticate } = vi.hoisted(() => ({
  checkBiometry: vi.fn(),
  authenticate: vi.fn(),
}))
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: { checkBiometry, authenticate },
}))

const { addListener } = vi.hoisted(() => ({ addListener: vi.fn() }))
vi.mock('@capacitor/app', () => ({ App: { addListener } }))

import { useBiometricGate } from '@/lib/biometricGate'

describe('useBiometricGate', () => {
  let appStateCallback: ((state: { isActive: boolean }) => void) | undefined

  beforeEach(() => {
    checkBiometry.mockReset()
    authenticate.mockReset()
    addListener.mockReset()
    addListener.mockImplementation((_event: string, cb: (s: { isActive: boolean }) => void) => {
      appStateCallback = cb
      return Promise.resolve({ remove: vi.fn() })
    })
  })

  it('never gates a device with no biometric enrollment', async () => {
    checkBiometry.mockResolvedValue({ isAvailable: false })
    const { result } = renderHook(() => useBiometricGate())
    await waitFor(() => expect(result.current.state).toBe('unlocked'))
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('locks then unlocks on a successful authentication when biometry is available', async () => {
    checkBiometry.mockResolvedValue({ isAvailable: true })
    authenticate.mockResolvedValue(undefined)
    const { result } = renderHook(() => useBiometricGate())
    await waitFor(() => expect(result.current.state).toBe('unlocked'))
    expect(authenticate).toHaveBeenCalled()
  })

  it('stays locked when authentication fails or is cancelled', async () => {
    checkBiometry.mockResolvedValue({ isAvailable: true })
    authenticate.mockRejectedValue(new Error('User cancelled'))
    const { result } = renderHook(() => useBiometricGate())
    await waitFor(() => expect(result.current.state).toBe('locked'))
  })

  it('retry() re-attempts authentication', async () => {
    checkBiometry.mockResolvedValue({ isAvailable: true })
    authenticate.mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useBiometricGate())
    await waitFor(() => expect(result.current.state).toBe('locked'))

    await act(async () => {
      await result.current.retry()
    })
    expect(result.current.state).toBe('unlocked')
  })

  it('fails open (unlocked) when checkBiometry itself rejects', async () => {
    checkBiometry.mockRejectedValue(new Error('plugin error'))
    const { result } = renderHook(() => useBiometricGate())
    await waitFor(() => expect(result.current.state).toBe('unlocked'))
  })

  it('re-locks on background and re-authenticates on foreground when biometry is available', async () => {
    checkBiometry.mockResolvedValue({ isAvailable: true })
    authenticate.mockResolvedValue(undefined)
    const { result } = renderHook(() => useBiometricGate())
    await waitFor(() => expect(result.current.state).toBe('unlocked'))
    authenticate.mockClear()

    act(() => appStateCallback?.({ isActive: false }))
    expect(result.current.state).toBe('locked')

    act(() => appStateCallback?.({ isActive: true }))
    await waitFor(() => expect(authenticate).toHaveBeenCalled())
    await waitFor(() => expect(result.current.state).toBe('unlocked'))
  })

  it('never re-locks on background when the device has no biometric enrollment', async () => {
    checkBiometry.mockResolvedValue({ isAvailable: false })
    const { result } = renderHook(() => useBiometricGate())
    await waitFor(() => expect(result.current.state).toBe('unlocked'))

    act(() => appStateCallback?.({ isActive: false }))
    expect(result.current.state).toBe('unlocked')
  })
})
