// spec 021 — Keychain-backed session storage adapter (contracts/session-storage-adapter.md).
// Satisfies supabase-js's `auth.storage` contract ({getItem,setItem,removeItem}: Promise-returning)
// by delegating to @aparajita/capacitor-secure-storage, which already implements the same
// getItem/setItem/removeItem shape (the vueuse StorageLikeAsync convention) — but its calls can
// throw a StorageError on an OS-level failure, which this adapter must never let escape into
// supabase-js's auth internals.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { getItem, setItem, removeItem, setDefaultKeychainAccess } = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  setDefaultKeychainAccess: vi.fn(() => Promise.resolve()),
}))

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: { getItem, setItem, removeItem, setDefaultKeychainAccess },
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
}))

import { keychainStorageAdapter } from '@/lib/auth/keychainStorage'

describe('keychainStorageAdapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getItem delegates to SecureStorage.getItem', async () => {
    getItem.mockResolvedValue('the-session-json')
    await expect(keychainStorageAdapter.getItem('sb-session')).resolves.toBe('the-session-json')
    expect(getItem).toHaveBeenCalledWith('sb-session')
  })

  it('getItem resolves null (never throws) when SecureStorage.getItem throws', async () => {
    getItem.mockRejectedValue(new Error('osError'))
    await expect(keychainStorageAdapter.getItem('sb-session')).resolves.toBeNull()
  })

  it('setItem delegates to SecureStorage.setItem', async () => {
    setItem.mockResolvedValue(undefined)
    await keychainStorageAdapter.setItem('sb-session', 'the-session-json')
    expect(setItem).toHaveBeenCalledWith('sb-session', 'the-session-json')
  })

  it('setItem never throws when SecureStorage.setItem throws', async () => {
    setItem.mockRejectedValue(new Error('osError'))
    await expect(keychainStorageAdapter.setItem('sb-session', 'x')).resolves.toBeUndefined()
  })

  it('removeItem delegates to SecureStorage.removeItem', async () => {
    removeItem.mockResolvedValue(undefined)
    await keychainStorageAdapter.removeItem('sb-session')
    expect(removeItem).toHaveBeenCalledWith('sb-session')
  })

  it('removeItem never throws when SecureStorage.removeItem throws', async () => {
    removeItem.mockRejectedValue(new Error('osError'))
    await expect(keychainStorageAdapter.removeItem('sb-session')).resolves.toBeUndefined()
  })

  it('sets the keychain accessibility class to ThisDeviceOnly before writing', async () => {
    setItem.mockResolvedValue(undefined)
    await keychainStorageAdapter.setItem('sb-session', 'x')
    expect(setDefaultKeychainAccess).toHaveBeenCalledWith(1)
  })
})
