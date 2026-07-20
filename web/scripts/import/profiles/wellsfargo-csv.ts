// Wells Fargo credit-card "Activity" CSV export. No header row — positional columns:
//   [0] Date (MM/DD/YYYY), [1] Amount, [2] *, [3] *, [4] Description
// Negative Amount = expense; positive = income (payment/credit).
// Detection relies on positional shape since there is no header.
import type { TransactionCategory, TransactionKind } from '../../../lib/types'
import type { BankProfile, ParsedStatement, ParsedSection, ParsedTransaction } from '../engine/types'
import { parseAmountToCents } from '../engine/money'
import { categorize } from '../engine/categorize'
import { parseCsv, parseCsvLine, cleanMerchant, parseMMDDYYYY } from '../engine/csv'

const SOURCE = 'Wells Fargo'

function detect(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const cells = parseCsvLine(first)
  if (cells.length < 5) return false
  return (
    /^\d{2}\/\d{2}\/\d{4}$/.test(cells[0].trim()) &&
    /^-?\d+\.\d{2}$/.test(cells[1].trim()) &&
    cells[2].trim() === '*' &&
    cells[3].trim() === '*'
  )
}

function parse(pages: string[]): ParsedStatement {
  const rows = parseCsv(pages.join('\n'))

  const parsedRows: ParsedTransaction[] = rows.map((r) => {
    const signedCents = parseAmountToCents(r[1])
    const kind: TransactionKind = signedCents < 0 ? 'expense' : 'income'
    const rawDescription = (r[4] ?? '').replace(/\s+/g, ' ').trim()
    const merchant = cleanMerchant(rawDescription)
    const isPayment = kind === 'income' && /PAYMENT|THANK\s*YOU/i.test(rawDescription)
    const category: TransactionCategory = kind === 'income' ? 'income' : categorize(merchant, 'expense')

    return {
      dateISO: parseMMDDYYYY(r[0]),
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
    bankId: wellsFargoCsv.id,
    bankLabel: wellsFargoCsv.label,
    accountHolder: '',
    source: SOURCE,
    period,
    sections: [section],
    reconcilable: false,
  }
}

export const wellsFargoCsv: BankProfile = {
  id: 'wells-fargo',
  label: 'Wells Fargo (CSV)',
  source: SOURCE,
  detect,
  parse,
}
