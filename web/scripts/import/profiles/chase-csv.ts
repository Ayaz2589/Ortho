// Chase credit-card "Activity" CSV export. Columns:
//   Transaction Date, Post Date, Description, Category, Type, Amount, Memo
// Negative Amount = charge (expense); positive = payment/credit. Type=Payment is
// the card payment (excluded — not spending). CSVs carry no control total, so the
// statement is marked reconcilable:false. Pure — no IO, no clock.
import type { TransactionCategory, TransactionKind } from '../../../lib/types'
import type { BankProfile, ParsedStatement, ParsedSection, ParsedTransaction } from '../engine/types'
import { parseAmountToCents } from '../engine/money'
import { categorize } from '../engine/categorize'
import { parseCsv, cleanMerchant, parseMMDDYYYY } from '../engine/csv'

const SOURCE = 'Chase'
const HEADER_KEYS = ['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount']

// Chase's own category → Ortho category. Unmapped/blank falls back to the
// merchant-rule categorizer, then 'entertainment'.
const CHASE_CATEGORY: Record<string, TransactionCategory> = {
  'bills & utilities': 'utilities',
  groceries: 'groceries',
  'food & drink': 'dining',
  gas: 'fuel',
  automotive: 'fuel',
  travel: 'transit',
  'health & wellness': 'health',
  entertainment: 'entertainment',
  shopping: 'entertainment',
  personal: 'entertainment',
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
  const iDate = col('Transaction Date')
  const iDesc = col('Description')
  const iCat = col('Category')
  const iType = col('Type')
  const iAmt = col('Amount')

  const parsedRows: ParsedTransaction[] = rows.slice(1).map((r) => {
    const signedCents = parseAmountToCents(r[iAmt])
    const kind: TransactionKind = signedCents < 0 ? 'expense' : 'income'
    const merchant = cleanMerchant(r[iDesc])
    const type = (r[iType] ?? '').trim()
    const excluded = /^payment$/i.test(type)
    const chaseCat = (r[iCat] ?? '').toLowerCase().trim()
    const category: TransactionCategory =
      kind === 'income' ? 'income' : CHASE_CATEGORY[chaseCat] ?? categorize(merchant, 'expense')
    return {
      dateISO: parseMMDDYYYY(r[iDate]),
      rawDescription: (r[iDesc] ?? '').replace(/\s+/g, ' ').trim(),
      merchant,
      amountCents: Math.abs(signedCents),
      kind,
      section: 'Transactions',
      category,
      excluded,
      excludeReason: excluded ? 'card-payment' : null,
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
    // No printed control total in a CSV — reconciliation is skipped (reconcilable:false).
    printedSubtotalCents: parsedRows.reduce((s, r) => s + r.amountCents, 0),
    rows: parsedRows,
  }

  return {
    bankId: chaseCsv.id,
    bankLabel: chaseCsv.label,
    accountHolder: '',
    source: SOURCE,
    period,
    sections: [section],
    reconcilable: false,
  }
}

export const chaseCsv: BankProfile = {
  id: 'chase',
  label: 'Chase (Credit Card CSV)',
  source: SOURCE,
  detect,
  parse,
}
