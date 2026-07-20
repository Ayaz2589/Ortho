// Bank of America credit-card "Activity" CSV export. Columns:
//   Posted Date, Reference Number, Payee, Address, Amount
// Negative Amount = expense; positive = income (payment/credit).
// Address column is ignored (not shown as part of merchant).
// Payment rows detected by /PAYMENT/i in Payee.
import type { TransactionCategory, TransactionKind } from '../../../lib/types'
import type { BankProfile, ParsedStatement, ParsedSection, ParsedTransaction } from '../engine/types'
import { parseAmountToCents } from '../engine/money'
import { categorize } from '../engine/categorize'
import { parseCsv, cleanMerchant, parseMMDDYYYY } from '../engine/csv'

const SOURCE = 'Bank of America'
const HEADER_KEYS = ['Posted Date', 'Reference Number', 'Payee', 'Address', 'Amount']

function detect(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const cells = first.split(',').map((c) => c.trim())
  return HEADER_KEYS.every((k, i) => cells[i] === k)
}

function parse(pages: string[]): ParsedStatement {
  const rows = parseCsv(pages.join('\n'))
  const header = rows[0].map((c) => c.trim())
  const col = (name: string) => header.indexOf(name)
  const iDate = col('Posted Date')
  const iPayee = col('Payee')
  const iAmt = col('Amount')

  const parsedRows: ParsedTransaction[] = rows.slice(1).map((r) => {
    const signedCents = parseAmountToCents(r[iAmt])
    const kind: TransactionKind = signedCents < 0 ? 'expense' : 'income'
    const rawDescription = (r[iPayee] ?? '').replace(/\s+/g, ' ').trim()
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
    bankId: bofaCsv.id,
    bankLabel: bofaCsv.label,
    accountHolder: '',
    source: SOURCE,
    period,
    sections: [section],
    reconcilable: false,
  }
}

export const bofaCsv: BankProfile = {
  id: 'bofa',
  label: 'Bank of America (CSV)',
  source: SOURCE,
  detect,
  parse,
}
