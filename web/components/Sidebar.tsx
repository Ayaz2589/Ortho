'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, ArrowUpDown, Compass, House, Settings } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Avatar } from '@/components/ui'
import { cn } from '@/lib/utils'

// Outlined, monochrome icons matching the iOS tab bar's SF Symbols
// (chart.bar, arrow.up.arrow.down, house, gearshape). Selection is shown by
// color via .ow-nav-item, so the glyphs inherit currentColor — same as iOS.
const TABS = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/transactions', label: 'Transactions', icon: ArrowUpDown },
  { href: '/planning', label: 'Planning', icon: Compass },
  { href: '/housing', label: 'Housing', icon: House },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { currentHousehold, householdMembers, signOut, t } = useApp()
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  return (
    <nav
      aria-label={t('Primary')}
      // h-full binds the nav to the shell's (h-dvh) container height — NOT the
      // static h-screen (100vh), which can exceed the dynamic viewport and give the
      // nav its own scroll body inside the shell's overflow-hidden context. The nav
      // fills the non-scrolling shell; only <main> scrolls.
      className="hidden h-full shrink-0 flex-col border-r border-hairline bg-bg sm:flex sm:w-[72px] lg:w-[232px]"
      style={{ padding: '20px 12px 16px' }}
    >
      {/* Wordmark */}
      <div className="flex items-center gap-2.5 sm:justify-center lg:justify-start" style={{ padding: '4px 12px 24px' }}>
        <div
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{ width: 28, height: 28, background: 'var(--text)', color: 'var(--bg)', fontSize: 15, fontWeight: 400 }}
        >
          O
        </div>
        <span className="hidden lg:block" style={{ fontSize: 19, fontWeight: 400, letterSpacing: '-0.4px', color: 'var(--text)' }}>
          Ortho
        </span>
      </div>

      {/* Destinations */}
      <div className="flex flex-col gap-0.5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              title={t(tab.label)}
              aria-current={active ? 'page' : undefined}
              className={cn('ow-nav-item sm:justify-center lg:justify-start', active && 'is-active')}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
              <span className="hidden lg:block">{t(tab.label)}</span>
            </Link>
          )
        })}
      </div>

      {/* Household footer */}
      <div className="mt-auto flex flex-col gap-3 border-t border-hairline" style={{ paddingTop: 14 }}>
        <div className="flex items-center gap-2.5 sm:justify-center lg:justify-start" style={{ padding: '0 12px' }}>
          <div className="flex">
            {householdMembers.slice(0, 2).map((u, i) => (
              <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                <Avatar user={u} size={26} />
              </span>
            ))}
          </div>
          <div className="hidden min-w-0 lg:block">
            <div className="truncate" style={{ fontSize: 13, fontWeight: 400, color: 'var(--text)', letterSpacing: '-0.1px' }}>
              {currentHousehold?.name ?? t('Household')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {householdMembers.length === 1 ? t('1 member') : t('{0} members', householdMembers.length)}
            </div>
          </div>
        </div>
        <button
          className="ow-quiet-link hidden text-left lg:block"
          style={{ padding: '0 12px 4px' }}
          onClick={() => (confirmSignOut ? signOut() : setConfirmSignOut(true))}
          onBlur={() => setConfirmSignOut(false)}
        >
          {confirmSignOut ? t('Click again to sign out') : t('Sign out')}
        </button>
      </div>
    </nav>
  )
}
