'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, ArrowUpDown, House, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/transactions', label: 'Transactions', icon: ArrowUpDown },
  { href: '/housing', label: 'Housing', icon: House },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function TabBar() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center border-t border-hairline backdrop-blur-xl sm:hidden"
      style={{ background: 'color-mix(in srgb, var(--surface) 85%, transparent)' }}
    >
      <div className="flex w-full max-w-lg items-stretch justify-around">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + '/')
          const Icon = t.icon
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors',
                active ? 'text-text' : 'text-text-3'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-medium">{t.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
