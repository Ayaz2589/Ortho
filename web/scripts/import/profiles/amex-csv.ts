// Amex credit-card "Activity" CSV export. Columns:
//   Date, Description, Card Member, Account #, Amount
// Positive Amount = charge (expense); negative = payment/credit.
// Card Member column enables multi-cardholder owner matching.
import type { TransactionCategory, TransactionKind } from '../../../lib/types'
import type { BankProfile, ParsedStatement, ParsedSection, ParsedTransaction } from '../engine/types'
import { parseAmountToCents } from '../engine/money'
import { categorize } from '../engine/categorize'
import { parseCsv } from '../engine/csv'

const SOURCE = 'Amex'
const HEADER_PREFIX = 'Date,Description,Card Member,Account #,Amount'

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function cleanMerchant(desc: string): string {
  const stripped = desc.replace(/\*[A-Za-z0-9]{4,}\b/g, '').replace(/\s+/g, ' ').trim()
  return titleCase(stripped || desc)
}

function parseMMDDYYYY(s: string): string {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) throw new Error(`AMEX_BAD_DATE: ${JSON.stringify(s)}`)
  return `${m[3]}-${m[1]}-${m[2]}T12:00:00.000Z`
}

function detect(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  return first.trim().startsWith(HEADER_PREFIX)
}

function parse(pages: string[]): ParsedStatement {
  const rows = parseCsv(pages.join('\n'))
  const header = rows[0].map((c) => c.trim())
  const col = (name: string) => header.indexOf(name)
  const iDate = col('Date')
  const iDesc = col('Description')
  const iCardMember = col('Card Member')
  const iAmt = col('Amount')

  const parsedRows: ParsedTransaction[] = rows.slice(1).map((r) => {
    const signedCents = parseAmountToCents(r[iAmt])
    const kind: TransactionKind = signedCents < 0 ? 'income' : 'expense'
    const rawDescription = (r[iDesc] ?? '').replace(/\s+/g, ' ').trim()
    const merchant = cleanMerchant(rawDescription)
    const isPayment = kind === 'income' && /PAYMENT/i.test(rawDescription)
    const category: TransactionCategory = kind === 'income' ? 'income' : categorize(merchant, 'expense')
    return {
      dateISO: parseMMDDYYYY(r[iDate]),
      rawDescription,
      merchant,
      amountCents: Math.abs(signedCents),
      kind,
      section: 'Transactions',
      category,
      excluded: isPayment,
      excludeReason: isPayment ? 'card-payment' : null,
      duplicate: false,
      cardMember: (r[iCardMember] ?? '').trim() || undefined,
      ownerIds: [],
      splits: null,
    }
  })

  const times = parsedRows.map((r) => new Date(r.dateISO).getTime())
  const period = {
    start: new Date(times.length ? Math.min(...times) : 0),
    end: new Date(times.length ? Math.max(...times) : 0),
  }
  const section: ParsedSection = {
    name: 'Transactions',
    kind: 'expense',
    printedSubtotalCents: parsedRows.reduce((s, r) => s + r.amountCents, 0),
    rows: parsedRows,
  }

  return {
    bankId: amexCsv.id,
    bankLabel: amexCsv.label,
    accountHolder: '',
    source: SOURCE,
    period,
    sections: [section],
    reconcilable: false,
  }
}

export const amexCsv: BankProfile = {
  id: 'amex-csv',
  label: 'Amex (Credit Card CSV)',
  source: SOURCE,
  detect,
  parse,
}
