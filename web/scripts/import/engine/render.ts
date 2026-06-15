// Money-aligned table + single-row detail for the tx CLI. Pure (string in/out).
import type { Transaction } from '../../../lib/types'
import { formatMoney } from '../../../lib/finance/money'

/** Income gets +$, expense gets −$ (Unicode minus) — Principle IV. */
function money(t: Pick<Transaction, 'amount_cents' | 'kind'>): string {
  return t.kind === 'income' ? formatMoney(t.amount_cents, 'usd', 1, true) : `−${formatMoney(t.amount_cents)}`
}

const shortId = (id: string) => id.slice(0, 8)
const day = (iso: string) => new Date(iso).toISOString().slice(0, 10)
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s).padEnd(n)

export function renderTable(rows: Transaction[]): string {
  if (rows.length === 0) return 'No transactions match.'
  const header = `${'id'.padEnd(8)}  ${'date'.padEnd(10)}  ${trunc('merchant', 24)} ${'amount'.padStart(12)}  ${'category'.padEnd(13)} ${'scope'.padEnd(8)}  source`
  const lines = rows.map(
    (t) =>
      `${shortId(t.id)}  ${day(t.date)}  ${trunc(t.merchant, 24)} ${money(t).padStart(12)}  ${t.category.padEnd(13)} ${t.scope.padEnd(8)}  ${t.source}`
  )
  return [header, ...lines, `(${rows.length} transaction${rows.length === 1 ? '' : 's'})`].join('\n')
}

export function renderDetail(t: Transaction): string {
  const owners = t.owner_ids?.length ? t.owner_ids.join(', ') : t.created_by
  return [
    `  id:       ${t.id}`,
    `  date:     ${day(t.date)}`,
    `  merchant: ${t.merchant}`,
    `  amount:   ${money(t)}`,
    `  category: ${t.category}`,
    `  kind:     ${t.kind}`,
    `  scope:    ${t.scope}`,
    `  source:   ${t.source || '—'}`,
    `  owners:   ${owners}${t.splits ? `  splits ${JSON.stringify(t.splits)}` : ''}`,
  ].join('\n')
}
