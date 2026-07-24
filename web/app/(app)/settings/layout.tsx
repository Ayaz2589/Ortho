'use client'

import { type ReactNode, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SettingsSecondaryNav } from '@/components/settings/SettingsSecondaryNav'

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // On desktop, /settings root has nothing to show in the detail panel —
  // redirect to the first section so the right panel is never empty.
  useEffect(() => {
    if (pathname === '/settings' && window.innerWidth >= 1024) {
      router.replace('/settings/household')
    }
  }, [pathname, router])

  return (
    // Desktop: fixed left nav + scrollable right detail panel, side by side.
    // Mobile: just the children (nav hidden; page.tsx acts as the section list).
    <div className="flex min-h-full">
      <div className="hidden lg:block lg:w-[200px] lg:shrink-0 lg:border-r lg:border-hairline">
        <SettingsSecondaryNav />
      </div>
      <div className="min-w-0 flex-1 lg:pl-8">
        {children}
      </div>
    </div>
  )
}
