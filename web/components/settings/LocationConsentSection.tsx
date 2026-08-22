'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { checkGeocodingAvailable, type GeocodingAvailability } from '@/lib/location/geocoding'
import type { LocationConsentLevel } from '@/lib/types'

const TIERS: Array<{ value: LocationConsentLevel; label: string; description: string }> = [
  { value: 'off', label: 'Off', description: 'No location data is collected or used.' },
  {
    value: 'geocoding',
    label: 'Geocoding',
    description: 'Places you already log get a location label. No device permission needed.',
  },
  {
    value: 'foreground_capture',
    label: 'Foreground capture',
    description: 'Also notices places you visit often while the app is open, to suggest a routine.',
  },
]

/** The three-tier location-assistance control (spec 044 US4). Off by default; moving to
 *  'foreground_capture' triggers exactly one permission prompt (handled by the device the first
 *  time a capture actually runs, not here). Geocoding shows a calm "not available yet" message
 *  instead of a broken toggle when the server-side provider isn't configured (FR-012). */
export function LocationConsentSection() {
  const { locationConsent, setLocationConsent, currentHousehold, t } = useApp()
  const [geocodingAvailability, setGeocodingAvailability] = useState<GeocodingAvailability>('checking')

  useEffect(() => {
    let cancelled = false
    checkGeocodingAvailable(!!currentHousehold).then((a) => {
      if (!cancelled) setGeocodingAvailability(a)
    })
    return () => {
      cancelled = true
    }
  }, [currentHousehold])

  const level = locationConsent?.level ?? 'off'
  const geocodingUnavailable = geocodingAvailability === 'unconfigured' || geocodingAvailability === 'no-household'

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-2">
        {t('Optional. Off by default. Sharpens routine detection but never required for it.')}
      </p>
      <div role="radiogroup" aria-label={t('Location assistance')} className="flex flex-col gap-2">
        {TIERS.map((tier) => {
          const active = tier.value === level
          const disabled = tier.value !== 'off' && geocodingUnavailable
          return (
            <button
              key={tier.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => setLocationConsent(tier.value)}
              className="flex flex-col gap-0.5 rounded-2xl px-4 py-3 text-left transition-colors disabled:opacity-40"
              style={{ background: active ? 'var(--chip-bg)' : 'transparent' }}
            >
              <span className="text-[15px] text-text">{t(tier.label)}</span>
              <span className="text-[13px] text-text-3">{t(tier.description)}</span>
            </button>
          )
        })}
      </div>
      {geocodingUnavailable && geocodingAvailability === 'unconfigured' && (
        <p className="text-[13px] text-text-3">{t("Location enrichment isn't available yet.")}</p>
      )}
    </div>
  )
}
