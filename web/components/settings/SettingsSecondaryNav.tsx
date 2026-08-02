'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'

const SECTIONS = [
  { href: '/settings/household', label: 'Household' },
  { href: '/settings/planning', label: 'Planning' },
  { href: '/settings/cards', label: 'Cards' },
  { href: '/settings/subscription', label: 'Subscription' },
  { href: '/settings/currency', label: 'Currency' },
  { href: '/settings/language', label: 'Language' },
  { href: '/settings/appearance', label: 'Appearance' },
  { href: '/settings/widgets', label: 'Widgets' },
  { href: '/settings/data', label: 'Data' },
  { href: '/settings/account', label: 'Account' },
] as const

export function SettingsSecondaryNav() {
  const { t } = useApp()
  const pathname = usePathname()

  return (
    <nav aria-label={t('Settings sections')} className="p-3 pt-4">
      <div className="flex flex-col gap-0.5">
        {SECTIONS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn('ow-nav-item', active && 'is-active')}
            >
              {t(label)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
