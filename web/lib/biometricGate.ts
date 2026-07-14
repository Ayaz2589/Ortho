// spec 021 — FR-011: gate access to the signed-in session behind Face ID/
// Touch ID where the device supports it; a device with no biometric
// enrollment is NEVER blocked (checked once via checkBiometry(), not
// assumed). Re-locks on background and re-authenticates on foreground
// (spec User Story 3 acceptance scenario 1), sharing the same
// @capacitor/app appStateChange signal store.tsx's liveness listener uses.
// Any plugin-level failure (checkBiometry() itself rejecting) fails OPEN —
// a broken biometric check must never permanently lock a user out of their
// own data.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { App } from '@capacitor/app'
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'

export type BiometricGateState = 'checking' | 'unlocked' | 'locked'

export function useBiometricGate() {
  const [state, setState] = useState<BiometricGateState>('checking')
  const availableRef = useRef(false)

  const attemptUnlock = useCallback(async () => {
    try {
      await BiometricAuth.authenticate({ reason: 'Unlock Ortho' })
      setState('unlocked')
    } catch {
      // Cancelled, failed, or lockout — stay locked; `retry()` tries again.
      setState('locked')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    BiometricAuth.checkBiometry()
      .then((result) => {
        if (cancelled) return
        availableRef.current = result.isAvailable
        if (!result.isAvailable) {
          setState('unlocked')
          return
        }
        setState('locked')
        void attemptUnlock()
      })
      .catch(() => {
        if (!cancelled) setState('unlocked')
      })
    return () => {
      cancelled = true
    }
  }, [attemptUnlock])

  useEffect(() => {
    let handle: { remove: () => void } | undefined
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!availableRef.current) return // no enrollment — never gate
      if (isActive) {
        void attemptUnlock()
      } else {
        setState('locked')
      }
    }).then((h) => {
      handle = h
    })
    return () => handle?.remove()
  }, [attemptUnlock])

  return { state, retry: attemptUnlock }
}
