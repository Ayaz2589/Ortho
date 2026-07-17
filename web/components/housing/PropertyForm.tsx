'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, MinusCircle, Plus } from 'lucide-react'
import { useApp } from '@/lib/store'
import { FormGroup, FieldRow, SectionLabel, PrimaryButton } from '@/components/ui'
import { TextInput, MoneyInput, parseMoney, DatePicker } from '@/components/inputs'
import { fractionDigits } from '@/lib/finance/currency'
import { isUnitOccupied } from '@/lib/finance/housing'
import type { Property, PropertyKind, MortgageInfo, LeaseInfo, Unit } from '@/lib/types'
import { kindMeta } from './kinds'
import { rateToInput, parseRate } from './rate'

const TERMS = [15, 20, 30]

function todayISO(): string {
  return isoOf(new Date())
}

function isoOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function plusOneYearISO(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return isoOf(d)
}

function centsToDisplay(cents: number, currency: ReturnType<typeof useApp>['currency'], rate: number): string {
  if (cents <= 0) return ''
  const digits = fractionDigits(currency)
  // USD-cents storage invariant: always divide by 100, then apply the FX rate.
  return ((cents / 100) * rate).toFixed(digits)
}

interface DraftUnit {
  id: string
  name: string
  rent: string // display-currency string
  tenant: string
  occupied: boolean
}

/** Header render props exposed to the surrounding chrome (Drawer or page). */
export interface PropertyFormHeaderApi {
  navTitle: string
  isEditing: boolean
  canSubmit: boolean
  submit: () => void
}

/** The new/edit title for a property kind — shared by the Drawer aria-label and
 *  the in-form/page header so they never drift. */
export function propertyFormTitle(
  kind: PropertyKind,
  editing: Property | null | undefined,
  t: (key: string, ...args: Array<string | number>) => string
): string {
  const meta = kindMeta(kind)
  return editing
    ? t('Edit {0}', t(meta.shortLabel).toLowerCase())
    : kind === 'primary_home'
      ? t('New primary home')
      : kind === 'multifamily'
        ? t('New multifamily')
        : t('New rental')
}

/**
 * The new/edit PROPERTY form body + all its logic (spec 025), extracted verbatim
 * from AddPropertyModal so BOTH the desktop right-side Drawer (AddPropertyModal)
 * and the mobile full-screen page (PropertyFormPageClient) render the exact same
 * fields and submit path — no duplication. The chrome differs per surface, so the
 * header is supplied via the `header` render-prop, which receives the derived
 * title + the canSubmit/submit handles. `onDone` runs after a successful submit
 * (and is what the header's cancel/back should call).
 */
export function PropertyForm({
  open,
  kind,
  editing,
  onDone,
  header,
}: {
  open: boolean
  kind: PropertyKind
  editing?: Property | null
  onDone: () => void
  header: (api: PropertyFormHeaderApi) => ReactNode
}) {
  const { currency, rate, currentHousehold, addProperty, updateProperty, t } = useApp()
  const meta = kindMeta(kind)
  const isEditing = !!editing

  const [address, setAddress] = useState('')
  const [nickname, setNickname] = useState('')

  // mortgage
  const [purchase, setPurchase] = useState('')
  const [loan, setLoan] = useState('')
  const [interest, setInterest] = useState('')
  const [term, setTerm] = useState(30)
  const [closing, setClosing] = useState(todayISO())
  const [autoPay, setAutoPay] = useState('')

  // lease
  const [rent, setRent] = useState('')
  const [leaseStart, setLeaseStart] = useState(todayISO())
  const [leaseEnd, setLeaseEnd] = useState(plusOneYearISO())
  const [deposit, setDeposit] = useState('')
  const [paidWith, setPaidWith] = useState('')

  // multifamily
  const [units, setUnits] = useState<DraftUnit[]>([])

  useEffect(() => {
    if (!open) return
    const r = rate(currency)
    if (editing) {
      setAddress(editing.address)
      setNickname(editing.nickname ?? '')
      const m = editing.mortgage
      setPurchase(centsToDisplay(m?.purchase_price_cents ?? 0, currency, r))
      setLoan(centsToDisplay(m?.original_loan_cents ?? 0, currency, r))
      setInterest(m ? rateToInput(m.annual_interest_rate_percent) : '')
      setTerm(m?.loan_term_years ?? 30)
      setClosing(m?.closing_date ?? todayISO())
      setAutoPay(m?.auto_pay_source ?? '')
      const l = editing.lease
      setRent(centsToDisplay(l?.monthly_rent_cents ?? 0, currency, r))
      setLeaseStart(l?.lease_start ?? todayISO())
      setLeaseEnd(l?.lease_end ?? plusOneYearISO())
      setDeposit(l?.security_deposit_cents != null ? centsToDisplay(l.security_deposit_cents, currency, r) : '')
      setPaidWith(l?.paid_with_source ?? '')
      setUnits(
        (editing.units ?? []).map((u) => ({
          id: u.id,
          name: u.name,
          rent: centsToDisplay(u.monthly_rent_cents, currency, r),
          tenant: u.tenant_name ?? '',
          occupied: u.occupied ?? isUnitOccupied(u.tenant_name),
        }))
      )
    } else {
      setAddress('')
      setNickname('')
      setPurchase('')
      setLoan('')
      setInterest('')
      setTerm(30)
      setClosing(todayISO())
      setAutoPay('')
      setRent('')
      setLeaseStart(todayISO())
      setLeaseEnd(plusOneYearISO())
      setDeposit('')
      setPaidWith('')
      setUnits([])
    }
    // Reset only when the form opens or the edit target changes — currency and
    // rate are read at run time so mid-edit re-renders keep user input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const r = rate(currency)
  const canSubmit = (() => {
    // No resolved household → creating would silently no-op server-side;
    // block it here like iOS's canSubmit does.
    if (!currentHousehold) return false
    if (address.trim() === '') return false
    if (meta.hasMortgage) {
      return parseRate(purchase) > 0 && parseRate(loan) > 0 && parseRate(interest) > 0
    }
    return parseRate(rent) > 0
  })()

  const handleSubmit = () => {
    if (!canSubmit || !currentHousehold) return
    const id = editing?.id ?? crypto.randomUUID()
    const now = new Date().toISOString()

    let mortgage: MortgageInfo | undefined
    if (meta.hasMortgage) {
      mortgage = {
        property_id: id,
        purchase_price_cents: parseMoney(purchase, currency, r) ?? 0,
        original_loan_cents: parseMoney(loan, currency, r) ?? 0,
        annual_interest_rate_percent: parseRate(interest),
        loan_term_years: term,
        closing_date: closing,
        // Empty → null, otherwise stored exactly as typed (iOS parity: only
        // an isEmpty check, no trimming).
        auto_pay_source: autoPay === '' ? null : autoPay,
      }
    }

    let lease: LeaseInfo | undefined
    if (kind === 'rental') {
      const depCents = deposit.trim() === '' ? null : parseMoney(deposit, currency, r)
      lease = {
        property_id: id,
        monthly_rent_cents: parseMoney(rent, currency, r) ?? 0,
        lease_start: leaseStart,
        lease_end: leaseEnd,
        security_deposit_cents: depCents,
        paid_with_source: paidWith === '' ? null : paidWith,
      }
    }

    // Units store exactly as typed (an emptied name saves empty; tenant is
    // empty→null, never trimmed) — iOS parity: only address is trimmed.
    let unitObjs: Unit[] | undefined
    if (kind === 'multifamily') {
      unitObjs = units.map((u, i) => ({
        id: u.id,
        property_id: id,
        name: u.name,
        monthly_rent_cents: parseMoney(u.rent, currency, r) ?? 0,
        tenant_name: u.tenant === '' ? null : u.tenant,
        tenant_email: null,
        sort_order: i,
        occupied: u.occupied,
      }))
    }

    const property: Property = {
      id,
      household_id: currentHousehold.id,
      kind,
      address: address.trim(),
      nickname: nickname === '' ? null : nickname,
      created_at: editing?.created_at ?? now,
      updated_at: now,
      mortgage,
      lease,
      units: kind === 'multifamily' ? unitObjs : [],
    }

    if (isEditing) updateProperty(property)
    else addProperty(property)
    onDone()
  }

  const navTitle = propertyFormTitle(kind, editing, t)

  // Per-kind explanatory footer — same meaning as iOS AddPropertySheet.
  const footerCaption =
    kind === 'primary_home'
      ? t("Monthly principal + interest is computed from the loan amount, rate, and term. Taxes and insurance aren't tracked yet.")
      : kind === 'multifamily'
        ? t("Add each unit's rent and tenant. Net balance is occupied unit rent minus the mortgage payment.")
        : t('Rent reminders use the day of the month from your lease start date.')

  const addUnit = () =>
    setUnits((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: `Unit ${prev.length + 1}`, rent: '', tenant: '', occupied: true },
    ])
  const removeUnit = (id: string) => setUnits((prev) => prev.filter((u) => u.id !== id))
  const patchUnit = (id: string, patch: Partial<DraftUnit>) =>
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))

  return (
    <>
      {header({ navTitle, isEditing, canSubmit, submit: handleSubmit })}
      <div className="flex flex-col gap-5 overflow-auto p-4 pb-6">
        <FormGroup>
          <FieldRow label={t('Address')}>
            <TextInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('e.g. 124 Oak Lane')}
              autoFocus
            />
          </FieldRow>
          <FieldRow label={t('Nickname')}>
            <TextInput
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('Optional')}
            />
          </FieldRow>
        </FormGroup>

        {meta.hasMortgage && (
          <div className="flex flex-col gap-2">
            <SectionLabel>{t('Mortgage')}</SectionLabel>
            <FormGroup>
              <FieldRow label={t('Purchase price')}>
                <MoneyInput value={purchase} onChange={setPurchase} placeholder="0" />
              </FieldRow>
              <FieldRow label={t('Original loan')}>
                <MoneyInput value={loan} onChange={setLoan} placeholder="0" />
              </FieldRow>
              <FieldRow label={t('Interest rate')}>
                <div className="flex items-center gap-1">
                  <input
                    inputMode="decimal"
                    value={interest}
                    onChange={(e) => setInterest(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    className="w-20 bg-transparent text-right text-[15px] text-text outline-none placeholder:text-text-3"
                  />
                  <span className="text-[15px] text-text-2">%</span>
                </div>
              </FieldRow>
              <FieldRow label={t('Term')}>
                <div className="relative flex items-center gap-1">
                  <select
                    value={term}
                    onChange={(e) => setTerm(Number(e.target.value))}
                    className="appearance-none bg-transparent pr-5 text-right text-[15px] font-normal text-text outline-none"
                  >
                    {TERMS.map((yr) => (
                      <option key={yr} value={yr}>
                        {t('{0}-year', yr)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-0 text-text-3" />
                </div>
              </FieldRow>
              <FieldRow label={t('Closing date')}>
                <DatePicker value={closing} onChange={setClosing} ariaLabel={t('Closing date')} />
              </FieldRow>
              <FieldRow label={t('Auto-pay')}>
                <TextInput
                  value={autoPay}
                  onChange={(e) => setAutoPay(e.target.value)}
                  placeholder={t('Optional')}
                />
              </FieldRow>
            </FormGroup>
          </div>
        )}

        {kind === 'multifamily' && (
          <div className="flex flex-col gap-2">
            <SectionLabel>{t('Units & tenants')}</SectionLabel>
            <FormGroup>
              {units.map((u) => (
                <div key={u.id} className="divide-y divide-hairline">
                  <FieldRow label={t('Unit name')}>
                    <div className="flex w-full items-center justify-end gap-2">
                      <TextInput
                        value={u.name}
                        onChange={(e) => patchUnit(u.id, { name: e.target.value })}
                        placeholder={t('e.g. 1A')}
                      />
                      <button
                        type="button"
                        aria-label={t('Remove unit')}
                        onClick={() => removeUnit(u.id)}
                        className="shrink-0 text-destructive"
                      >
                        <MinusCircle size={18} />
                      </button>
                    </div>
                  </FieldRow>
                  <FieldRow label={t('Rent')}>
                    <MoneyInput
                      value={u.rent}
                      onChange={(v) => patchUnit(u.id, { rent: v })}
                      placeholder="0"
                    />
                  </FieldRow>
                  <FieldRow label={t('Tenant')}>
                    <TextInput
                      value={u.tenant}
                      onChange={(e) => patchUnit(u.id, { tenant: e.target.value })}
                      placeholder={t('Optional')}
                    />
                  </FieldRow>
                  <FieldRow label={t('Occupancy')}>
                    <div className="relative flex items-center gap-1">
                      <select
                        value={u.occupied ? 'occupied' : 'vacant'}
                        onChange={(e) => patchUnit(u.id, { occupied: e.target.value === 'occupied' })}
                        aria-label={t('Occupancy')}
                        className="appearance-none bg-transparent pr-5 text-right text-[15px] font-normal text-text outline-none"
                      >
                        <option value="occupied">{t('Occupied')}</option>
                        <option value="vacant">{t('Vacant')}</option>
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-0 text-text-3" />
                    </div>
                  </FieldRow>
                </div>
              ))}
              <button
                type="button"
                onClick={addUnit}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 text-accent"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: 'var(--chip-bg)' }}
                >
                  <Plus size={14} strokeWidth={2.5} />
                </span>
                <span className="text-[15px] font-normal">{t('Add unit')}</span>
              </button>
            </FormGroup>
          </div>
        )}

        {kind === 'rental' && (
          <div className="flex flex-col gap-2">
            <SectionLabel>{t('Lease')}</SectionLabel>
            <FormGroup>
              <FieldRow label={t('Monthly rent')}>
                <MoneyInput value={rent} onChange={setRent} placeholder="0" />
              </FieldRow>
              <FieldRow label={t('Lease start')}>
                <DatePicker value={leaseStart} onChange={setLeaseStart} ariaLabel={t('Lease start')} />
              </FieldRow>
              <FieldRow label={t('Lease end')}>
                <DatePicker value={leaseEnd} onChange={setLeaseEnd} ariaLabel={t('Lease end')} />
              </FieldRow>
              <FieldRow label={t('Security deposit')}>
                <MoneyInput value={deposit} onChange={setDeposit} placeholder={t('Optional')} />
              </FieldRow>
              <FieldRow label={t('Paid with')}>
                <TextInput
                  value={paidWith}
                  onChange={(e) => setPaidWith(e.target.value)}
                  placeholder={t('Optional')}
                />
              </FieldRow>
            </FormGroup>
          </div>
        )}

        <p className="px-1 text-[13px] leading-relaxed text-text-3">{footerCaption}</p>

        <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
          {isEditing ? t('Save property') : t('Add property')}
        </PrimaryButton>
      </div>
    </>
  )
}
