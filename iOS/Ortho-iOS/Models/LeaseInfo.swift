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
        let due = rentDueDay
        let thisMonthDue = Self.dueDate(inMonthOf: today, dueDay: due, calendar: calendar)
        let target: Date
        if thisMonthDue >= today {
            target = thisMonthDue
        } else {
            // Roll to next month, re-clamping the due day to THAT month's length.
            let nextMonthAnchor = calendar.date(byAdding: .month, value: 1, to: today) ?? today
            target = Self.dueDate(inMonthOf: nextMonthAnchor, dueDay: due, calendar: calendar)
        }
        return calendar.dateComponents([.day], from: today, to: target).day ?? 0
    }

    /// The rent-due date within the calendar month containing `anchor`, clamping
    /// the due day to that month's length so a due day of 31 resolves to
    /// month-end instead of overflowing into the next month (day 31 in June →
    /// June 30, not July 1). Mirrors web `dueDateInMonth`; locked by
    /// `shared/test-vectors/lease.json`.
    private static func dueDate(inMonthOf anchor: Date,
                                dueDay: Int,
                                calendar: Calendar) -> Date {
        let comps = calendar.dateComponents([.year, .month], from: anchor)
        let daysInMonth = calendar.range(of: .day, in: .month, for: anchor)?.count ?? 31
        var dueComps = DateComponents()
        dueComps.year = comps.year
        dueComps.month = comps.month
        dueComps.day = min(dueDay, daysInMonth)
        return calendar.date(from: dueComps) ?? calendar.startOfDay(for: anchor)
    }
}
