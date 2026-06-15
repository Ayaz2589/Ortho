// TD Bank Premier Checking profile. Knows this statement's layout: section
// meanings, MM/DD row grouping (inline amount OR amount on its own line after
// wrapped continuation lines), the Checks-Paid form, and merchant cleanup.
// Pure — no IO, no clock. See contracts/bank-profile.md.
import type { TransactionKind } from '../../../lib/types'
import type { BankProfile, ParsedSection, ParsedStatement, ParsedTransaction } from '../engine/types'
import { parseStatementPeriod, resolveStatementDate } from '../engine/dates'
import { parseAmountToCents, isAmountToken } from '../engine/money'
import { categorize } from '../engine/categorize'
import { classifyExclusion } from '../engine/exclusions'

const SOURCE = 'TD Bank'

// Activity sections, most-specific name first ("Electronic Deposits" before "Deposits").
const SECTIONS: Array<{ name: string; kind: TransactionKind }> = [
  { name: 'Electronic Deposits', kind: 'income' },
  { name: 'Other Credits', kind: 'income' },
  { name: 'Electronic Payments', kind: 'expense' },
  { name: 'Other Withdrawals', kind: 'expense' },
  { name: 'Service Charges', kind: 'expense' },
  { name: 'Checks Paid', kind: 'expense' },
  { name: 'Deposits', kind: 'income' },
]

const COLUMN_HEADERS = new Set(['POSTING DATE DESCRIPTION AMOUNT', 'DATE SERIAL NO. AMOUNT'])

function matchSection(line: string): { name: string; kind: TransactionKind } | null {
  for (const s of SECTIONS) {
    if (line === s.name || line === `${s.name} (continued)`) return s
    if (s.name === 'Checks Paid' && line.startsWith('Checks Paid')) return s
  }
  return null
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Collapse a raw bank description into a human merchant name. */
function cleanMerchant(raw: string): string {
  const r = raw.replace(/\s+/g, ' ').trim()
  const U = r.toUpperCase()

  const zelle = r.match(/ZELLE\s+(?:RECEIVED|SENT),?\s+\S+\s+Zelle\s+(.+)/i)
  if (zelle) return `Zelle · ${titleCase(zelle[1])}`

  if (/MOBILE DEPOSIT/.test(U)) return 'Mobile Deposit'
  if (/CROSSTERRA/.test(U) && /PAYROLL/.test(U)) return 'Crossterra Payroll'
  if (/INTEREST PAID/.test(U)) return 'Interest Paid'
  if (/CON\s*ED/.test(U)) return 'Con Edison'
  if (/VERIZON/.test(U)) return 'Verizon'
  if (/AMEX EPAYMENT/.test(U)) return 'Amex Payment'
  if (/APPLECARD/.test(U)) return 'Apple Card Payment'
  if (/CHASE CREDIT CRD/.test(U)) return 'Chase Credit Card'
  if (/WEALTHFRONT/.test(U)) return 'Wealthfront'
  if (/NONTD ATM|ATM DB AP|DDA WITHDRAW/.test(U)) return 'ATM Withdrawal'
  if (/TRANSFER TO (?:SV|SAVINGS)/.test(U)) return 'Transfer to Savings'
  if (/TRANSFER FROM (?:SV|SAVINGS)/.test(U)) return 'Transfer from Savings'
  if (/TRANSFER TO ML/.test(U)) return 'Transfer to ML'
  if (/MAINTENANCE FEE/.test(U)) return 'Maintenance Fee'

  // Fallback: drop a leading "TYPE, " prefix and trailing reference tokens.
  let s = r.replace(/^[A-Z0-9 /\-]+?,\s*/, '')
  s = s.replace(/\*+\d+\w*/g, ' ').replace(/\b[A-Z0-9]{8,}\b/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return titleCase(s || r)
}

function makeRow(
  dateISO: string,
  rawDescription: string,
  amountCents: number,
  kind: TransactionKind,
  section: string
): ParsedTransaction {
  const merchant = cleanMerchant(rawDescription)
  const { excluded, reason } = classifyExclusion(rawDescription)
  return {
    dateISO,
    rawDescription: rawDescription.replace(/\s+/g, ' ').trim(),
    merchant,
    amountCents,
    kind,
    section,
    category: categorize(merchant, kind),
    excluded,
    excludeReason: reason,
    duplicate: false,
    ownerIds: [],
    splits: null,
  }
}

function detect(text: string): boolean {
  return /TD Bank, N\.A\./.test(text) && (/TD Premier Checking/.test(text) || /tdbank\.com/.test(text))
}

function parse(pages: string[]): ParsedStatement {
  const full = pages.join('\n')
  const period = parseStatementPeriod(full)
  const accountHolder =
    pages[0]
      ?.split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? ''

  const lines = full.split('\n').map((l) => l.trim())
  const order: ParsedSection[] = []
  const byName = new Map<string, ParsedSection>()
  const getSection = (name: string, kind: TransactionKind): ParsedSection => {
    let sec = byName.get(name)
    if (!sec) {
      sec = { name, kind, printedSubtotalCents: 0, rows: [] }
      byName.set(name, sec)
      order.push(sec)
    }
    return sec
  }

  let inActivity = false
  let current: ParsedSection | null = null
  // A row whose amount has not yet been seen (wrapped onto later lines).
  let pending: { dateISO: string; descParts: string[]; kind: TransactionKind; section: string } | null = null

  const closePending = () => {
    // A pending row that never found an amount means a layout we don't handle;
    // reconciliation will surface it. Drop it rather than invent a number.
    pending = null
  }

  for (const line of lines) {
    if (!line) continue
    if (line === 'DAILY ACCOUNT ACTIVITY') {
      inActivity = true
      continue
    }

    if (inActivity) {
      const sec = matchSection(line)
      if (sec) {
        closePending()
        current = getSection(sec.name, sec.kind)
        continue
      }
    }
    if (!current) continue
    if (COLUMN_HEADERS.has(line)) continue

    if (line.startsWith('Subtotal:')) {
      closePending()
      current.printedSubtotalCents = parseAmountToCents(line.replace('Subtotal:', '').trim())
      current = null
      continue
    }

    // Checks Paid: "MM/DD SERIAL AMOUNT"
    if (current.name === 'Checks Paid') {
      const c = line.match(/^(\d{2}\/\d{2})\s+(\d+)\s+([\d,]+\.\d{2})$/)
      if (c) {
        current.rows.push(
          makeRow(
            resolveStatementDate(c[1], period),
            `Check #${c[2]}`,
            parseAmountToCents(c[3]),
            'expense',
            current.name
          )
        )
      }
      continue
    }

    const dateMatch = line.match(/^(\d{2}\/\d{2})\s+(.*)$/)
    if (dateMatch) {
      closePending()
      const rest = dateMatch[2]
      const inline = rest.match(/^(.*?)\s+([\d,]+\.\d{2})$/)
      if (inline) {
        current.rows.push(
          makeRow(resolveStatementDate(dateMatch[1], period), inline[1], parseAmountToCents(inline[2]), current.kind, current.name)
        )
      } else {
        pending = { dateISO: resolveStatementDate(dateMatch[1], period), descParts: [rest], kind: current.kind, section: current.name }
      }
      continue
    }

    if (pending) {
      if (isAmountToken(line)) {
        current.rows.push(makeRow(pending.dateISO, pending.descParts.join(' '), parseAmountToCents(line), pending.kind, pending.section))
        pending = null
      } else {
        const trail = line.match(/^(.*?)\s+([\d,]+\.\d{2})$/)
        if (trail) {
          pending.descParts.push(trail[1])
          current.rows.push(makeRow(pending.dateISO, pending.descParts.join(' '), parseAmountToCents(trail[2]), pending.kind, pending.section))
          pending = null
        } else {
          pending.descParts.push(line)
        }
      }
    }
  }

  return {
    bankId: tdBank.id,
    bankLabel: tdBank.label,
    accountHolder,
    source: SOURCE,
    period,
    sections: order,
  }
}

export const tdBank: BankProfile = {
  id: 'td',
  label: 'TD Bank (Premier Checking)',
  source: SOURCE,
  detect,
  parse,
}
