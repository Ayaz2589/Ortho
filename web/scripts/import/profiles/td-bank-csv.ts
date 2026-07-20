// TD Bank checking-account "Activity" CSV export. Columns:
//   Date, Description, Credit, Debit, Balance
// Distinct from td-bank.ts which parses TD Bank PDF statements.
// Credit = income (direct deposit, refund); Debit = expense.
// Balance column is ignored. No card-payment exclusion for checking accounts
// (income rows are direct deposits, not card bill payments).
import type { TransactionCategory, TransactionKind } from '../../../lib/types'
import type { BankProfile, ParsedStatement, ParsedSection, ParsedTransaction } from '../engine/types'
import { parseAmountToCents } from '../engine/money'
import { categorize } from '../engine/categorize'
import { parseCsv } from '../engine/csv'

const SOURCE = 'TD Bank'
const HEADER_KEYS = ['Date', 'Description', 'Credit', 'Debit', 'Balance']

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
  if (!m) throw new Error(`TD_BANK_CSV_BAD_DATE: ${JSON.stringify(s)}`)
  return `${m[3]}-${m[1]}-${m[2]}T12:00:00.000Z`
}

function detect(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const cells = first.split(',').map((c) => c.trim())
  return HEADER_KEYS.every((k, i) => cells[i] === k)
}

function parse(pages: string[]): ParsedStatement {
  const rows = parseCsv(pages.join('\n'))
  const header = rows[0].map((c) => c.trim())
  const col = (name: string) => header.indexOf(name)
  const iDate = col('Date')
  const iDesc = col('Description')
  const iCredit = col('Credit')
  const iDebit = col('Debit')

  const parsedRows: ParsedTransaction[] = rows.slice(1).map((r) => {
    const creditStr = (r[iCredit] ?? '').trim()
    const debitStr = (r[iDebit] ?? '').trim()
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

    const category: TransactionCategory = kind === 'income' ? 'income' : categorize(merchant, 'expense')

    return {
      dateISO: parseMMDDYYYY(r[iDate]),
      rawDescription,
      merchant,
      amountCents,
      kind,
      section: 'Transactions',
      category,
      excluded: false,
      excludeReason: null,
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
    bankId: tdBankCsv.id,
    bankLabel: tdBankCsv.label,
    accountHolder: '',
    source: SOURCE,
    period,
    sections: [section],
    reconcilable: false,
  }
}

export const tdBankCsv: BankProfile = {
  id: 'td-bank-csv',
  label: 'TD Bank (Checking CSV)',
  source: SOURCE,
  detect,
  parse,
}
