import XCTest
@testable import Ortho_iOS

/// Parity: the Swift dashboard-scope helpers (`availableMonths`,
/// `monthReferenceDate`, `stepMonth` in DashboardRange.swift) must match the
/// shared golden vectors (web-generated). Add
/// `shared/test-vectors/dashboard-month-scope.json` to this test target's
/// "Copy Bundle Resources" so it loads from the test bundle.
/// Mirror of web/test/dashboard-month-scope.parity.test.ts. See
/// specs/011-dashboard-month-picker.
///
/// Plus a small unit block for the scope resolution (selectedMonth →
/// monthBounds interval; nil → rangeInterval) and mutual exclusivity, which
/// rely on the already-vectored `monthBounds` + `rangeInterval`.
final class DashboardScopeParityTests: XCTestCase {

    // MARK: - Vector shapes

    private struct AvailableMonthsCase: Decodable {
        let name: String
        let dates: [String]
        let expected: [String]
    }
    private struct MonthReferenceDateCase: Decodable {
        let name: String
        let month: String
        let expected: String
    }
    private struct StepMonthCase: Decodable {
        let name: String
        let months: [String]
        let current: String
        let direction: String
        let expected: String?
    }
    // Spec 013 US4: availableRanges — the last unvectored month-scope function.
    private struct AvailableRangesCase: Decodable {
        let name: String
        let dates: [String]
        let now: String
        let expected: [String]
    }
    private struct Vectors: Decodable {
        let availableMonths: [AvailableMonthsCase]
        let availableRanges: [AvailableRangesCase]
        let monthReferenceDate: [MonthReferenceDateCase]
        let stepMonth: [StepMonthCase]
    }

    // ISO8601 with fractional seconds, matching the vector strings
    // ("2026-06-15T12:00:00.000Z") on both read and write.
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    private func loadVectors() throws -> Vectors {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "dashboard-month-scope", withExtension: "json"),
            "Add shared/test-vectors/dashboard-month-scope.json to this test target's Copy Bundle Resources"
        )
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(Vectors.self, from: data)
    }

    /// Minimal transaction carrying just the `date` that `availableMonths`
    /// reads — mirrors how web feeds only `.date`.
    private func tx(at date: Date) -> Transaction {
        Transaction(
            merchant: "x",
            category: .groceries,
            kind: .expense,
            amount: 0,
            ownerIDs: [],
            source: "s",
            date: date,
            createdBy: UUID()
        )
    }

    // MARK: - availableMonths

    func testAvailableMonthsParity() throws {
        let vectors = try loadVectors()
        XCTAssertFalse(vectors.availableMonths.isEmpty)
        for c in vectors.availableMonths {
            let dates = try c.dates.map { s in
                try XCTUnwrap(Self.iso.date(from: s), "bad ISO date \(s) in case \(c.name)")
            }
            let txs = dates.map(tx(at:))
            XCTAssertEqual(availableMonths(txs), c.expected, "case: \(c.name)")
        }
    }

    // MARK: - availableRanges (spec 013 US4)

    /// The vectors are generated under TZ=UTC, so month-index math here must
    /// run on a UTC calendar (the production default is `.current`).
    private let utcCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    func testAvailableRangesParity() throws {
        let vectors = try loadVectors()
        XCTAssertFalse(vectors.availableRanges.isEmpty)
        for c in vectors.availableRanges {
            let dates = try c.dates.map { s in
                try XCTUnwrap(Self.iso.date(from: s), "bad ISO date \(s) in case \(c.name)")
            }
            let now = try XCTUnwrap(Self.iso.date(from: c.now), "bad now \(c.now) in case \(c.name)")
            let got = DashboardRange.available(for: dates.map(tx(at:)), now: now, calendar: utcCalendar)
            XCTAssertEqual(got.map(\.rawValue), c.expected, "case: \(c.name)")
        }
    }

    // MARK: - monthReferenceDate

    func testMonthReferenceDateParity() throws {
        let vectors = try loadVectors()
        XCTAssertFalse(vectors.monthReferenceDate.isEmpty)
        for c in vectors.monthReferenceDate {
            let date = try XCTUnwrap(monthReferenceDate(c.month), "nil for \(c.month) in case \(c.name)")
            XCTAssertEqual(Self.iso.string(from: date), c.expected, "case: \(c.name)")
        }
    }

    // MARK: - stepMonth

    func testStepMonthParity() throws {
        let vectors = try loadVectors()
        XCTAssertFalse(vectors.stepMonth.isEmpty)
        for c in vectors.stepMonth {
            let direction: MonthStep = c.direction == "prev" ? .prev : .next
            XCTAssertEqual(stepMonth(c.months, c.current, direction), c.expected, "case: \(c.name)")
        }
    }

    // MARK: - Scope resolution + mutual exclusivity (unit)
    //
    // These target the pure resolvers (`dashboardScopeInterval` /
    // `dashboardScopeReferenceDate`) and the available-months derivation
    // directly, rather than constructing `AppState` — whose init spins up a
    // real SupabaseClient and is not usable in the unit-test host (the other
    // parity suites also avoid AppState for this reason).

    private let fixedNow: Date = ISO8601DateFormatter().date(from: "2026-06-17T10:00:00Z")!

    /// nil selected month → relative-range interval anchored to `now`.
    func testScopeIntervalFallsBackToRelativeRange() {
        let resolved = dashboardScopeInterval(range: .thisMonth, selectedMonth: nil, now: fixedNow)
        XCTAssertEqual(resolved, DashboardRange.thisMonth.interval(on: fixedNow))
    }

    /// A selected month → its UTC `monthBounds` interval, overriding the range.
    func testScopeIntervalUsesMonthBoundsWhenSelected() throws {
        let resolved = dashboardScopeInterval(range: .last3Months,
                                              selectedMonth: "2026-03",
                                              now: fixedNow)
        let (from, to) = try XCTUnwrap(monthBounds("2026-03"))
        XCTAssertEqual(resolved, DateInterval(start: from, end: to))
        // Reference date = 15th noon UTC of the selected month.
        let ref = dashboardScopeReferenceDate(selectedMonth: "2026-03", now: fixedNow)
        XCTAssertEqual(Self.iso.string(from: ref), "2026-03-15T12:00:00.000Z")
    }

    /// No selection → reference date is `now`.
    func testScopeReferenceDateFallsBackToNow() {
        XCTAssertEqual(dashboardScopeReferenceDate(selectedMonth: nil, now: fixedNow), fixedNow)
    }

    /// Mutual exclusivity: the resolver always picks one window — a selected
    /// month wins over the relative range; clearing it returns to the range.
    func testMutualExclusivity() throws {
        let monthScoped = dashboardScopeInterval(range: .last12Months,
                                                 selectedMonth: "2026-03",
                                                 now: fixedNow)
        let (from, to) = try XCTUnwrap(monthBounds("2026-03"))
        XCTAssertEqual(monthScoped, DateInterval(start: from, end: to),
                       "selected month must override the relative range")

        let cleared = dashboardScopeInterval(range: .last12Months,
                                             selectedMonth: nil,
                                             now: fixedNow)
        XCTAssertEqual(cleared, DashboardRange.last12Months.interval(on: fixedNow),
                       "clearing the month returns to the relative range")
    }

    // MARK: - Month-boundary half-openness ([start, end))
    //
    // Regression for the closed-interval double-count: `DateInterval.contains`
    // is CLOSED [start, end], but the app's `monthBounds`/web are HALF-OPEN
    // [start, end). A transaction landing at the exact next-month midnight UTC
    // must belong to the LATER month only — never both. The aggregation sites
    // (incomeTotal/expenseTotal/spent/categoryExpenseTotal/… and InsightEngine)
    // now compare `date >= start && date < end`; this locks that predicate.

    /// A tx at the exact next-month-midnight-UTC instant is excluded from the
    /// earlier month under the half-open predicate (but WOULD be wrongly
    /// included by `DateInterval.contains`).
    func testNextMonthMidnightExcludedFromEarlierMonth() throws {
        let (from, to) = try XCTUnwrap(monthBounds("2026-05"))
        // `to` is 2026-06-01T00:00:00Z — the first instant of the NEXT month.
        let boundary = to

        // Half-open predicate used by every aggregation site: excluded.
        XCTAssertFalse(boundary >= from && boundary < to,
                       "next-month midnight must not count toward the earlier month")

        // The next month's window includes that same instant (no gap, no overlap).
        let (nextFrom, nextTo) = try XCTUnwrap(monthBounds("2026-06"))
        XCTAssertTrue(boundary >= nextFrom && boundary < nextTo,
                      "next-month midnight belongs to the later month")

        // Document the bug we fixed: the CLOSED DateInterval would double-count it.
        XCTAssertTrue(DateInterval(start: from, end: to).contains(boundary),
                      "DateInterval.contains is closed — this is exactly the bug the half-open predicate avoids")

        // A tx one second before the boundary still belongs to the earlier month.
        let lastSecond = to.addingTimeInterval(-1)
        XCTAssertTrue(lastSecond >= from && lastSecond < to)
    }

    /// `availableMonths` produces the member set the picker constrains
    /// selection to (selecting an out-of-set month is a UI/AppState no-op).
    func testAvailableMonthsMembership() throws {
        let dates = try ["2026-06-10T12:00:00.000Z", "2026-04-02T12:00:00.000Z"].map {
            try XCTUnwrap(Self.iso.date(from: $0))
        }
        let months = availableMonths(dates.map(tx(at:)))
        XCTAssertEqual(months, ["2026-06", "2026-04"])
        XCTAssertFalse(months.contains("1999-01"))
    }
}
