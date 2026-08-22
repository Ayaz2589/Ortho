'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { SUBSCRIPTION_ENABLED } from '@/lib/subscriptionGate'
import { ReadingColumn } from '@/components/layout'
import { SubscriptionSection } from '@/components/settings/SubscriptionSection'

export default function SubscriptionPage() {
  const { t } = useApp()
  const router = useRouter()

  // The route stays mounted (deleting it would break a bookmark with a 404), but while
  // subscriptions are disabled `SubscriptionSection` renders nothing, which would leave a
  // page containing only a back link. Send them to Settings instead.
  useEffect(() => {
    if (!SUBSCRIPTION_ENABLED) router.replace('/settings')
  }, [router])

  if (!SUBSCRIPTION_ENABLED) return null

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <SubscriptionSection />
    </ReadingColumn>
  )
}
