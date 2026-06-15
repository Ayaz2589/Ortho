// Apple Card (Goldman Sachs) monthly statement PDF. Page 2 carries the data:
//   Payments     — ACH deposits paying the card (excluded as card-payment),
//                  reconciled against "Total payments for this period".
//   Transactions — the real charges, rows "MM/DD/YYYY <desc> N% $dailycash $amount",
//                  reconciled against "Total charges, credits and returns".
// Installments / Interest / Daily Cash / Legal are ignored (not new spending).
// Pure — no IO, no clock.
import type { TransactionKind } from '../../../lib/types'
import type { BankProfile, ParsedSection, ParsedStatement, ParsedTransaction } from '../engine/types'
import { parseAmountToCents } from '../engine/money'
import { categorize } from '../engine/categorize'

const SOURCE = 'Apple Card'

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Apple Card descriptions glue the merchant to its address; named rules for the
 *  common merchants, a best-effort fallback otherwise (operator can override). */
function cleanMerchant(desc: string): string {
  const U = desc.toUpperCase()
  if (/ACH DEPOSIT|INTERNET TRANSFER/.test(U)) return 'ACH Payment'
  if (/APPLE\.COM\/BILL/.test(U)) return 'Apple.com/Bill'
  if (/OPENAI|CHATGPT/.test(U)) return 'OpenAI'
  if (/CLAUDE\.AI/.test(U)) return 'Claude.ai'
  if (/\bWISPR\b/.test(U)) return 'Wispr'
  if (/AMAZON WEB SERVICES/.test(U)) return 'Amazon Web Services'
  if (/PEACOCK/.test(U)) return 'Peacock'
  if (/RETRO FITNESS/.test(U)) return 'Retro Fitness'

  let s = desc.replace(/^[A-Z]{2,5}\*\d*-?/i, '').replace(/\*/g, ' ')
  s = s.replace(/\d{2,}.*$/, '').replace(/\s+/g, ' ').trim()
  return titleCase(s || desc)
}

function detect(text: string): boolean {
  return /Apple Card is issued by Goldman Sachs Bank/.test(text)
}

function parse(pages: string[]): ParsedStatement {
  const lines = pages.join('\n').split('\n').map((l) => l.trim())
  const holder =
    lines.find((l) => /^[A-Za-z][A-Za-z.'-]*(?: [A-Za-z][A-Za-z.'-]*)+,\s+\S+@\S+\.\S+$/.test(l))?.split(',')[0] ?? ''

  const payments: ParsedTransaction[] = []
  const charges: ParsedTransaction[] = []
  let paymentsTotal = 0
  let chargesTotal = 0
  let section: 'payments' | 'transactions' | null = null

  const TXN_ROW = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d+)%\s+\$[\d,]+\.\d{2}\s+(-?\$[\d,]+\.\d{2})$/
  const PAY_ROW = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?\$[\d,]+\.\d{2})$/

  const dateISO = (mdy: string) => {
    const m = mdy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)!
    return `${m[3]}-${m[1]}-${m[2]}T12:00:00.000Z`
  }

  for (const line of lines) {
    if (line === 'Payments') {
      section = 'payments'
      continue
    }
    if (line === 'Transactions') {
      section = 'transactions'
      continue
    }
    let m = line.match(/^Total payments for this period\s+(-?\$[\d,]+\.\d{2})$/)
    if (m) {
      paymentsTotal = Math.abs(parseAmountToCents(m[1]))
      section = null
      continue
    }
    m = line.match(/^Total charges, credits and returns\s+(-?\$[\d,]+\.\d{2})$/)
    if (m) {
      chargesTotal = Math.abs(parseAmountToCents(m[1]))
      section = null
      continue
    }
    if (!section) continue

    if (section === 'transactions') {
      const t = line.match(TXN_ROW)
      if (t) {
        const signed = parseAmountToCents(t[4])
        const kind: TransactionKind = signed < 0 ? 'income' : 'expense'
        const merchant = cleanMerchant(t[2])
        charges.push({
          dateISO: dateISO(t[1]),
          rawDescription: t[2].replace(/\s+/g, ' ').trim(),
          merchant,
          amountCents: Math.abs(signed),
          kind,
          section: 'Transactions',
          category: kind === 'income' ? 'income' : categorize(merchant, 'expense'),
          excluded: false,
          excludeReason: null,
          duplicate: false,
          ownerIds: [],
          splits: null,
        })
      }
    } else if (section === 'payments') {
      const p = line.match(PAY_ROW)
      if (p) {
        payments.push({
          dateISO: dateISO(p[1]),
          rawDescription: p[2].replace(/\s+/g, ' ').trim(),
          merchant: cleanMerchant(p[2]),
          amountCents: Math.abs(parseAmountToCents(p[3])),
          kind: 'income',
          section: 'Payments',
          category: 'income',
          excluded: true,
          excludeReason: 'card-payment',
          duplicate: false,
          ownerIds: [],
          splits: null,
        })
      }
    }
  }

  const sections: ParsedSection[] = [
    { name: 'Payments', kind: 'income', printedSubtotalCents: paymentsTotal, rows: payments },
    { name: 'Transactions', kind: 'expense', printedSubtotalCents: chargesTotal, rows: charges },
  ]
  const times = [...payments, ...charges].map((r) => new Date(r.dateISO).getTime())
  return {
    bankId: appleCard.id,
    bankLabel: appleCard.label,
    accountHolder: holder,
    source: SOURCE,
    period: {
      start: new Date(times.length ? Math.min(...times) : 0),
      end: new Date(times.length ? Math.max(...times) : 0),
    },
    sections,
  }
}

export const appleCard: BankProfile = {
  id: 'apple',
  label: 'Apple Card (Goldman Sachs)',
  source: SOURCE,
  detect,
  parse,
}
