'use client'

import { useApp } from '@/lib/store'
import { Drawer, DrawerHeader } from '@/components/web/Drawer'
import type { Property, PropertyKind } from '@/lib/types'
import { PropertyForm, propertyFormTitle } from './PropertyForm'

/**
 * New/Edit property as the desktop right-side Drawer. The form body + all its
 * logic live in the shared <PropertyForm> (spec 025) so the mobile page renders
 * the identical fields; this wrapper supplies the Drawer chrome + header. Desktop
 * presentation is unchanged from before the extraction.
 */
export function AddPropertyModal({
  open,
  onClose,
  kind,
  editing,
}: {
  open: boolean
  onClose: () => void
  kind: PropertyKind
  editing?: Property | null
}) {
  const { t } = useApp()
  return (
    <Drawer open={open} onClose={onClose} label={propertyFormTitle(kind, editing, t)}>
      <PropertyForm
        open={open}
        kind={kind}
        editing={editing}
        onDone={onClose}
        header={({ navTitle, isEditing, canSubmit, submit }) => (
          <DrawerHeader
            title={navTitle}
            onClose={onClose}
            right={
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="text-[15px] text-accent disabled:opacity-40"
              >
                {isEditing ? t('Save') : t('Add')}
              </button>
            }
          />
        )}
      />
    </Drawer>
  )
}
