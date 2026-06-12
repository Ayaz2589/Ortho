'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, MinusCircle, Plus } from 'lucide-react'
import { useApp } from '@/lib/store'
import {
  Modal,
  FormGroup,
  FieldRow,
  SectionLabel,
  PrimaryButton,
} from '@/components/ui'
import { TextInput, MoneyInput, parseMoney, DatePicker } from '@/components/inputs'
import { fractionDigits } from '@/lib/finance/currency'
import type {
  Property,
  PropertyKind,
  MortgageInfo,
  LeaseInfo,
  Unit,
} from '@/lib/types'
import { kindMeta } from './kinds'

const TERMS = [15, 20, 30]

function todayISO(): string {
  const d = new Date()
  return isoOf(d)
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
  const divisor = digits === 0 ? 1 : 100
  return ((cents / divisor) * rate).toFixed(digits)
}

interface DraftUnit {
  id: string
  name: string
  rent: string // display-currency string
  tenant: string
}

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
  const { currency, rate, currentHousehold, addProperty, updateProperty } = useApp()
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
      setInterest(m ? m.annual_interest_rate_percent.toFixed(2) : '')
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
    // Reset only when the modal opens or the edit target changes — currency
    // and rate are read at run time so mid-edit re-renders keep user input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const r = rate(currency)
  const num = (s: string) => {
    const v = parseFloat(s.replace(/[,\s]/g, ''))
    return isNaN(v) ? 0 : v
  }

  const canSubmit = (() => {
    if (address.trim() === '') return false
    if (meta.hasMortgage) {
      return num(purchase) > 0 && num(loan) > 0 && num(interest) > 0
    }
    return num(rent) > 0
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
        annual_interest_rate_percent: num(interest),
        loan_term_years: term,
        closing_date: closing,
        auto_pay_source: autoPay.trim() === '' ? null : autoPay.trim(),
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
        paid_with_source: paidWith.trim() === '' ? null : paidWith.trim(),
      }
    }

    let unitObjs: Unit[] | undefined
    if (kind === 'multifamily') {
      unitObjs = units.map((u, i) => ({
        id: u.id,
        property_id: id,
        name: u.name.trim() === '' ? `Unit ${i + 1}` : u.name.trim(),
        monthly_rent_cents: parseMoney(u.rent, currency, r) ?? 0,
        tenant_name: u.tenant.trim() === '' ? null : u.tenant.trim(),
        tenant_email: null,
        sort_order: i,
      }))
    }

    const property: Property = {
      id,
      household_id: currentHousehold.id,
      kind,
      address: address.trim(),
      nickname: nickname.trim() === '' ? null : nickname.trim(),
      created_at: editing?.created_at ?? now,
      updated_at: now,
      mortgage,
      lease,
      units: kind === 'multifamily' ? unitObjs : [],
    }

    if (isEditing) updateProperty(property)
    else addProperty(property)
    onClose()
  }

  const navTitle = isEditing
    ? `Edit ${meta.shortLabel.toLowerCase()}`
    : `New ${kind === 'primary_home' ? 'primary home' : kind === 'multifamily' ? 'multifamily' : 'rental'}`

  const addUnit = () =>
    setUnits((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: `Unit ${prev.length + 1}`, rent: '', tenant: '' },
    ])
  const removeUnit = (id: string) => setUnits((prev) => prev.filter((u) => u.id !== id))
  const patchUnit = (id: string, patch: Partial<DraftUnit>) =>
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={navTitle}
      right={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="font-normal text-accent disabled:opacity-40"
        >
          {isEditing ? 'Save' : 'Add'}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <FormGroup>
          <FieldRow label="Address">
            <TextInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 124 Oak Lane"
              autoFocus
            />
          </FieldRow>
          <FieldRow label="Nickname">
            <TextInput
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Optional"
            />
          </FieldRow>
        </FormGroup>

        {meta.hasMortgage && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Mortgage</SectionLabel>
            <FormGroup>
              <FieldRow label="Purchase price">
                <MoneyInput value={purchase} onChange={setPurchase} placeholder="0" />
              </FieldRow>
              <FieldRow label="Original loan">
                <MoneyInput value={loan} onChange={setLoan} placeholder="0" />
              </FieldRow>
              <FieldRow label="Interest rate">
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
              <FieldRow label="Term">
                <div className="relative flex items-center gap-1">
                  <select
                    value={term}
                    onChange={(e) => setTerm(Number(e.target.value))}
                    className="appearance-none bg-transparent pr-5 text-right text-[15px] font-normal text-text outline-none"
                  >
                    {TERMS.map((t) => (
                      <option key={t} value={t}>
                        {t}-year
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-0 text-text-3" />
                </div>
              </FieldRow>
              <FieldRow label="Closing date">
                <DatePicker value={closing} onChange={setClosing} ariaLabel="Closing date" />
              </FieldRow>
              <FieldRow label="Auto-pay">
                <TextInput
                  value={autoPay}
                  onChange={(e) => setAutoPay(e.target.value)}
                  placeholder="Optional"
                />
              </FieldRow>
            </FormGroup>
          </div>
        )}

        {kind === 'multifamily' && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Units &amp; tenants</SectionLabel>
            <FormGroup>
              {units.map((u) => (
                <div key={u.id} className="divide-y divide-hairline">
                  <FieldRow label="Unit name">
                    <div className="flex w-full items-center justify-end gap-2">
                      <TextInput
                        value={u.name}
                        onChange={(e) => patchUnit(u.id, { name: e.target.value })}
                        placeholder="e.g. 1A"
                      />
                      <button
                        type="button"
                        aria-label="Remove unit"
                        onClick={() => removeUnit(u.id)}
                        className="shrink-0 text-destructive"
                      >
                        <MinusCircle size={18} />
                      </button>
                    </div>
                  </FieldRow>
                  <FieldRow label="Rent">
                    <MoneyInput
                      value={u.rent}
                      onChange={(v) => patchUnit(u.id, { rent: v })}
                      placeholder="0"
                    />
                  </FieldRow>
                  <FieldRow label="Tenant">
                    <TextInput
                      value={u.tenant}
                      onChange={(e) => patchUnit(u.id, { tenant: e.target.value })}
                      placeholder="Optional"
                    />
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
                  style={{ background: 'rgba(0,0,0,0.05)' }}
                >
                  <Plus size={14} strokeWidth={2.5} />
                </span>
                <span className="text-[15px] font-normal">Add unit</span>
              </button>
            </FormGroup>
          </div>
        )}

        {kind === 'rental' && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Lease</SectionLabel>
            <FormGroup>
              <FieldRow label="Monthly rent">
                <MoneyInput value={rent} onChange={setRent} placeholder="0" />
              </FieldRow>
              <FieldRow label="Lease start">
                <DatePicker value={leaseStart} onChange={setLeaseStart} ariaLabel="Lease start" />
              </FieldRow>
              <FieldRow label="Lease end">
                <DatePicker value={leaseEnd} onChange={setLeaseEnd} ariaLabel="Lease end" />
              </FieldRow>
              <FieldRow label="Security deposit">
                <MoneyInput value={deposit} onChange={setDeposit} placeholder="Optional" />
              </FieldRow>
              <FieldRow label="Paid with">
                <TextInput
                  value={paidWith}
                  onChange={(e) => setPaidWith(e.target.value)}
                  placeholder="Optional"
                />
              </FieldRow>
            </FormGroup>
          </div>
        )}

        <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>
          {isEditing ? 'Save property' : 'Add property'}
        </PrimaryButton>
      </div>
    </Modal>
  )
}
