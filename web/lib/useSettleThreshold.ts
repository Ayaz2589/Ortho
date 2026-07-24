import { useState } from 'react'

const DEFAULT_THRESHOLD_CENTS = 10000 // $100

function storageKey(householdId: string) {
  return `ortho:settle_threshold:${householdId}`
}

export function useSettleThreshold(householdId: string): [number, (cents: number) => void] {
  const [threshold, setThresholdState] = useState<number>(() => {
    if (typeof window === 'undefined' || !householdId) return DEFAULT_THRESHOLD_CENTS
    const stored = localStorage.getItem(storageKey(householdId))
    return stored ? Number(stored) : DEFAULT_THRESHOLD_CENTS
  })

  function setThreshold(cents: number) {
    if (typeof window !== 'undefined' && householdId) {
      localStorage.setItem(storageKey(householdId), String(cents))
    }
    setThresholdState(cents)
  }

  return [threshold, setThreshold]
}
