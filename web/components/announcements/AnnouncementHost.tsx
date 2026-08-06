'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { Drawer, DrawerHeader } from '@/components/web/Drawer'
import { PrimaryButton } from '@/components/ui'
import { ANNOUNCEMENTS } from './registry'
import { markAnnouncementSeen, nextUnseenAnnouncement } from './announcementsSeen'

/**
 * spec 042 — the reusable "what's new" popup. Mounted once in the app Shell (in
 * place of the old FinancialHealthOnboardingGate). It shows the next unseen +
 * relevant announcement to a signed-in user through the shared Drawer: a right
 * slide-out on desktop, a full-page takeover on mobile. Taking the CTA marks the
 * announcement seen and navigates; any dismiss (close chip / scrim / Escape)
 * marks it seen without navigating. Calm and never-nagging: once handled it does
 * not reappear on this device, and only one shows per load.
 */
export function AnnouncementHost() {
  const { loading, currentUserId, userFinancialProfile, t } = useApp()
  const router = useRouter()
  const pathname = usePathname()
  // Once the user handles an announcement this mount, don't surface another —
  // keeps it to one per app load (FR-002). The localStorage ledger handles
  // persistence across loads.
  const [handled, setHandled] = useState(false)

  const announcement = useMemo(() => {
    if (loading || !currentUserId || handled) return null
    const next = nextUnseenAnnouncement(ANNOUNCEMENTS, { userFinancialProfile })
    // Don't announce a feature whose flow the user is already on — otherwise the
    // popup would open over the very page its CTA links to (e.g. a direct/bookmark
    // navigation to the questionnaire route). Preserves the old gate's path guard.
    if (next && pathname && pathname.startsWith(next.cta.route)) return null
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentUserId, userFinancialProfile, handled, pathname])

  if (!announcement) return null

  const dismiss = () => {
    markAnnouncementSeen(announcement.id)
    setHandled(true)
  }
  const takeCta = () => {
    markAnnouncementSeen(announcement.id)
    setHandled(true)
    router.push(announcement.cta.route)
  }

  return (
    <Drawer open onClose={dismiss} fullBleedOnMobile label={t("What's new")}>
      <DrawerHeader title={t("What's new")} onClose={dismiss} />
      <div className="flex flex-col gap-3 px-5 py-6">
        <h2 className="text-[19px] font-normal tracking-[-0.3px] text-text">
          {t(announcement.titleKey)}
        </h2>
        <p className="text-[15px] leading-relaxed text-text-2">{t(announcement.descriptionKey)}</p>
        <div className="mt-4">
          <PrimaryButton onClick={takeCta}>{t(announcement.cta.labelKey)}</PrimaryButton>
        </div>
      </div>
    </Drawer>
  )
}
