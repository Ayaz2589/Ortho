'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'
import { SUBSCRIPTION_ENABLED } from '@/lib/subscriptionGate'

const ALL_SECTIONS = [
  { href: '/settings/household', label: 'Household' },
  { href: '/settings/cards', label: 'Cards' },
  // review 2026-08-24, C1: the mobile hub linked here but the desktop nav did
  // not — with /settings redirecting straight to household on desktop, the
  // page (and the income form's only add-account path) was unreachable there.
  { href: '/settings/deposit-accounts', label: 'Deposit Accounts' },
  { href: '/routines', label: 'Routines' },
  { href: '/settings/location', label: 'Location' },
  { href: '/settings/financial-profile', label: 'Financial profile' },
  { href: '/settings/subscription', label: 'Subscription' },
  { href: '/settings/currency', label: 'Currency' },
  { href: '/settings/language', label: 'Language' },
  { href: '/settings/appearance', label: 'Appearance' },
  { href: '/settings/text-size', label: 'Text size' },
  { href: '/settings/widgets', label: 'Widgets' },
  { href: '/settings/data', label: 'Data' },
  { href: '/settings/account', label: 'Account' },
] as const

// Subscription is dropped while the system is disabled, so the desktop nav and the mobile
// settings list agree on which sections exist.
const SECTIONS = ALL_SECTIONS.filter(
  (s) => SUBSCRIPTION_ENABLED || s.href !== '/settings/subscription'
)

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
