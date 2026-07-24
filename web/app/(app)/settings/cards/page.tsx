'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, CardRow, AddRow } from '@/components/settings/rows'
import { AddCardModal } from '@/components/settings/AddCardModal'

export default function CardsPage() {
  const { cards, currentHousehold, deleteCard, t } = useApp()
  const [addingCard, setAddingCard] = useState(false)

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Cards')} />
      <SectionCard>
        {cards.map((c) => (
          <CardRow key={c.id} card={c} onDelete={() => deleteCard(c.id)} />
        ))}
        {/* Disabled until a real household is resolved — adding a card
            without one silently no-ops server-side (mirrors iOS). */}
        <AddRow label={t('Add card')} onClick={() => setAddingCard(true)} disabled={!currentHousehold} />
      </SectionCard>
      <p className="mt-2 px-1 text-[13px] leading-relaxed text-text-3">
        {t('Cards appear in the Paid with menu when you log a new expense. Existing transactions keep their original card name.')}
      </p>
      <AddCardModal open={addingCard} onClose={() => setAddingCard(false)} />
    </ReadingColumn>
  )
}
