import { House, Building2, KeyRound, type LucideIcon } from 'lucide-react'
import type { PropertyKind } from '@/lib/types'

export interface PropertyKindMeta {
  /** Title used in the type picker. */
  displayName: string
  /** Short label used under the Housing title / as a subtitle. */
  shortLabel: string
  /** One-line description shown in the type picker. */
  subtitle: string
  icon: LucideIcon
  hasMortgage: boolean
}

export const PROPERTY_KINDS: PropertyKind[] = ['primary_home', 'multifamily', 'rental']

export const KIND_META: Record<PropertyKind, PropertyKindMeta> = {
  primary_home: {
    displayName: 'Primary home',
    shortLabel: 'Primary home',
    subtitle: 'You own where you live',
    icon: House,
    hasMortgage: true,
  },
  multifamily: {
    displayName: 'Multifamily property',
    shortLabel: 'Multifamily',
    subtitle: 'Rental units you own',
    icon: Building2,
    hasMortgage: true,
  },
  rental: {
    displayName: 'Rental',
    shortLabel: 'Rental',
    subtitle: 'You rent your home',
    icon: KeyRound,
    hasMortgage: false,
  },
}

export function kindMeta(kind: PropertyKind): PropertyKindMeta {
  return KIND_META[kind]
}

/** Title shown for a property — nickname falls back to address. */
export function propertyTitle(p: { nickname: string | null; address: string }): string {
  return p.nickname ?? p.address
}
