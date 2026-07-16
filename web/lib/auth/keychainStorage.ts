/**
 * spec 021 — Keychain-backed Supabase session storage for the Capacitor iOS
 * build (contracts/session-storage-adapter.md). Satisfies supabase-js's
 * `auth.storage` contract by delegating to `@aparajita/capacitor-secure-storage`,
 * which already implements the same getItem/setItem/removeItem shape.
 *
 * `SecureStorage`'s calls can throw a `StorageError` on an OS-level failure;
 * this adapter swallows those rather than letting them escape into
 * supabase-js's auth internals, which aren't designed to handle a rejected
 * storage call gracefully. A failed read degrades to "no session" (the same
 * outcome as a fresh install); a failed write degrades to "this session
 * won't survive relaunch" — both are more recoverable than a thrown error
 * surfacing mid-auth-flow.
 *
 * Accessibility class: `whenUnlockedThisDeviceOnly` so a fresh install always
 * starts a fresh session (no silent credential survival across delete +
 * reinstall) — consistent with how "delete and reinstall" is expected to
 * behave, and avoids a stale-looking signed-in state after reinstalling the
 * frozen native app as a rollback (FR-021).
 */
import { SecureStorage, KeychainAccess } from '@aparajita/capacitor-secure-storage'

export const keychainStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStorage.getItem(key)
    } catch {
      return null
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // The accessibility class only matters at write time (it governs new
    // items); setting it on every write is cheap and needs no cross-call
    // memoization.
    try {
      await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly)
      await SecureStorage.setItem(key, value)
    } catch {
      // Best-effort persistence — see file header.
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStorage.removeItem(key)
    } catch {
      // Best-effort — see file header.
    }
  },
}
