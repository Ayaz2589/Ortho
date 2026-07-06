/**
 * Mortgage calculation utilities.
 * Ports MortgageInfo computed properties from the iOS app.
 *
 * Formula: M = P * r(1+r)^n / ((1+r)^n - 1)
 *   P = principal (original loan)
 *   r = monthly interest rate (annual / 12)
 *   n = total number of payments (years * 12)
 */

/**
 * Calculate the fixed monthly payment in cents.
 *
 * @param originalLoanCents - Original loan amount in cents
 * @param annualRatePercent - Annual interest rate as a percentage (e.g. 6.5 for 6.5%)
 * @param termYears - Loan term in years
 */
export function monthlyPaymentCents(
  originalLoanCents: number,
  annualRatePercent: number,
  termYears: number
): number {
  const P = originalLoanCents
  const r = annualRatePercent / 100 / 12
  const n = termYears * 12

  if (r === 0) {
    // Edge case: zero interest rate
    return Math.round(P / n)
  }

  const factor = Math.pow(1 + r, n)
  const M = P * (r * factor) / (factor - 1)
  return Math.round(M)
}

/**
 * Calculate the remaining principal balance in cents as of a given date.
 *
 * @param originalLoanCents - Original loan amount in cents
 * @param annualRatePercent - Annual interest rate as a percentage
 * @param termYears - Loan term in years
 * @param closingDate - ISO date string of the loan closing date
 * @param asOf - Date to calculate balance as of (defaults to today)
 */
// `parseLocalDate` lives in `web/lib/format.ts` (the shared date-helper module) so
// lease, payment, and closing-date rendering can reuse the same timezone-stable parse.
import { parseLocalDate } from '../format'

/**
 * Whole months elapsed between `closingDate` and `asOf`, clamped to
 * `0..totalMonths`. Matches Swift `Calendar.dateComponents([.month], ...)`:
 * day-aware, so a partial final month does not count.
 */
export function monthsElapsed(closingDate: string, asOf: Date, totalMonths: number): number {
  const closing = parseLocalDate(closingDate)
  let months = (asOf.getFullYear() - closing.getFullYear()) * 12 + (asOf.getMonth() - closing.getMonth())
  // Clamp the closing day to the asOf month's length before deciding whether the
  // final partial month counts. A month-end closing (e.g. Jan 31) reaches its
  // monthiversary at a shorter month's end (Feb 28), so that counts as a full
  // month — matching Swift `Calendar.dateComponents([.month])`. (Without the
  // clamp, `28 < 31` would wrongly drop a month.)
  const daysInAsOfMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate()
  const effectiveClosingDay = Math.min(closing.getDate(), daysInAsOfMonth)
  if (asOf.getDate() < effectiveClosingDay) months -= 1
  return Math.max(0, Math.min(totalMonths, months))
}

export function currentPrincipalBalanceCents(
  originalLoanCents: number,
  annualRatePercent: number,
  termYears: number,
  closingDate: string,
  asOf: Date = new Date()
): number {
  const P = originalLoanCents
  const r = annualRatePercent / 100 / 12
  const n = termYears * 12

  const k = monthsElapsed(closingDate, asOf, n)
  // Match Swift exactly: recurrence using the *rounded* monthly payment.
  //   B(k) = P·(1+r)^k − M·((1+r)^k − 1)/r       (P, M in cents)
  const M = monthlyPaymentCents(originalLoanCents, annualRatePercent, termYears)

  if (r === 0) {
    return Math.max(0, Math.round(P - M * k))
  }

  const factor = Math.pow(1 + r, k)
  const balance = P * factor - (M * (factor - 1)) / r
  return Math.max(0, Math.round(balance))
}

/**
 * Calculate current equity in cents.
 *
 * @param purchasePriceCents - Original purchase price in cents
 * @param originalLoanCents - Original loan amount in cents
 * @param annualRatePercent - Annual interest rate as a percentage
 * @param termYears - Loan term in years
 * @param closingDate - ISO date string of the loan closing date
 * @param asOf - Date to calculate equity as of (defaults to today)
 */
export function currentEquityCents(
  purchasePriceCents: number,
  originalLoanCents: number,
  annualRatePercent: number,
  termYears: number,
  closingDate: string,
  asOf: Date = new Date()
): number {
  const balance = currentPrincipalBalanceCents(
    originalLoanCents,
    annualRatePercent,
    termYears,
    closingDate,
    asOf
  )
  // iOS: equity = max(0, purchasePrice − currentBalance)
  return Math.max(0, purchasePriceCents - balance)
}

/**
 * Calculate equity as a fraction of purchase price, clamped to 0–1.
 */
export function equityFraction(
  purchasePriceCents: number,
  originalLoanCents: number,
  annualRatePercent: number,
  termYears: number,
  closingDate: string,
  asOf: Date = new Date()
): number {
  if (purchasePriceCents === 0) return 0
  const equity = currentEquityCents(
    purchasePriceCents,
    originalLoanCents,
    annualRatePercent,
    termYears,
    closingDate,
    asOf
  )
  return Math.min(1, Math.max(0, equity / purchasePriceCents))
}

/** Loan maturity date = closing date + term months (local calendar). */
export function maturityDate(closingDate: string, termYears: number): Date {
  const d = parseLocalDate(closingDate)
  d.setMonth(d.getMonth() + termYears * 12)
  return d
}

/**
 * Whole years remaining until maturity. Matches Swift
 * `Calendar.dateComponents([.year], from: asOf, to: maturity)` — day-aware.
 */
export function yearsRemaining(
  closingDate: string,
  termYears: number,
  asOf: Date = new Date()
): number {
  const maturity = maturityDate(closingDate, termYears)
  let years = maturity.getFullYear() - asOf.getFullYear()
  if (
    maturity.getMonth() < asOf.getMonth() ||
    (maturity.getMonth() === asOf.getMonth() && maturity.getDate() < asOf.getDate())
  ) {
    years -= 1
  }
  return Math.max(0, years)
}

export interface AmortizationEntry {
  month: Date
  principalCents: number
  interestCents: number
}

/**
 * Generate upcoming amortization schedule entries.
 *
 * @param months - Number of months to project
 * @param originalLoanCents - Original loan amount in cents
 * @param annualRatePercent - Annual interest rate as a percentage
 * @param termYears - Loan term in years
 * @param closingDate - ISO date string of the loan closing date
 * @param asOf - Starting date for upcoming payments (defaults to today)
 */
export function upcomingAmortization(
  months: number,
  originalLoanCents: number,
  annualRatePercent: number,
  termYears: number,
  closingDate: string,
  asOf: Date = new Date()
): AmortizationEntry[] {
  const r = annualRatePercent / 100 / 12
  const n = termYears * 12

  // Mirror Swift exactly: work in dollars, no early break, no principal clamp,
  // start the date at `asOf` (not normalized to the 1st).
  let balance =
    currentPrincipalBalanceCents(originalLoanCents, annualRatePercent, termYears, closingDate, asOf) / 100
  const m = monthlyPaymentCents(originalLoanCents, annualRatePercent, termYears) / 100
  const result: AmortizationEntry[] = []
  // Advance the label by whole calendar months from `asOf`, clamping the day to
  // each target month's length — mirroring Swift `Calendar.date(byAdding:.month)`.
  // (The old `setMonth(base + i)` on a fixed base date overflowed short months:
  // Jan 31 + 1mo → Mar 3, skipping February and duplicating March.) The
  // principal/interest values below are unaffected — they depend only on the
  // amortization recurrence, not the label date, so the golden vector stays green.
  const baseYear = asOf.getFullYear()
  const baseMonth = asOf.getMonth()
  const baseDay = asOf.getDate()

  for (let i = 0; i < months; i++) {
    const interest = balance * r
    const principal = Math.max(0, m - interest)
    const daysInTargetMonth = new Date(baseYear, baseMonth + i + 1, 0).getDate()
    const month = new Date(baseYear, baseMonth + i, Math.min(baseDay, daysInTargetMonth))
    result.push({
      month,
      principalCents: Math.round(principal * 100),
      interestCents: Math.round(interest * 100),
    })
    balance = Math.max(0, balance - principal)
  }

  return result
}
