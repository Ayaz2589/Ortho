// American Express Gold Card monthly statement PDF (multi-cardholder).
// Layout: per-card-member Summary tables (give card#→name + the control totals),
// then a "Payments"/"Credits" detail and a "New Charges" detail sectioned by
// "Card Ending 9-XXXXX". Each row is `MM/DD/YY <merchant+location>` then optional
// continuation line(s) then `$amount ⧫` on its own line. We import New Charges
// (owner = the card member); Payments + Credits are excluded (not new spending).
// Both sections reconcile against their printed totals. Pure — no IO, no clock.
import type { TransactionKind } from '../../../lib/types'
import type { BankProfile, ParsedSection, ParsedStatement, ParsedTransaction } from '../engine/types'
import { parseAmountToCents } from '../engine/money'
import { categorize } from '../engine/categorize'

const SOURCE = 'Amex Gold'

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Apple-Pay-prefixed merchant strings glued to a location; best-effort cleanup. */
function cleanMerchant(desc: string): string {
  const U = desc.toUpperCase()
  if (/MOBILE PAYMENT|THANK YOU/.test(U)) return 'Payment'
  if (/UBER EATS/.test(U)) return 'Uber Eats'
  if (/\bUBER\b/.test(U)) return 'Uber'
  if (/EXXONMOBIL/.test(U)) return 'ExxonMobil'
  if (/NYCT PAYGO/.test(U)) return 'NYCT Paygo'
  if (/INSTACART/.test(U)) return 'Instacart'
  if (/\bCVS\b/.test(U)) return 'CVS'
  if (/AIRBNB/.test(U)) return 'Airbnb'
  if (/PLAYSTATION/.test(U)) return 'PlayStation'

  let s = desc.replace(/^AplPay\s+/i, '').replace(/^[A-Z]{2,4}\*\s*/i, '')
  s = s.replace(/\S+\.\S+/g, ' ') // urls (help.uber.com)
  s = s.replace(/\d{2,}.*$/, ' ') // street numbers / phone / refs to end
  s = s.replace(/\s+[A-Z]{2}\b/g, ' ') // 2-letter state codes
  s = s.replace(/\s+/g, ' ').trim()
  return titleCase(s || desc)
}

function detect(text: string): boolean {
  return /American Express/.test(text) && /(Gold Card|Pay Over Time Limit|Membership Rewards)/.test(text)
}

function parse(pages: string[]): ParsedStatement {
  const lines = pages.join('\n').split('\n').map((l) => l.trim())

  const cardNumToName: Record<string, string> = {}
  const knownNames = new Set<string>()
  const charges: ParsedTransaction[] = []
  const payCred: ParsedTransaction[] = []
  let chargesTotal = 0
  let payCredTotal = 0
  let state: 'none' | 'payments' | 'credits' | 'charges' = 'none'
  let currentCard: string | undefined
  let pending: { dateISO: string; desc: string; card?: string } | null = null
  const closePending = () => {
    pending = null
  }

  const dateISO = (mdy: string) => {
    const m = mdy.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)!
    return `20${m[3]}-${m[1]}-${m[2]}T12:00:00.000Z`
  }
  const AMOUNT_ONLY = /^(-?\$[\d,]+\.\d{2})[\s⧫]*$/
  const DATE_ROW = /^(\d{2}\/\d{2}\/\d{2})\*?\s+(.+)$/

  const pushPayCred = (iso: string, desc: string, amount: string, reason: 'card-payment' | 'credit') => {
    let card: string | undefined
    let merchantSrc = desc
    for (const name of knownNames) {
      if (desc.startsWith(name)) {
        card = name
        merchantSrc = desc.slice(name.length).trim()
        break
      }
    }
    payCred.push({
      dateISO: iso,
      rawDescription: desc.replace(/\s+/g, ' ').trim(),
      merchant: cleanMerchant(merchantSrc),
      amountCents: Math.abs(parseAmountToCents(amount)),
      kind: 'income',
      section: 'Payments and Credits',
      category: 'income',
      excluded: true,
      excludeReason: reason,
      duplicate: false,
      cardMember: card,
      ownerIds: [],
      splits: null,
    })
  }

  for (const line of lines) {
    const sum = line.match(/^(.+?)\s+(9-\d+)\s+\$[\d,]+\.\d{2}\s+-?\$[\d,]+\.\d{2}\s+-?\$[\d,]+\.\d{2}$/)
    if (sum) {
      cardNumToName[sum[2]] = sum[1].trim()
      knownNames.add(sum[1].trim())
      continue
    }
    let m = line.match(/^Total New Charges\b.*\s(-?\$[\d,]+\.\d{2})$/)
    if (m) {
      chargesTotal = Math.abs(parseAmountToCents(m[1]))
      continue
    }
    m = line.match(/^Total Payments and Credits\b.*\s(-?\$[\d,]+\.\d{2})$/)
    if (m) {
      payCredTotal = Math.abs(parseAmountToCents(m[1]))
      continue
    }
    if (line === 'Payments Amount') {
      closePending()
      state = 'payments'
      continue
    }
    if (line === 'Credits Amount') {
      closePending()
      state = 'credits'
      continue
    }
    const ce = line.match(/^Card Ending (9-\d+)$/)
    if (ce) {
      closePending()
      state = 'charges'
      currentCard = cardNumToName[ce[1]]
      continue
    }
    if (line === 'Fees' || line === 'New Charges') {
      closePending()
      state = 'none'
      continue
    }
    if (state === 'none') continue

    if (state === 'payments') {
      const p = line.match(/^(\d{2}\/\d{2}\/\d{2})\*?\s+(.+?)\s+(-?\$[\d,]+\.\d{2})$/)
      if (p) pushPayCred(dateISO(p[1]), p[2], p[3], 'card-payment')
      continue
    }

    // credits + charges: row opens on a date, closes on a bare amount line.
    const d = line.match(DATE_ROW)
    if (d) {
      closePending()
      pending = { dateISO: dateISO(d[1]), desc: d[2], card: currentCard }
      continue
    }
    if (pending) {
      const a = line.match(AMOUNT_ONLY)
      if (a) {
        if (state === 'credits') {
          pushPayCred(pending.dateISO, pending.desc, a[1], 'credit')
        } else {
          const signed = parseAmountToCents(a[1])
          const kind: TransactionKind = signed < 0 ? 'income' : 'expense'
          const merchant = cleanMerchant(pending.desc)
          charges.push({
            dateISO: pending.dateISO,
            rawDescription: pending.desc.replace(/\s+/g, ' ').trim(),
            merchant,
            amountCents: Math.abs(signed),
            kind,
            section: 'New Charges',
            category: kind === 'income' ? 'income' : categorize(merchant, 'expense'),
            excluded: false,
            excludeReason: null,
            duplicate: false,
            cardMember: pending.card,
            ownerIds: [],
            splits: null,
          })
        }
        pending = null
      }
    }
  }

  const holder = Object.values(cardNumToName)[0] ?? ''
  const sections: ParsedSection[] = [
    { name: 'Payments and Credits', kind: 'income', printedSubtotalCents: payCredTotal, rows: payCred },
    { name: 'New Charges', kind: 'expense', printedSubtotalCents: chargesTotal, rows: charges },
  ]
  const times = [...payCred, ...charges].map((r) => new Date(r.dateISO).getTime())
  return {
    bankId: amexGold.id,
    bankLabel: amexGold.label,
    accountHolder: holder,
    source: SOURCE,
    period: {
      start: new Date(times.length ? Math.min(...times) : 0),
      end: new Date(times.length ? Math.max(...times) : 0),
    },
    sections,
  }
}

export const amexGold: BankProfile = {
  id: 'amex',
  label: 'American Express Gold',
  source: SOURCE,
  detect,
  parse,
}
