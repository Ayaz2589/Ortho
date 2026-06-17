'use client'

import { useState, type ReactNode } from 'react'
import { useApp } from '@/lib/store'
import {
  monthlyPaymentCents,
  currentPrincipalBalanceCents,
  currentEquityCents,
  equityFraction,
  maturityDate,
  yearsRemaining,
  upcomingAmortization,
} from '@/lib/finance/mortgage'
import { mediumDate, monthYear } from '@/lib/format'
import type { Property } from '@/lib/types'
import { kindMeta } from '@/components/housing/kinds'
import { PropertyTypePicker } from '@/components/housing/PropertyTypePicker'
import { AddPropertyModal } from '@/components/housing/AddPropertyModal'
import { AddRentalPaymentModal } from '@/components/housing/AddRentalPaymentModal'
import { RenewalBanner } from '@/components/housing/RentalCards'
import { isRenewalSoon } from '@/components/housing/lease'
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
  const { formatMoney } = useApp()
  const m = property.mortgage!
  const schedule = upcomingAmortization(12, m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years, m.closing_date)
  const max = Math.max(1, ...schedule.map((s) => s.principalCents + s.interestCents))
  return (
    <div style={{ padding: 24 }}>
      <CardLabel hint="Next 12 months">Amortization</CardLabel>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 72 }}>
        {schedule.map((s, i) => {
          const total = s.principalCents + s.interestCents
          const h = (total / max) * 72
          const pPct = total > 0 ? (s.principalCents / total) * 100 : 0
          return (
            <div key={i} style={{ flex: 1, height: h, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 3 }}>
              <div style={{ height: `${100 - pPct}%`, background: 'var(--text-3)', opacity: 0.45 }} />
              <div style={{ height: `${pPct}%`, background: 'var(--positive)' }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.4px' }}>
        {schedule.map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            {new Intl.DateTimeFormat('en-US', { month: 'narrow' }).format(s.month)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 12, color: 'var(--text-2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--positive)' }} />Principal
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--text-3)', opacity: 0.45 }} />Interest
        </span>
      </div>
    </div>
  )
}

function MortgageColumns({ property }: { property: Property }) {
  const { formatMoney, rentalPayments, locale, deleteRentalPayment } = useApp()
  const [logging, setLogging] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const m = property.mortgage
  const payment = m ? monthlyPaymentCents(m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years) : 0

  const units = property.units ?? []
  const occupiedRent = units.filter((u) => (u.tenant_name ?? '').trim() !== '').reduce((s, u) => s + u.monthly_rent_cents, 0)
  const netBalance = occupiedRent - payment
  const isMulti = property.kind === 'multifamily'
  const isRental = property.kind === 'rental'

  return (
    <div className="ow-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {m ? (
          <>
            <div className="ow-card" style={{ padding: 24 }}>
              <CardLabel hint={m.auto_pay_source ? 'Auto-pays on the 1st' : undefined}>Monthly payment</CardLabel>
              <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-0.7px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{formatMoney(payment)}</div>
              {m.auto_pay_source && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>{m.auto_pay_source}</div>}
            </div>
            <div className="ow-card">
              <HStatRow first label="Principal balance" value={formatMoney(currentPrincipalBalanceCents(m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years, m.closing_date))} sub={`Original loan · ${formatMoney(m.original_loan_cents)}`} />
              <HStatRow label="Interest rate" value={`${m.annual_interest_rate_percent.toFixed(2)}%`} sub={`Fixed · ${m.loan_term_years}-year`} />
              <HStatRow label="Maturity" value={mediumDate(maturityDate(m.closing_date, m.loan_term_years), locale)} sub={`${yearsRemaining(m.closing_date, m.loan_term_years)} years remaining`} />
            </div>
            <div className="ow-card">
              <Amortization property={property} />
            </div>
          </>
        ) : property.lease ? (
          <>
            <div className="ow-card" style={{ padding: 24 }}>
              <CardLabel>Monthly rent</CardLabel>
              <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-0.7px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{formatMoney(property.lease.monthly_rent_cents)}</div>
            </div>
            {/* Lease-renewal banner — matches the phone view / iOS (shown when the
                lease ends within 60 days). */}
            {isRenewalSoon(property.lease) && <RenewalBanner lease={property.lease} />}
            <div className="ow-card">
              <HStatRow first label="Lease start" value={mediumDate(new Date(property.lease.lease_start), locale)} />
              <HStatRow label="Lease end" value={mediumDate(new Date(property.lease.lease_end), locale)} />
              {property.lease.security_deposit_cents != null && <HStatRow label="Security deposit" value={formatMoney(property.lease.security_deposit_cents)} />}
              {property.lease.paid_with_source && <HStatRow label="Paid with" value={property.lease.paid_with_source} />}
            </div>
          </>
        ) : null}
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {m && (
          <div className="ow-card" style={{ padding: 24 }}>
            <CardLabel hint={`of ${formatMoney(m.purchase_price_cents)} · ${(equityFraction(m.purchase_price_cents, m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years, m.closing_date) * 100).toFixed(1)}%`}>
              Equity
            </CardLabel>
            <div style={{ fontSize: 26, fontWeight: 300, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', marginBottom: 14 }}>
              {formatMoney(currentEquityCents(m.purchase_price_cents, m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years, m.closing_date))}
            </div>
            <div style={{ height: 8, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ width: `${equityFraction(m.purchase_price_cents, m.original_loan_cents, m.annual_interest_rate_percent, m.loan_term_years, m.closing_date) * 100}%`, height: '100%', background: 'var(--positive)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>Built since closing · {monthYear(new Date(m.closing_date), locale)}</div>
          </div>
        )}

        {isMulti && (
          <>
            <div className="ow-card">
              <div style={{ padding: '16px 20px 4px' }}>
                <CardLabel hint={`${units.length} ${units.length === 1 ? 'unit' : 'units'}`} style={{ marginBottom: 0 }}>Rental income</CardLabel>
              </div>
              {units.map((u, i) => {
                const vacant = (u.tenant_name ?? '').trim() === ''
                return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', minHeight: 60, borderTop: i === 0 ? 'none' : '0.5px solid var(--hairline)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--chip-bg)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12.5, fontWeight: 400 }}>{u.name}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 400, letterSpacing: '-0.15px' }}>{vacant ? 'Vacant' : u.tenant_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{vacant ? 'No applicants' : 'Tenant'}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 400, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums', color: vacant ? 'var(--text-3)' : 'var(--text)' }}>
                      {vacant ? '—' : formatMoney(u.monthly_rent_cents)}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="ow-card">
              <HStatRow first label="Rental income" value={formatMoney(occupiedRent)} />
              <HStatRow label="Mortgage payment" value={`−${formatMoney(payment)}`} />
              <div style={{ borderTop: '0.5px solid var(--hairline)', padding: '16px 20px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)' }}>Net balance</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>This month</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums', color: netBalance >= 0 ? 'var(--positive)' : 'var(--text)' }}>
                  {netBalance >= 0 ? '+' : '−'}{formatMoney(Math.abs(netBalance))}
                </div>
              </div>
            </div>
          </>
        )}

        {isRental && (
          <div className="ow-card">
            <div style={{ padding: '16px 20px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 400, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)' }}>Payment history</div>
              <button className="ow-btn" onClick={() => setLogging(true)} style={{ fontSize: 13, fontWeight: 400, color: 'var(--accent)' }}>Log payment</button>
            </div>
            {rentalPayments.filter((rp) => rp.property_id === property.id).length === 0 ? (
              <div style={{ padding: '8px 20px 16px', fontSize: 13, color: 'var(--text-3)' }}>No payments logged yet.</div>
            ) : (
              rentalPayments
                .filter((rp) => rp.property_id === property.id)
                .map((rp, i) => (
                  <div key={rp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', minHeight: 56, borderTop: i === 0 ? 'none' : '0.5px solid var(--hairline)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 400 }}>{mediumDate(new Date(rp.date), locale)}</div>
                      {rp.note && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{rp.note}</div>}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(rp.amount_cents)}</div>
                    {confirmId === rp.id ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className="ow-btn ow-quiet-link" onClick={() => setConfirmId(null)}>Cancel</button>
                        <button className="ow-btn" onClick={() => { setConfirmId(null); deleteRentalPayment(rp.id) }} style={{ fontSize: 13, fontWeight: 400, color: 'var(--destructive)' }} aria-label="Confirm delete payment">Delete</button>
                      </span>
                    ) : (
                      <button className="ow-btn ow-quiet-link" onClick={() => setConfirmId(rp.id)} aria-label="Delete payment">Remove</button>
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
  const { properties } = useApp()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [creatingKind, setCreatingKind] = useState<PropertyKind | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const selected =
    (selectedId ? properties.find((p) => p.id === selectedId) : null) ?? properties[0] ?? null
  const editing = editingId ? properties.find((p) => p.id === editingId) ?? null : null

  const actions = (
    <>
      {selected && <AccentTextButton onClick={() => setEditingId(selected.id)}>Edit</AccentTextButton>}
      <ChipIconButton label="Add property" onClick={() => setPickerOpen(true)}>
        <PlusGlyph />
      </ChipIconButton>
    </>
  )

  return (
    <div className="ow-page-inner" style={{ maxWidth: 980, paddingTop: 0, paddingBottom: 0 }}>
      <WebPageHeader
        title="Housing"
        sub={selected ? `${selected.address} · ${kindMeta(selected.kind).shortLabel}` : undefined}
        actions={actions}
      />

      {properties.length === 0 && (
        <p style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
          No properties yet. Add a home, rental, or multifamily property to get started.
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

      {selected && <MortgageColumns key={selected.id} property={selected} />}

      <PropertyTypePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(k) => { setPickerOpen(false); setCreatingKind(k) }} />
      {creatingKind && <AddPropertyModal open={!!creatingKind} onClose={() => setCreatingKind(null)} kind={creatingKind} />}
      {editing && <AddPropertyModal open={!!editing} onClose={() => setEditingId(null)} kind={editing.kind} editing={editing} />}
    </div>
  )
}
