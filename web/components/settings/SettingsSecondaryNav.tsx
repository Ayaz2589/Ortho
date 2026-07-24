'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'

const SECTIONS = [
  { id: 'settings-household', label: 'Household' },
  { id: 'settings-planning', label: 'Planning' },
  { id: 'settings-cards', label: 'Cards' },
  { id: 'settings-subscription', label: 'Subscription' },
  { id: 'settings-currency', label: 'Currency' },
  { id: 'settings-language', label: 'Language' },
  { id: 'settings-appearance', label: 'Appearance' },
  { id: 'settings-account', label: 'Account' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

export function SettingsSecondaryNav() {
  const { t } = useApp()
  const [active, setActive] = useState<SectionId>('settings-household')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entering = entries.filter((e) => e.isIntersecting)
        if (entering.length === 0) return
        // Among newly-intersecting sections, activate the topmost in DOM order
        const next = SECTIONS.find(({ id }) => entering.some((e) => e.target.id === id))
        if (next) setActive(next.id)
      },
      // Detection zone: 15%–65% from the top of the viewport — broad enough to
      // catch the section the user is actually reading.
      { rootMargin: '-15% 0px -35% 0px' },
    )

    for (const { id } of SECTIONS) {
      const el = document.getElementById(id)
      if (el) observerRef.current.observe(el)
    }

    return () => observerRef.current?.disconnect()
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav aria-label={t('Settings sections')} className="hidden lg:block lg:w-[168px] lg:shrink-0">
      <div className="sticky top-6 flex flex-col gap-0.5">
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollTo(id)}
            className={cn('ow-nav-item w-full', active === id && 'is-active')}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </nav>
  )
}
