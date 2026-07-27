'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Lets full-screen task surfaces (the new/edit form pages and the read-only
 * transaction detail) hide the mobile bottom tab bar while they're mounted, so a
 * focused flow isn't sharing the screen with primary navigation (and you can't
 * tab away mid-edit and lose the form).
 *
 * A COUNTER, not a boolean: during a route transition the outgoing surface may
 * unmount after the incoming one mounts (or vice-versa), so overlapping
 * hide-requests must not clobber each other — the bar is hidden while any are
 * active. The detail view lives at the /transactions route (it's `detailId`
 * state, not its own URL), so a pathname check can't cover it; this mount-scoped
 * hook can.
 */
const TabBarVisibilityContext = createContext<{
  hidden: boolean
  acquire: () => void
  release: () => void
}>({ hidden: false, acquire: () => {}, release: () => {} })

export function TabBarVisibilityProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0)
  const acquire = useCallback(() => setCount((c) => c + 1), [])
  const release = useCallback(() => setCount((c) => Math.max(0, c - 1)), [])
  return (
    <TabBarVisibilityContext.Provider value={{ hidden: count > 0, acquire, release }}>
      {children}
    </TabBarVisibilityContext.Provider>
  )
}

/** True while any mounted surface has requested the tab bar be hidden. */
export function useTabBarHidden() {
  return useContext(TabBarVisibilityContext).hidden
}

/** Hide the mobile bottom tab bar for as long as the calling component is mounted. */
export function useHideTabBar() {
  const { acquire, release } = useContext(TabBarVisibilityContext)
  useEffect(() => {
    acquire()
    return release
  }, [acquire, release])
}
