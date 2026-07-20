// Capital One credit-card "Activity" CSV export. Columns:
//   Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
// Dates are ISO format (YYYY-MM-DD). Debit = expense; Credit = income.
// Payment rows detected by /PAYMENT/i in Description.
import type { TransactionCategory, TransactionKind } from '../../../lib/types'
import type { BankProfile, ParsedStatement, ParsedSection, ParsedTransaction } from '../engine/types'
import { parseAmountToCents } from '../engine/money'
import { categorize } from '../engine/categorize'
import { parseCsv, cleanMerchant, parseYYYYMMDD } from '../engine/csv'

const SOURCE = 'Capital One'
const HEADER_KEYS = ['Transaction Date', 'Posted Date', 'Card No.', 'Description', 'Category', 'Debit', 'Credit']

function detect(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const cells = first.split(',').map((c) => c.trim())
  return HEADER_KEYS.every((k, i) => cells[i] === k)
}

function parse(pages: string[]): ParsedStatement {
  const rows = parseCsv(pages.join('\n'))
  const header = rows[0].map((c) => c.trim())
  const col = (name: string) => header.indexOf(name)
  const iDate = col('Transaction Date')
  const iDesc = col('Description')
  const iDebit = col('Debit')
  const iCredit = col('Credit')

  const parsedRows: ParsedTransaction[] = rows.slice(1).map((r) => {
    const debitStr = (r[iDebit] ?? '').trim()
    const creditStr = (r[iCredit] ?? '').trim()
    const rawDescription = (r[iDesc] ?? '').replace(/\s+/g, ' ').trim()
    const merchant = cleanMerchant(rawDescription)

    let kind: TransactionKind
    let amountCents: number
    if (debitStr) {
      kind = 'expense'
      amountCents = parseAmountToCents(debitStr)
    } else {
      kind = 'income'
      amountCents = parseAmountToCents(creditStr)
    }

    const isPayment = kind === 'income' && /PAYMENT/i.test(rawDescription)
    const category: TransactionCategory = kind === 'income' ? 'income' : categorize(merchant, 'expense')

    return {
      dateISO: parseYYYYMMDD(r[iDate]),
      rawDescription,
      merchant,
      amountCents,
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
    bankId: capitalOneCsv.id,
    bankLabel: capitalOneCsv.label,
    accountHolder: '',
    source: SOURCE,
    period,
    sections: [section],
    reconcilable: false,
  }
}

export const capitalOneCsv: BankProfile = {
  id: 'capital-one',
  label: 'Capital One (Credit Card CSV)',
  source: SOURCE,
  detect,
  parse,
}
