'use client'

import { useState } from 'react'
import { House, Plus, ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, IconButton, EmptyState } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { useIsExpanded } from '@/lib/useMediaQuery'
import type { PropertyKind } from '@/lib/types'
import { kindMeta, propertyTitle } from '@/components/housing/kinds'
import { PropertyTypePicker } from '@/components/housing/PropertyTypePicker'
import { AddPropertyModal } from '@/components/housing/AddPropertyModal'
import { PropertyContent } from '@/components/housing/PropertyContent'
import { PropertyCard } from '@/components/housing/PropertyCard'
import { HousingDesktop } from '@/components/web/HousingDesktop'

export default function HousingPage() {
  const { properties } = useApp()
  const isExpanded = useIsExpanded()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [creatingKind, setCreatingKind] = useState<PropertyKind | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const lonely = properties.length === 1 ? properties[0] : null
  const selected = selectedId ? properties.find((p) => p.id === selectedId) ?? null : null
  const editing = editingId ? properties.find((p) => p.id === editingId) ?? null : null

  const openPicker = () => setPickerOpen(true)
  const pick = (kind: PropertyKind) => {
    setPickerOpen(false)
    setCreatingKind(kind)
  }

  // Desktop (≥1024px): the two-column composition.
  if (isExpanded) return <HousingDesktop />

  // Mobile / medium full-page detail.
  if (selected) {
    return (
      <>
        <div className="mb-4 flex items-start gap-3 pt-2">
          <IconButton onClick={() => setSelectedId(null)} ariaLabel="Back">
            <ChevronLeft size={18} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[28px] font-bold tracking-[-0.6px] text-text">
              {propertyTitle(selected)}
            </h1>
            <p className="text-[13px] text-text-2">
              {selected.address} · {kindMeta(selected.kind).shortLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingId(selected.id)}
            className="pt-2 text-[15px] font-semibold text-accent"
          >
            Edit
          </button>
        </div>
        <PropertyContent property={selected} />
        {editing && (
          <AddPropertyModal open={!!editing} onClose={() => setEditingId(null)} kind={editing.kind} editing={editing} />
        )}
      </>
    )
  }

  const headerRight = (
    <>
      {lonely && (
        <button
          type="button"
          onClick={() => setEditingId(lonely.id)}
          className="text-[15px] font-semibold text-accent"
        >
          Edit
        </button>
      )}
      <IconButton onClick={openPicker} ariaLabel="Add property">
        <Plus size={18} />
      </IconButton>
    </>
  )

  return (
    <div className="mx-auto w-full max-w-[640px]">
      {properties.length === 0 && (
        <>
          <PageHeader title="Housing" right={headerRight} />
          <EmptyState
            icon={<House size={40} strokeWidth={1.5} />}
            title="No properties yet"
            body="Add a primary home, a rental, or a multifamily property to track payments, balances, and lease info."
            action={
              <button
                type="button"
                onClick={openPicker}
                className="mt-1 rounded-full px-5 py-2.5 text-[15px] font-semibold text-accent"
                style={{ background: 'rgba(0,0,0,0.05)' }}
              >
                Add property
              </button>
            }
          />
        </>
      )}

      {lonely && (
        <ReadingColumn>
          <PageHeader
            title="Housing"
            right={headerRight}
            subtitle={`${lonely.address} · ${kindMeta(lonely.kind).shortLabel}`}
          />
          <PropertyContent property={lonely} />
        </ReadingColumn>
      )}

      {properties.length >= 2 && (
        <>
          <PageHeader title="Housing" right={headerRight} />
          <div className="flex flex-col gap-3">
            {properties.map((p) => (
              <PropertyCard key={p.id} property={p} onClick={() => setSelectedId(p.id)} />
            ))}
          </div>
        </>
      )}

      <PropertyTypePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pick} />
      {creatingKind && (
        <AddPropertyModal open={!!creatingKind} onClose={() => setCreatingKind(null)} kind={creatingKind} />
      )}
      {editing && !selected && (
        <AddPropertyModal open={!!editing} onClose={() => setEditingId(null)} kind={editing.kind} editing={editing} />
      )}
    </div>
  )
}
