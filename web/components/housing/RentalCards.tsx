'use client'

import { useMemo, useState } from 'react'
import { KeyRound, CalendarClock, Plus, MinusCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import { mediumDate, parseLocalDate } from '@/lib/format'
import type { LeaseInfo, Property } from '@/lib/types'
import { daysUntilNextRent, daysUntilEnd } from './lease'
import { HousingSection, HousingLabel } from './MortgageCards'
import { AddRentalPaymentModal } from './AddRentalPaymentModal'

export function RentHero({ lease }: { lease: LeaseInfo }) {
  const { formatMoney, t } = useApp()
  // Same branching as lease.ts's nextRentCaption, but through the catalog.
  const days = daysUntilNextRent(lease)
  const caption =
    days === 0 ? t('Due today') : days === 1 ? t('Due tomorrow') : t('Due in {0} days', days)
  return (
    <HousingSection>
      <div className="flex flex-col gap-1.5 p-5">
        <HousingLabel right={<KeyRound size={16} className="text-text-2" />}>
          {t('Monthly rent')}
        </HousingLabel>
        <div className="text-[36px] font-light tracking-[-0.6px] tabular-nums text-text">
          {formatMoney(lease.monthly_rent_cents)}
        </div>
        <p className="text-[13px] text-text-2">{caption}</p>
      </div>
    </HousingSection>
  )
}

export function RenewalBanner({ lease }: { lease: LeaseInfo }) {
  const { t } = useApp()
  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-4"
      style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
    >
      <CalendarClock size={18} className="shrink-0 text-accent" />
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-normal text-text">
          {t('Lease ends in {0} days', daysUntilEnd(lease))}
        </span>
        <span className="text-[13px] text-text-2">{t('Time to renew or plan a move.')}</span>
      </div>
    </div>
  )
}

function LeaseRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-[15px] text-text-2">{label}</span>
      <span className="text-[17px] font-normal tabular-nums text-text">{value}</span>
    </div>
  )
}

export function LeaseInfoCard({ lease }: { lease: LeaseInfo }) {
  const { formatMoney, locale, t } = useApp()
  return (
    <HousingSection>
      <div className="divide-y divide-hairline">
        <LeaseRow label={t('Lease start')} value={mediumDate(parseLocalDate(lease.lease_start), locale)} />
        <LeaseRow label={t('Lease end')} value={mediumDate(parseLocalDate(lease.lease_end), locale)} />
        {lease.security_deposit_cents != null ? (
          <LeaseRow label={t('Security deposit')} value={formatMoney(lease.security_deposit_cents)} />
        ) : null}
        {lease.paid_with_source ? (
          <LeaseRow label={t('Paid with')} value={lease.paid_with_source} />
        ) : null}
      </div>
    </HousingSection>
  )
}

export function RentalPaymentsCard({ property }: { property: Property }) {
  const { rentalPayments, formatMoney, deleteRentalPayment, locale, t } = useApp()
  const [adding, setAdding] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const payments = useMemo(
    () =>
      rentalPayments
        .filter((p) => p.property_id === property.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [rentalPayments, property.id]
  )

  return (
    <>
      <HousingSection>
        <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
          <HousingLabel>{t('Payment history')}</HousingLabel>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[13px] font-normal text-accent"
          >
            <Plus size={12} strokeWidth={2.5} />
            {t('Log payment')}
          </button>
        </div>
        {payments.length === 0 ? (
          <p className="px-4 pb-4 text-[13px] text-text-3">
            {t('No payments logged yet. Tap Log payment to add one.')}
          </p>
        ) : (
          <div className="divide-y divide-hairline pb-1">
            {payments.map((payment) => (
              <div key={payment.id} className="flex min-h-[56px] items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-normal text-text">
                    {mediumDate(parseLocalDate(payment.date), locale)}
                  </span>
                  {payment.note ? (
                    <span className="text-[12px] text-text-3">{payment.note}</span>
                  ) : null}
                </div>
                <span className="ml-auto text-[17px] font-normal tabular-nums text-text">
                  {formatMoney(payment.amount_cents)}
                </span>
                {confirmId === payment.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="text-[13px] text-text-2"
                    >
                      {t('Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmId(null)
                        deleteRentalPayment(payment.id)
                      }}
                      className="text-[13px] text-destructive"
                    >
                      {t('Delete')}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={t('Delete payment')}
                    onClick={() => setConfirmId(payment.id)}
                    className="text-destructive"
                  >
                    <MinusCircle size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </HousingSection>
      <AddRentalPaymentModal
        open={adding}
        onClose={() => setAdding(false)}
        property={property}
      />
    </>
  )
}
