'use client'

import { useState } from 'react'
import { useApp } from '@/lib/store'
import type { Property, PropertyKind } from '@/lib/types'
import { FormPageHeader } from '@/components/web/FormPageHeader'
import { PropertyForm } from './PropertyForm'
import { PropertyKindChoices } from './PropertyKindChoices'

/**
 * New/Edit property as a full mobile PAGE (spec 025). Renders the SAME shared
 * <PropertyForm> body the desktop Drawer uses, wrapped in page chrome. A new
 * property with no preset kind shows the kind-choice step first (the desktop
 * PropertyTypePicker's equivalent); editing jumps straight to the form for the
 * property's kind. `onDone` is the page's navigation back to the list.
 */
export function PropertyFormPageClient({
  kind: initialKind,
  editing,
  onDone,
}: {
  kind: PropertyKind | null
  editing?: Property | null
  onDone: () => void
}) {
  const { t } = useApp()
  const [kind, setKind] = useState<PropertyKind | null>(editing?.kind ?? initialKind ?? null)

  // New property, no kind chosen yet → the in-page kind picker.
  if (!kind) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[640px] flex-col">
        <FormPageHeader title={t('New property')} cancelLabel={t('Cancel')} onCancel={onDone} />
        <div className="flex-1 px-4 pb-10 pt-2">
          <PropertyKindChoices onPick={setKind} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[640px] flex-col">
      <PropertyForm
        open
        kind={kind}
        editing={editing}
        onDone={onDone}
        header={({ navTitle, isEditing, canSubmit, submit }) => (
          <FormPageHeader
            title={navTitle}
            cancelLabel={t('Cancel')}
            saveLabel={isEditing ? t('Save') : t('Add')}
            canSave={canSubmit}
            onCancel={onDone}
            onSave={submit}
          />
        )}
      />
    </div>
  )
}
