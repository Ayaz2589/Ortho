'use client'

import { useState } from 'react'
import { useApp } from '@/lib/store'
import type { Property } from '@/lib/types'
import {
  MortgagePaymentHero,
  MortgageDetails,
  EquityProgress,
  Amortization,
} from './MortgageCards'
import { UnitsCard, NetBalanceCard } from './MultifamilyCards'
import { RentHero, RenewalBanner, LeaseInfoCard, RentalPaymentsCard } from './RentalCards'
import { isRenewalSoon } from './lease'

/** The kind-specific card stack for one property, plus the Delete button. */
export function PropertyContent({ property }: { property: Property }) {
  const { deleteProperty, t } = useApp()
  const [confirming, setConfirming] = useState(false)

  // A server property missing its kind's sub-row (mortgage/lease) renders a
  // neutral placeholder instead of nothing — mirrors iOS's
  // `incompletePlaceholder` in PropertyContentView.
  const incomplete =
    property.kind === 'rental' ? !property.lease : !property.mortgage

  return (
    <div className="flex flex-col gap-4">
      {incomplete && (
        <div
          className="rounded-2xl bg-surface p-5 text-[15px] text-text-2"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
        >
          {t('Incomplete property — tap Edit to finish setup.')}
        </div>
      )}

      {property.kind === 'primary_home' && property.mortgage && (
        <>
          <MortgagePaymentHero mortgage={property.mortgage} />
          <MortgageDetails mortgage={property.mortgage} />
          <EquityProgress mortgage={property.mortgage} />
          <Amortization mortgage={property.mortgage} />
        </>
      )}

      {property.kind === 'multifamily' && property.mortgage && (
        <>
          <MortgagePaymentHero mortgage={property.mortgage} />
          <MortgageDetails mortgage={property.mortgage} />
          <UnitsCard property={property} />
          <NetBalanceCard property={property} />
          <EquityProgress mortgage={property.mortgage} />
          <Amortization mortgage={property.mortgage} />
        </>
      )}

      {property.kind === 'rental' && property.lease && (
        <>
          <RentHero lease={property.lease} />
          {isRenewalSoon(property.lease) && <RenewalBanner lease={property.lease} />}
          <LeaseInfoCard lease={property.lease} />
          <RentalPaymentsCard property={property} />
        </>
      )}

      {confirming ? (
        <div
          className="flex flex-col gap-3 rounded-2xl bg-surface p-4"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
        >
          <p className="text-center text-[14px] text-text-2">
            {t('Delete this property?')}{' '}
            {t('Mortgage info, lease details, and rental payment history for this property will be removed.')}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-full py-3 text-[15px] font-normal text-text-2"
              style={{ background: 'var(--chip-bg)' }}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              onClick={() => deleteProperty(property.id)}
              className="flex-1 rounded-full py-3 text-[15px] font-normal text-white"
              style={{ background: 'var(--destructive)' }}
            >
              {t('Delete')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-2xl bg-surface py-3.5 text-center text-[17px] font-normal text-destructive"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
        >
          {t('Delete property')}
        </button>
      )}
    </div>
  )
}
