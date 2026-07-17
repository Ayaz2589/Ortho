'use client'

import { useApp } from '@/lib/store'
import { Drawer, DrawerHeader } from '@/components/web/Drawer'
import type { PropertyKind } from '@/lib/types'
import { PropertyKindChoices } from './PropertyKindChoices'

export function PropertyTypePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (kind: PropertyKind) => void
}) {
  const { t } = useApp()
  return (
    <Drawer open={open} onClose={onClose} label={t('New property')}>
      <DrawerHeader title={t('New property')} onClose={onClose} />
      <div className="overflow-auto p-4 pb-6">
        <PropertyKindChoices onPick={onPick} />
      </div>
    </Drawer>
  )
}
