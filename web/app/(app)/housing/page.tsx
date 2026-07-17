'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { House, Plus, ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, IconButton, EmptyState } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { kindMeta, propertyTitle } from '@/components/housing/kinds'
import { PropertyContent } from '@/components/housing/PropertyContent'
import { PropertyCard } from '@/components/housing/PropertyCard'

// Deferred so a mobile/iOS session never downloads the desktop composition
// (spec 022, US3). The synchronous useIsExpanded() gate still selects the branch
// before paint (no wrong-layout flash); the desktop chunk loads only when expanded.
const HousingDesktop = dynamic(
  () => import('@/components/web/HousingDesktop').then((m) => m.HousingDesktop),
  { ssr: false, loading: () => null }
)

export default function HousingPage() {
  const { properties, currentHousehold, t } = useApp()
  const isExpanded = useIsExpanded()
  const router = useRouter()

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const lonely = properties.length === 1 ? properties[0] : null
  const selected = selectedId ? properties.find((p) => p.id === selectedId) ?? null : null

  // This is the MOBILE tree (desktop early-returns <HousingDesktop/> below), so
  // new/edit navigate to their dedicated pages instead of opening the in-place
  // Drawer (spec 025). The new-property page owns the kind-selection step.
  const openNew = () => router.push('/housing/new')
  const openEdit = (id: string) => router.push(`/housing/edit?id=${encodeURIComponent(id)}`)

  // Desktop (≥1024px): the two-column composition.
  if (isExpanded) return <HousingDesktop />

  // Mobile / medium full-page detail.
  if (selected) {
    return (
      <>
        <div className="mb-4 flex items-start gap-3 pt-2">
          <IconButton onClick={() => setSelectedId(null)} ariaLabel={t('Back')}>
            <ChevronLeft size={18} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[28px] font-light tracking-[-0.6px] text-text">
              {propertyTitle(selected)}
            </h1>
            {/* Kind-based subtitle, matching iOS PropertyDetailView. */}
            <p className="text-[13px] text-text-2">
              {selected.kind === 'primary_home'
                ? t('Mortgage · Primary home')
                : selected.kind === 'multifamily'
                  ? t('Mortgage · Multifamily')
                  : t('Rental')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEdit(selected.id)}
            className="pt-2 text-[15px] font-normal text-accent"
          >
            {t('Edit')}
          </button>
        </div>
        <PropertyContent property={selected} />
      </>
    )
  }

  const headerRight = (
    <>
      {lonely && (
        <button
          type="button"
          onClick={() => openEdit(lonely.id)}
          className="text-[15px] font-normal text-accent"
        >
          {t('Edit')}
        </button>
      )}
      {/* Disabled until a real household is resolved (mirrors iOS). */}
      <IconButton onClick={openNew} ariaLabel={t('Add property')} disabled={!currentHousehold}>
        <Plus size={18} />
      </IconButton>
    </>
  )

  return (
    <div className="mx-auto w-full max-w-[640px]">
      {properties.length === 0 && (
        <>
          <PageHeader title={t('Housing')} right={headerRight} />
          <EmptyState
            icon={<House size={40} strokeWidth={1.5} />}
            title={t('No properties yet')}
            body={t('Add a primary home, a rental, or a multifamily property to track payments, balances, and lease info.')}
            action={
              <button
                type="button"
                onClick={openNew}
                disabled={!currentHousehold}
                className="mt-1 rounded-full px-5 py-2.5 text-[15px] font-normal text-accent disabled:opacity-40"
                style={{ background: 'var(--chip-bg)' }}
              >
                {t('Add property')}
              </button>
            }
          />
        </>
      )}

      {lonely && (
        <ReadingColumn>
          <PageHeader
            title={t('Housing')}
            right={headerRight}
            subtitle={`${lonely.address} · ${t(kindMeta(lonely.kind).shortLabel)}`}
          />
          <PropertyContent property={lonely} />
        </ReadingColumn>
      )}

      {properties.length >= 2 && (
        <>
          <PageHeader title={t('Housing')} right={headerRight} />
          <div className="flex flex-col gap-3">
            {properties.map((p) => (
              <PropertyCard key={p.id} property={p} onClick={() => setSelectedId(p.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
