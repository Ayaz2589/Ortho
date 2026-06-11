import Foundation

/// Mortgage parameters captured at loan origination. Everything downstream
/// (current balance, equity, amortization schedule, maturity) is computed
/// from these via the standard fixed-rate amortization formula.
struct MortgageInfo: Hashable, Codable {
    /// USD cents — sale price at closing. Used as the basis for current
    /// equity (`purchasePrice - currentBalance`).
    var purchasePrice: Int64
    /// USD cents — the original loan principal.
    var originalLoan: Int64
    /// Annual interest rate as a percentage. e.g. `6.85` for 6.85%.
    var annualInterestRatePercent: Decimal
    /// Loan term in years (most US mortgages are 15 or 30).
    var loanTermYears: Int
    /// Date the loan closed — month 0 of the amortization clock.
    var closingDate: Date
    /// Free-form payment source. Stored as a string (same pattern as
    /// `Transaction.source`) so it survives card renames/deletes.
    var autoPaySource: String?

    init(purchasePrice: Int64,
         originalLoan: Int64,
         annualInterestRatePercent: Decimal,
         loanTermYears: Int,
         closingDate: Date,
         autoPaySource: String? = nil) {
        self.purchasePrice = purchasePrice
        self.originalLoan = originalLoan
        self.annualInterestRatePercent = annualInterestRatePercent
        self.loanTermYears = loanTermYears
        self.closingDate = closingDate
        self.autoPaySource = autoPaySource
    }

    // MARK: - Derived

    /// Total number of monthly payments over the loan's life.
    var totalMonths: Int { loanTermYears * 12 }

    /// Monthly rate as a decimal (0.0685 / 12 ≈ 0.005708).
    var monthlyRate: Double {
        NSDecimalNumber(decimal: annualInterestRatePercent).doubleValue / 100.0 / 12.0
    }

    /// Standard fixed-rate monthly payment formula:
    ///   M = P · r(1+r)^n / ((1+r)^n − 1)
    /// where P is principal in dollars, r is monthly rate, n is total months.
    /// Returns the payment in USD cents.
    ///
    /// Zero-interest case (`r == 0`) falls back to flat amortization
    /// (`principal / months`) — the standard formula divides by zero. Rare in
    /// practice (family loans, employer assistance) but covered so the
    /// downstream balance / amortization math stays consistent.
    var monthlyPaymentCents: Int64 {
        guard totalMonths > 0 else { return 0 }
        let r = monthlyRate
        guard r > 0 else {
            return Int64(
                (Double(originalLoan) / Double(totalMonths)).rounded()
            )
        }
        let p = Double(originalLoan) / 100.0
        let n = Double(totalMonths)
        let factor = pow(1 + r, n)
        let dollarsPerMonth = p * (r * factor) / (factor - 1)
        return Int64((dollarsPerMonth * 100).rounded())
    }

    /// Months elapsed between `closingDate` and `referenceDate`. Clamped to
    /// `0...totalMonths` so we don't extrapolate past the maturity date.
    func monthsElapsed(asOf referenceDate: Date = .now,
                       calendar: Calendar = .current) -> Int {
        let comps = calendar.dateComponents([.month], from: closingDate, to: referenceDate)
        let m = max(0, comps.month ?? 0)
        return min(m, totalMonths)
    }

    /// Principal balance after `monthsElapsed` payments. Standard formula:
    ///   B(k) = P · (1+r)^k − M · ((1+r)^k − 1)/r
    /// where M is the monthly payment in dollars.
    func currentPrincipalBalanceCents(asOf referenceDate: Date = .now,
                                      calendar: Calendar = .current) -> Int64 {
        let k = monthsElapsed(asOf: referenceDate, calendar: calendar)
        let p = Double(originalLoan) / 100.0
        let r = monthlyRate
        let m = Double(monthlyPaymentCents) / 100.0
        guard r > 0 else {
            // Interest-free loan — flat amortization.
            let remaining = p - m * Double(k)
            return Int64(max(0, remaining * 100).rounded())
        }
        let factor = pow(1 + r, Double(k))
        let balance = p * factor - m * (factor - 1) / r
        return Int64(max(0, balance * 100).rounded())
    }

    /// `purchasePrice - currentPrincipalBalance`. Negative is possible in
    /// theory (closing costs > principal paid) but we clamp at 0 because
    /// the equity display is always non-negative.
    func currentEquityCents(asOf referenceDate: Date = .now) -> Int64 {
        let balance = currentPrincipalBalanceCents(asOf: referenceDate)
        return max(0, purchasePrice - balance)
    }

    /// Equity as a fraction (0...1) for the progress bar.
    func equityFraction(asOf referenceDate: Date = .now) -> Double {
        guard purchasePrice > 0 else { return 0 }
        return min(1, max(0, Double(currentEquityCents(asOf: referenceDate)) / Double(purchasePrice)))
    }

    /// Date the loan is fully paid (`closingDate + totalMonths`).
    var maturityDate: Date {
        Calendar.current.date(byAdding: .month, value: totalMonths, to: closingDate)
            ?? closingDate
    }

    /// Years remaining until maturity.
    func yearsRemaining(asOf referenceDate: Date = .now) -> Int {
        let comps = Calendar.current.dateComponents([.year], from: referenceDate, to: maturityDate)
        return max(0, comps.year ?? 0)
    }

    // MARK: - Amortization schedule

    /// Principal + interest breakdown for a single month, given balance at
    /// the start of that month.
    struct MonthlyBreakdown: Hashable {
        let month: Date
        let principalCents: Int64
        let interestCents: Int64
    }

    /// Returns the next `months` months of amortization starting from the
    /// upcoming payment date. Each entry splits that month's payment into
    /// principal vs interest. Used by the amortization chart.
    func upcomingAmortization(months: Int,
                              asOf referenceDate: Date = .now,
                              calendar: Calendar = .current) -> [MonthlyBreakdown] {
        let r = monthlyRate
        let m = Double(monthlyPaymentCents) / 100.0
        var balance = Double(currentPrincipalBalanceCents(asOf: referenceDate)) / 100.0
        var results: [MonthlyBreakdown] = []
        var nextDate = referenceDate
        for _ in 0..<months {
            let interest = balance * r
            let principal = max(0, m - interest)
            results.append(.init(
                month: nextDate,
                principalCents: Int64((principal * 100).rounded()),
                interestCents:  Int64((interest * 100).rounded())
            ))
            balance = max(0, balance - principal)
            nextDate = calendar.date(byAdding: .month, value: 1, to: nextDate) ?? nextDate
        }
        return results
    }
}
