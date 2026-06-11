import Foundation

/// Rental lease parameters — when the user is the renter.
struct LeaseInfo: Hashable, Codable {
    /// USD cents — monthly rent payment.
    var monthlyRent: Int64
    var leaseStart: Date
    var leaseEnd: Date
    /// Optional security deposit (USD cents). `nil` means not tracked.
    var securityDepositCents: Int64?
    /// Where rent gets paid from (e.g. "Chase Sapphire", "ACH · Joint").
    /// String for the same reason as `Transaction.source` — resilient to
    /// card renames/deletes.
    var paidWithSource: String?

    init(monthlyRent: Int64,
         leaseStart: Date,
         leaseEnd: Date,
         securityDepositCents: Int64? = nil,
         paidWithSource: String? = nil) {
        self.monthlyRent = monthlyRent
        self.leaseStart = leaseStart
        self.leaseEnd = leaseEnd
        self.securityDepositCents = securityDepositCents
        self.paidWithSource = paidWithSource
    }

    /// Days between `referenceDate` and `leaseEnd`. Negative if the lease
    /// already ended.
    func daysUntilEnd(asOf referenceDate: Date = .now,
                      calendar: Calendar = .current) -> Int {
        calendar.dateComponents([.day],
                                from: calendar.startOfDay(for: referenceDate),
                                to: calendar.startOfDay(for: leaseEnd)).day ?? 0
    }

    /// True when the lease is within 60 days of ending — used to drive an
    /// in-app reminder banner.
    func isRenewalSoon(asOf referenceDate: Date = .now) -> Bool {
        let d = daysUntilEnd(asOf: referenceDate)
        return d >= 0 && d <= 60
    }

    /// Day of the month rent is "due" — derived from `leaseStart`.
    var rentDueDay: Int {
        Calendar.current.component(.day, from: leaseStart)
    }

    /// Days until the next rent-due date, given the current calendar month.
    /// Returns 0..30 ish; never negative (always rolls to next month).
    func daysUntilNextRent(asOf referenceDate: Date = .now,
                           calendar: Calendar = .current) -> Int {
        let today = calendar.startOfDay(for: referenceDate)
        var components = calendar.dateComponents([.year, .month], from: today)
        components.day = rentDueDay
        let thisMonthDue = calendar.date(from: components) ?? today
        let target = thisMonthDue >= today
            ? thisMonthDue
            : (calendar.date(byAdding: .month, value: 1, to: thisMonthDue) ?? thisMonthDue)
        return calendar.dateComponents([.day], from: today, to: target).day ?? 0
    }
}
