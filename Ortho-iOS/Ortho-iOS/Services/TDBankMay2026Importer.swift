import Foundation

#if DEBUG

/// One-shot importer for the TD Bank Premier Checking statement
/// Apr 26 – May 25 2026 (account #435-9650110).
///
/// Only May 1–25 transactions are included. The following are intentionally
/// excluded:
/// - April entries (Apr 26–30) — outside the requested range.
/// - Internal transfers (to/from savings SV 00006772817632, to ML 6022371130).
/// - Credit-card bill payments (Amex, Apple Card, Chase autopay) — the
///   underlying charges are tracked against those cards, not here.
/// - Wealthfront investment transfer — not a spending transaction.
/// - Interest paid $0.03 — negligible.
///
/// All rows land as `.personal` scope (householdID = nil), owner = currentUserID.
/// Triggered from Settings → Developer in DEBUG builds only.
struct TDBankMay2026Importer {

    struct Report {
        var expensesImported: Int = 0
        var incomeImported: Int = 0
    }

    @MainActor
    static func run(appState: AppState, dryRun: Bool) async throws -> Report {
        let ayazID = appState.currentUserID
        let api = TransactionsAPI(client: appState.supabase)
        var report = Report()

        for tx in buildTransactions(ayazID: ayazID) {
            if !dryRun {
                try await api.create(tx)
                appState.transactions.append(tx)
            }
            if tx.isIncome { report.incomeImported += 1 }
            else           { report.expensesImported += 1 }
        }
        return report
    }

    // MARK: - Transaction list

    private static func buildTransactions(ayazID: User.ID) -> [Transaction] {
        [
            // ── Income ──────────────────────────────────────────────────────
            income("Zelle · John Tejada",     cents: 220_000, date: "2026-05-01", ayaz: ayazID),
            income("Zelle · Tasnuva Ahmed",   cents: 200_000, date: "2026-05-04", ayaz: ayazID),
            income("Zelle · Taher Uddin",     cents: 210_000, date: "2026-05-04", ayaz: ayazID),
            income("Zelle · Kathryn Neuser",  cents:  50_000, date: "2026-05-04", ayaz: ayazID),
            income("Mobile Deposit",          cents: 280_000, date: "2026-05-04", ayaz: ayazID),
            income("Crossterra Payroll",      cents: 417_844, date: "2026-05-15", ayaz: ayazID),

            // ── Expenses ────────────────────────────────────────────────────
            expense("Verizon",               category: .utilities,     cents:  8_999, date: "2026-05-04", ayaz: ayazID),
            expense("Vuksani Plumbing",      category: .utilities,     cents: 20_000, date: "2026-05-07", ayaz: ayazID),
            expense("Tipu Sultan",           category: .entertainment, cents:  4_142, date: "2026-05-11", ayaz: ayazID),
            expense("ATM Withdrawal",        category: .entertainment, cents:  2_850, date: "2026-05-13", ayaz: ayazID),
            expense("Con Edison",            category: .utilities,     cents: 28_630, date: "2026-05-22", ayaz: ayazID),
            expense("TD Bank Fee",           category: .utilities,     cents:  2_500, date: "2026-05-22", ayaz: ayazID),
        ]
    }

    // MARK: - Builders

    private static func income(
        _ merchant: String,
        cents: Int64,
        date dateStr: String,
        ayaz ayazID: User.ID
    ) -> Transaction {
        Transaction(
            merchant: merchant,
            category: .income,
            kind: .income,
            amount: cents,
            scope: .personal,
            ownerIDs: [ayazID],
            splits: nil,
            source: "TD Bank",
            date: parseDate(dateStr),
            householdID: nil,
            createdBy: ayazID
        )
    }

    private static func expense(
        _ merchant: String,
        category: TransactionCategory,
        cents: Int64,
        date dateStr: String,
        ayaz ayazID: User.ID
    ) -> Transaction {
        Transaction(
            merchant: merchant,
            category: category,
            kind: .expense,
            amount: cents,
            scope: .personal,
            ownerIDs: [ayazID],
            splits: nil,
            source: "TD Bank",
            date: parseDate(dateStr),
            householdID: nil,
            createdBy: ayazID
        )
    }

    // MARK: - Date helper

    private static let nyTimeZone = TimeZone(identifier: "America/New_York")!

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = nyTimeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func parseDate(_ str: String) -> Date {
        guard let day = dayFormatter.date(from: str) else {
            preconditionFailure("TDBankMay2026Importer: bad date literal \(str)")
        }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = nyTimeZone
        return cal.date(bySettingHour: 12, minute: 0, second: 0, of: day) ?? day
    }
}

#endif
