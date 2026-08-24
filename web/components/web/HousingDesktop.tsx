'use client'

import { useState, type ReactNode } from 'react'
import { useApp } from '@/lib/store'
import {
  monthlyPaymentCents,
  currentPrincipalBalanceCents,
  maturityDate,
  yearsRemaining,
  upcomingAmortization,
  PAID_OFF_THRESHOLD_CENTS,
} from '@/lib/finance/mortgage'
import { mediumDate, monthYear, parseLocalDate } from '@/lib/format'
import { occupiedRentCents, netRentalCents, rentUnitsFrom, isUnitOccupied } from '@/lib/finance/housing'
import type { Property } from '@/lib/types'
import { kindMeta } from '@/components/housing/kinds'
import { PropertyTypePicker } from '@/components/housing/PropertyTypePicker'
import { AddPropertyModal } from '@/components/housing/AddPropertyModal'
import { AddRentalPaymentModal } from '@/components/housing/AddRentalPaymentModal'
import { RenewalBanner } from '@/components/housing/RentalCards'
import { isRenewalSoon, daysUntilNextRent, rentDueCaption } from '@/components/housing/lease'
import type { PropertyKind } from '@/lib/types'
import { WebPageHeader, CardLabel, AccentTextButton, ChipIconButton, PlusGlyph } from './kit'

function HStatRow({ label, value, sub, first = false }: { label: string; value: ReactNode; sub?: string; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', minHeight: 54, borderTop: first ? 'none' : '0.5px solid var(--hairline)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, color: 'var(--text)', letterSpacing: '-0.1px' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 16, fontWeight: 400, letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

function Amortization({ property }: { property: Property }) {
  const { locale, t } = useApp()
  const m = property.mortgage!
  const schedule = upcomingAmortization(12, m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years, m.closing_date)
  // Grouped (side-by-side) principal vs interest bars per month — matches
  // iOS's `.position(by:)` chart, not a stack.
  const max = Math.max(1, ...schedule.flatMap((s) => [s.principalCents, s.interestCents]))
  return (
    <div style={{ padding: 24 }}>
      <CardLabel hint={t('Next 12 months')}>{t('Amortization')}</CardLabel>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 72 }}>
        {schedule.map((s, i) => (
          <div key={i} style={{ flex: 1, height: 72, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
            <div style={{ flex: 1, height: Math.max(1, (s.principalCents / max) * 72), background: 'var(--positive)', borderRadius: 2 }} />
            <div style={{ flex: 1, height: Math.max(1, (s.interestCents / max) * 72), background: 'var(--text-3)', opacity: 0.45, borderRadius: 2 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.4px' }}>
        {schedule.map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            {new Intl.DateTimeFormat(locale, { month: 'narrow' }).format(s.month)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 12, color: 'var(--text-2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--positive)' }} />{t('Principal')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--text-3)', opacity: 0.45 }} />{t('Interest')}
        </span>
      </div>
    </div>
  )
}

function MortgageColumns({ property }: { property: Property }) {
  const { formatMoney, rentalPayments, locale, deleteRentalPayment, t } = useApp()
  const [logging, setLogging] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const m = property.mortgage
  const payment = m ? monthlyPaymentCents(m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years) : 0

  const units = property.units ?? []
  const rentUnits = rentUnitsFrom(units)
  const occupiedRent = occupiedRentCents(rentUnits)
  const netBalance = netRentalCents(rentUnits, payment)
  const isMulti = property.kind === 'multifamily'
  const isRental = property.kind === 'rental'
  // A property missing its kind's sub-row (mortgage for homes/multifamily,
  // lease for rentals) renders only the neutral fallback — mirrors iOS.
  const incomplete = isRental ? !property.lease : !m

  // Newest-first at read time (mirrors iOS `payments(for:)`) — the store
  // prepends new payments, so raw order isn't reliable for back-dated ones.
  const payments = rentalPayments
    .filter((rp) => rp.property_id === property.id)
    .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime())

  return (
    <div className="ow-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {incomplete ? (
          <div className="ow-card" style={{ padding: 20 }}>
            <span style={{ fontSize: 15, color: 'var(--text-2)' }}>
              {t('Incomplete property — tap Edit to finish setup.')}
            </span>
          </div>
        ) : m ? (
          <>
            <div className="ow-card" style={{ padding: 24 }}>
              <CardLabel hint={m.auto_pay_source ? t('Auto-pays on the 1st') : undefined}>{t('Monthly payment')}</CardLabel>
              <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-0.7px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{formatMoney(payment)}</div>
              {m.auto_pay_source && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>{m.auto_pay_source}</div>}
            </div>
            <div className="ow-card">
              <HStatRow first label={t('Principal balance')} value={(() => { const b = currentPrincipalBalanceCents(m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years, m.closing_date); return b <= PAID_OFF_THRESHOLD_CENTS ? t("Paid off") : formatMoney(b) })()} sub={t('Original loan · {0}', formatMoney(m.original_loan_cents))} />
              <HStatRow label={t('Interest rate')} value={`${m.annual_interest_rate_percent.toFixed(2)}%`} sub={t('Fixed · {0}-year', m.loan_term_years)} />
              <HStatRow label={t('Maturity')} value={mediumDate(maturityDate(m.closing_date, m.loan_term_years), locale)} sub={t('{0} years remaining', yearsRemaining(m.closing_date, m.loan_term_years))} />
            </div>
            <div className="ow-card">
              <Amortization property={property} />
            </div>
          </>
        ) : property.lease ? (
          <>
            <div className="ow-card" style={{ padding: 24 }}>
              <CardLabel>{t('Monthly rent')}</CardLabel>
              <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-0.7px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{formatMoney(property.lease.monthly_rent_cents)}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>{rentDueCaption(daysUntilNextRent(property.lease), t)}</div>
            </div>
            {/* Lease-renewal banner — matches the phone view / iOS (shown when the
                lease ends within 60 days). */}
            {isRenewalSoon(property.lease) && <RenewalBanner lease={property.lease} />}
            <div className="ow-card">
              <HStatRow first label={t('Lease start')} value={mediumDate(parseLocalDate(property.lease.lease_start), locale)} />
              <HStatRow label={t('Lease end')} value={mediumDate(parseLocalDate(property.lease.lease_end), locale)} />
              {property.lease.security_deposit_cents != null && <HStatRow label={t('Security deposit')} value={formatMoney(property.lease.security_deposit_cents)} />}
              {property.lease.paid_with_source && <HStatRow label={t('Paid with')} value={property.lease.paid_with_source} />}
            </div>
          </>
        ) : null}
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {m && (
          <div className="ow-card" style={{ padding: 24 }}>
            {(() => {
              const rawBal = currentPrincipalBalanceCents(m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years, m.closing_date)
              const bal = rawBal <= PAID_OFF_THRESHOLD_CENTS ? 0 : rawBal
              const paid = m.original_loan_cents - bal
              // Fraction from the printed pair — never the purchase-price
              // basis (review 2026-08-24, B5; mirrors EquityProgress).
              const pct = m.original_loan_cents > 0 ? Math.min(100, Math.max(0, (paid / m.original_loan_cents) * 100)) : 0
              return (
                <>
                  <CardLabel hint={t('of {0} · {1}', formatMoney(m.original_loan_cents), `${pct.toFixed(1)}%`)}>
                    {t('Principal paid down')}
                  </CardLabel>
                  <div style={{ fontSize: 26, fontWeight: 300, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', marginBottom: 14 }}>
                    {formatMoney(paid)}
                  </div>
                  <div style={{ height: 8, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--positive)' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>{t('Since closing · {0}', monthYear(parseLocalDate(m.closing_date), locale))}</div>
                </>
              )
            })()}
          </div>
        )}

        {isMulti && !incomplete && (
          <>
            {/* Units & tenants — iOS content: every unit shows its configured
                rent (vacant or not); the sublabel is "Vacant" (destructive)
                or the tenant's name, never invented copy. */}
            <div className="ow-card">
              <div style={{ padding: '16px 20px 4px' }}>
                <CardLabel hint={units.length === 1 ? t('1 unit') : t('{0} units', units.length)} style={{ marginBottom: 0 }}>{t('Units & tenants')}</CardLabel>
              </div>
              {units.length === 0 ? (
                <div style={{ padding: '8px 20px 16px', fontSize: 13, color: 'var(--text-3)' }}>
                  {t('No units yet — edit this property to add them.')}
                </div>
              ) : (
                units.map((u, i) => {
                  // Explicit spec-020 flag first — matches the money math and
                  // the mobile UnitsCard (review 2026-08-24, B7).
                  const vacant = !(u.occupied ?? isUnitOccupied(u.tenant_name))
                  return (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', minHeight: 60, borderTop: i === 0 ? 'none' : '0.5px solid var(--hairline)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 400, letterSpacing: '-0.15px' }}>{u.name}</div>
                        <div style={{ fontSize: 12, color: vacant ? 'var(--destructive)' : 'var(--text-3)', marginTop: 2 }}>
                          {vacant ? t('Vacant') : u.tenant_name ?? '—'}
                        </div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 400, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                        {formatMoney(u.monthly_rent_cents)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="ow-card">
              <HStatRow first label={t('Rental income')} value={formatMoney(occupiedRent)} />
              <HStatRow label={t('Mortgage payment')} value={`−${formatMoney(payment)}`} />
              <div style={{ borderTop: '0.5px solid var(--hairline)', padding: '16px 20px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)' }}>{t('Net balance')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('This month')}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums', color: netBalance >= 0 ? 'var(--positive)' : 'var(--text)' }}>
                  {netBalance >= 0 ? '+' : '−'}{formatMoney(Math.abs(netBalance))}
                </div>
              </div>
            </div>
          </>
        )}

        {isRental && !incomplete && (
          <div className="ow-card">
            <div style={{ padding: '16px 20px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)' }}>{t('Payment history')}</div>
              <button className="ow-btn" onClick={() => setLogging(true)} style={{ fontSize: 13, fontWeight: 400, color: 'var(--accent)' }}>{t('Log payment')}</button>
            </div>
            {payments.length === 0 ? (
              <div style={{ padding: '8px 20px 16px', fontSize: 13, color: 'var(--text-3)' }}>{t('No payments logged yet.')}</div>
            ) : (
              payments
                .map((rp, i) => (
                  <div key={rp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', minHeight: 56, borderTop: i === 0 ? 'none' : '0.5px solid var(--hairline)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 400 }}>{mediumDate(parseLocalDate(rp.date), locale)}</div>
                      {rp.note && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{rp.note}</div>}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(rp.amount_cents)}</div>
                    {confirmId === rp.id ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className="ow-btn ow-quiet-link" onClick={() => setConfirmId(null)}>{t('Cancel')}</button>
                        <button className="ow-btn" onClick={() => { setConfirmId(null); deleteRentalPayment(rp.id) }} style={{ fontSize: 13, fontWeight: 400, color: 'var(--destructive)' }} aria-label={t('Confirm delete payment')}>{t('Delete')}</button>
                      </span>
                    ) : (
                      <button className="ow-btn ow-quiet-link" onClick={() => setConfirmId(rp.id)} aria-label={t('Delete payment')}>{t('Remove')}</button>
                    )}
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      {logging && <AddRentalPaymentModal open={logging} onClose={() => setLogging(false)} property={property} />}
    </div>
  )
}

export function HousingDesktop() {
  const { properties, deleteProperty, currentHousehold, t } = useApp()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [creatingKind, setCreatingKind] = useState<PropertyKind | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const selected =
    (selectedId ? properties.find((p) => p.id === selectedId) : null) ?? properties[0] ?? null
  const editing = editingId ? properties.find((p) => p.id === editingId) ?? null : null

  const actions = (
    <>
      {selected && (
        <button
          type="button"
          className="ow-btn"
          onClick={() => setConfirmingDelete((c) => !c)}
          style={{ fontSize: 15, fontWeight: 400, letterSpacing: '-0.2px', color: 'var(--destructive)' }}
        >
          {t('Delete')}
        </button>
      )}
      {selected && <AccentTextButton onClick={() => { setConfirmingDelete(false); setEditingId(selected.id) }}>{t('Edit')}</AccentTextButton>}
      {/* Disabled until a real household is resolved — a new property would
          otherwise silently no-op (mirrors iOS's disabled '+'). */}
      <ChipIconButton
        label={t('Add property')}
        disabled={!currentHousehold}
        onClick={() => { setConfirmingDelete(false); setPickerOpen(true) }}
      >
        <PlusGlyph />
      </ChipIconButton>
    </>
  )

  return (
    <div className="ow-page-inner" style={{ maxWidth: 980, paddingTop: 0, paddingBottom: 0 }}>
      <WebPageHeader
        title={t('Housing')}
        sub={selected ? `${selected.address} · ${t(kindMeta(selected.kind).shortLabel)}` : undefined}
        actions={actions}
      />

      {properties.length === 0 && (
        <p style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
          {t('No properties yet. Add a home, rental, or multifamily property to get started.')}
        </p>
      )}

      {properties.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {properties.map((p) => {
            const active = (selected?.id ?? '') === p.id
            return (
              <button
                key={p.id}
                className="ow-btn"
                onClick={() => setSelectedId(p.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 400,
                  background: active ? 'var(--surface-2)' : 'var(--chip-bg)',
                  color: active ? 'var(--text)' : 'var(--text-2)',
                }}
              >
                {p.nickname ?? p.address}
              </button>
            )
          })}
        </div>
      )}

      {selected && confirmingDelete && (
        <div className="ow-card" style={{ padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 14, color: 'var(--text-2)', textAlign: 'center' }}>
            {t('Delete {0}? Mortgage, lease, and payment history will be removed.', selected.nickname ?? selected.address)}
          </span>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              type="button"
              className="ow-btn"
              onClick={() => setConfirmingDelete(false)}
              style={{ padding: '8px 22px', borderRadius: 999, background: 'var(--chip-bg)', fontSize: 14, color: 'var(--text-2)' }}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="ow-btn"
              onClick={() => {
                deleteProperty(selected.id)
                setConfirmingDelete(false)
                setSelectedId(null)
              }}
              style={{ padding: '8px 22px', borderRadius: 999, background: 'var(--destructive)', color: 'white', fontSize: 14 }}
            >
              {t('Delete')}
            </button>
          </div>
        </div>
      )}

      {selected && <MortgageColumns key={selected.id} property={selected} />}

      <PropertyTypePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(k) => { setPickerOpen(false); setCreatingKind(k) }} />
      {creatingKind && <AddPropertyModal open={!!creatingKind} onClose={() => setCreatingKind(null)} kind={creatingKind} />}
      {editing && <AddPropertyModal open={!!editing} onClose={() => setEditingId(null)} kind={editing.kind} editing={editing} />}
    </div>
  )
}
