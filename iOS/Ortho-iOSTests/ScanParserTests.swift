// Fixture-driven tests for the scan pipeline (spec 014).
// Contract: specs/014-receipt-statement-scan/contracts/scan-parser.md
//
// Each fixture in the APP bundle (Resources/ScanFixtures/, loaded via
// Bundle(for: AppState.self) — no test-target pbxproj resources needed) pairs
// a capture with a hand-authored `<name>.expected.json`. Tests run the REAL
// extractor + parser (never ScanRefiner — determinism guarantee) and assert
// candidates field-by-field.

import XCTest
import UIKit
@testable import Ortho_iOS

final class ScanParserTests: XCTestCase {

    // MARK: - Receipt fixtures (US1/US3)

    func testReceiptGrocery() async throws {
        try await assertFixture("receipt-grocery", ext: "png")
    }

    /// Itemized restaurant receipt: the labeled TOTAL must win over the
    /// price-bearing item lines (R5 tie-break — item lines carry no dates,
    /// so they are not statement rows).
    func testReceiptRestaurant() async throws {
        try await assertFixture("receipt-restaurant", ext: "png")
    }

    /// Foreign-currency receipt: EUR total with comma decimals fills
    /// originalAmount + currency; the amount is NEVER treated as USD
    /// (FR-014). A text-layer PDF on purpose: this fixture locks the FX
    /// *logic* deterministically — image-OCR variance is covered by the
    /// other receipt fixtures.
    func testReceiptEUR() async throws {
        try await assertFixture("receipt-eur", ext: "pdf")
    }

    /// Same-amount-same-day match against context.existing claims exactly
    /// one duplicate (FR-015).
    func testReceiptDuplicate() async throws {
        try await assertFixture("receipt-duplicate", ext: "png")
    }

    /// No labeled TOTAL anywhere — the forgiving fallback tier prefills
    /// best-effort (largest currency-marked amount beats the larger bare
    /// CASH tender, top line is the merchant, first full date), with
    /// merchant/amount/date all marked Guessed (post-T037 device feedback).
    func testReceiptNoTotalFallback() async throws {
        try await assertFixture("receipt-no-total", ext: "png")
    }

    /// Unparseable capture → .none (FR-017 path). The fallback tier must
    /// NOT rescue glyph-free noise — that is what the failure copy is for.
    func testUnreadable() async throws {
        try await assertFixture("unreadable", ext: "png")
    }

    /// Same input + same context ⇒ identical result (contract §purity).
    func testParseIsDeterministic() async throws {
        let (doc, expected) = try await extractFixture("receipt-grocery", ext: "png")
        let context = try makeContext(expected.context)
        let first = ScanParser.parse(doc, context: context)
        let second = ScanParser.parse(doc, context: context)
        XCTAssertTrue(resultsEquivalent(first, second), "parse must be deterministic")
    }

    // MARK: - Statement fixtures (US2)

    /// Two-page text-layer PDF: rows from both pages in document order,
    /// credits→income, PAYMENT THANK YOU flagged, two duplicates claimed
    /// greedily against context.existing, year inferred from the printed
    /// statement period (FR-011/012/015/019, SC-002/005).
    func testStatementCardPDF() async throws {
        try await assertFixture("statement-card", ext: "pdf")
    }

    /// Photographed/scanned statement through the OCR table/line path.
    func testStatementScanned() async throws {
        try await assertFixture("statement-scanned", ext: "png")
    }

    /// Screenshot of a web-banking transaction list: month-name dates
    /// ("Jul 1"), no MM/DD anywhere — the real-world capture shape that
    /// motivated the post-T037 fixes. Rows parse, years resolve against the
    /// reference day, CR credit and payment-row flagging still apply.
    func testStatementScreenshot() async throws {
        try await assertFixture("statement-screenshot", ext: "png")
    }

    /// The CLI year-inference convention (engine/dates.ts): a December row
    /// in a Dec→Jan statement period resolves to the PERIOD's earlier year.
    func testYearInferenceAcrossBoundary() {
        let period = (start: DateComponents(year: 2025, month: 12, day: 15),
                      end: DateComponents(year: 2026, month: 1, day: 14))
        let december = ScanHeuristics.resolveDay(month: 12, day: 20,
                                                 period: period,
                                                 reference: DateComponents(year: 2026, month: 7, day: 3))
        XCTAssertEqual(december, DateComponents(year: 2025, month: 12, day: 20))
        let january = ScanHeuristics.resolveDay(month: 1, day: 5,
                                                period: period,
                                                reference: DateComponents(year: 2026, month: 7, day: 3))
        XCTAssertEqual(january, DateComponents(year: 2026, month: 1, day: 5))
        // No period: anchor on the injected reference day, never the future.
        let noPeriod = ScanHeuristics.resolveDay(month: 12, day: 20,
                                                 period: nil,
                                                 reference: DateComponents(year: 2026, month: 7, day: 3))
        XCTAssertEqual(noPeriod, DateComponents(year: 2025, month: 12, day: 20))
    }

    /// Within-batch identical rows are NOT duplicates of each other — only
    /// existing DB rows count, and each is claimable once (dedupe.ts port).
    func testWithinBatchTwinsBothSurvive() {
        let existingID = UUID()
        let context = ScanContext(
            existing: [ExistingTransactionDay(id: existingID,
                                              day: DateComponents(year: 2026, month: 6, day: 5),
                                              amountCents: 1850)],
            referenceDay: DateComponents(year: 2026, month: 7, day: 3)
        )
        let doc = ScanDocumentText(pages: [.init(lines: [
            .init(text: "STATEMENT PERIOD 06/01/2026 - 06/30/2026", frame: .zero),
            .init(text: "06/05  UBER TRIP  $18.50", frame: .zero),
            .init(text: "06/05  UBER TRIP  $18.50", frame: .zero),
            .init(text: "06/06  LYFT RIDE  $12.00", frame: .zero),
        ], tables: [])])
        guard case .statement(let rows) = ScanParser.parse(doc, context: context) else {
            return XCTFail("expected statement")
        }
        XCTAssertEqual(rows.count, 3)
        XCTAssertEqual(rows[0].duplicateOf, existingID, "first twin claims the existing row")
        XCTAssertNil(rows[1].duplicateOf, "second twin must NOT double-claim")
        XCTAssertNil(rows[2].duplicateOf)
    }

    /// "CR" suffix is the minus-less credit notation (Amex/Chase): the row
    /// must come out negative → income prefill (FR-011).
    func testCRSuffixIsCredit() {
        let row = ScanHeuristics.statementRow(from: "06/22  REFUND AMAZON MKTP  $25.00 CR")
        XCTAssertNotNil(row)
        XCTAssertEqual(row?.amount.negative, true)
        XCTAssertEqual(row?.amount.minorUnits, 2500)
        // And the plain debit row still parses unchanged.
        let debit = ScanHeuristics.statementRow(from: "06/03  STARBUCKS  $6.45")
        XCTAssertEqual(debit?.amount.negative, false)
    }

    /// Month-name rows ("Jul 1  UBER  $24.51") are statement rows too — the
    /// shape web banking UIs print. An optional year is swallowed; header
    /// lines never match.
    func testMonthNameStatementRows() {
        let row = ScanHeuristics.statementRow(from: "Jul 1  UBER TRIP HELP.UBER.COM  $24.51")
        XCTAssertEqual(row?.month, 7)
        XCTAssertEqual(row?.day, 1)
        XCTAssertEqual(row?.description, "UBER TRIP HELP.UBER.COM")
        XCTAssertEqual(row?.amount.minorUnits, 2451)

        let withYear = ScanHeuristics.statementRow(from: "Jun 30, 2026  STARBUCKS  $6.45")
        XCTAssertEqual(withYear?.month, 6)
        XCTAssertEqual(withYear?.day, 30)
        XCTAssertEqual(withYear?.description, "STARBUCKS")

        let credit = ScanHeuristics.statementRow(from: "Jun 25  ONLINE PAYMENT - THANK YOU  $500.00 CR")
        XCTAssertEqual(credit?.amount.negative, true)

        XCTAssertNil(ScanHeuristics.statementRow(from: "Date   Description   Amount"))
        XCTAssertNil(ScanHeuristics.statementRow(from: "MAY SPECIAL OFFER DETAILS"))
    }

    /// Month-name full dates parse in both orders; the existing numeric
    /// forms keep priority.
    func testMonthNameFullDate() {
        XCTAssertEqual(ScanHeuristics.fullDate(in: "Paid on Jul 1, 2026"),
                       DateComponents(year: 2026, month: 7, day: 1))
        XCTAssertEqual(ScanHeuristics.fullDate(in: "1 July 2026"),
                       DateComponents(year: 2026, month: 7, day: 1))
        XCTAssertEqual(ScanHeuristics.fullDate(in: "DECEMBER 31 2025"),
                       DateComponents(year: 2025, month: 12, day: 31))
        XCTAssertNil(ScanHeuristics.fullDate(in: "Jul 1"), "no year — never fabricate one here")
    }

    // MARK: - Forgiving fallback tier (post-T037 device feedback)

    /// Text with a money-shaped amount but no total label and no rows →
    /// best-effort receipt, never .none: the largest currency-MARKED amount
    /// beats a larger bare number, and merchant/amount/date are all Guessed.
    func testFallbackReceiptWhenNoTotalLabel() {
        let doc = ScanDocumentText(pages: [.init(lines: [
            .init(text: "CORNER STORE", frame: .zero),
            .init(text: "07/01/2026", frame: .zero),
            .init(text: "SNACK  3.25", frame: .zero),
            .init(text: "$9.75", frame: .zero),
            .init(text: "CASH  20.00", frame: .zero),
        ], tables: [])])
        let context = ScanContext(referenceDay: DateComponents(year: 2026, month: 7, day: 3))
        guard case .receipt(let candidate) = ScanParser.parse(doc, context: context) else {
            return XCTFail("expected fallback receipt")
        }
        XCTAssertEqual(candidate.amountCents, 975, "marked $9.75 must beat bare 20.00")
        XCTAssertEqual(candidate.merchant, "CORNER STORE")
        XCTAssertEqual(candidate.date, DateComponents(year: 2026, month: 7, day: 1))
        XCTAssertEqual(candidate.direction, .debit)
        XCTAssertEqual(candidate.guesses, [.merchant, .amount, .date])
    }

    /// Readable text without any money shape stays .none — the fallback
    /// must not invent an amount.
    func testFallbackNeedsMoneyShapedText() {
        let doc = ScanDocumentText(pages: [.init(lines: [
            .init(text: "HELLO WORLD", frame: .zero),
            .init(text: "JUST SOME WORDS 42", frame: .zero),
        ], tables: [])])
        let context = ScanContext(referenceDay: DateComponents(year: 2026, month: 7, day: 3))
        guard case .none = ScanParser.parse(doc, context: context) else {
            return XCTFail("expected .none for money-free text")
        }
    }

    /// TOTAL-labeled lines whose trailing number is not money-shaped
    /// ("TOTAL ITEMS SOLD 12", "AMOUNT DUE BY 07/15/2026") must never
    /// override the real labeled total.
    func testTotalLabelRequiresMoneyShapedAmount() {
        let lines = [
            "CORNER PLACE",
            "TOTAL  $14.25",
            "TOTAL ITEMS SOLD 12",
            "AMOUNT DUE BY 07/15/2026",
        ]
        let total = ScanHeuristics.grandTotal(in: lines)
        XCTAssertEqual(total?.minorUnits, 1425)
        XCTAssertNil(ScanHeuristics.grandTotal(in: ["TOTAL ITEMS SOLD 12"]))
    }

    // MARK: - Inference tiers (US3, FR-013)

    /// No history, no rule match ⇒ categoryGuess nil — the form default
    /// stands; iOS never adopts the CLI's 'entertainment' fallback.
    func testNoSignalLeavesCategoryNil() {
        let doc = ScanDocumentText(pages: [.init(lines: [
            .init(text: "CORNER PLACE", frame: .zero),
            .init(text: "07/01/2026", frame: .zero),
            .init(text: "TOTAL  $12.00", frame: .zero),
        ], tables: [])])
        let context = ScanContext(referenceDay: DateComponents(year: 2026, month: 7, day: 3))
        guard case .receipt(let candidate) = ScanParser.parse(doc, context: context) else {
            return XCTFail("expected receipt")
        }
        XCTAssertNil(candidate.categoryGuess)
        XCTAssertTrue(candidate.guesses.isEmpty)
        XCTAssertEqual(candidate.merchant, "CORNER PLACE")
    }

    /// History outranks the rule table, adopts the household's own spelling,
    /// and supplies the owners guess; prefix matching bridges OCR noise
    /// ("NETFLIX.COM" ↔ stored "Netflix").
    func testHistoryTierBeatsRuleTable() {
        let owner = UUID()
        let history = MerchantHistory(
            normalizedMerchant: ScanHeuristics.normalizeMerchant("Netflix"),
            displayMerchant: "Netflix",
            category: .entertainment, // deliberately NOT the rule table's .subs
            count: 5,
            lastDay: DateComponents(year: 2026, month: 6, day: 1),
            owners: [owner]
        )
        let doc = ScanDocumentText(pages: [.init(lines: [
            .init(text: "NETFLIX.COM", frame: .zero),
            .init(text: "07/01/2026", frame: .zero),
            .init(text: "TOTAL  $22.99", frame: .zero),
        ], tables: [])])
        let context = ScanContext(history: [history],
                                  referenceDay: DateComponents(year: 2026, month: 7, day: 3))
        guard case .receipt(let candidate) = ScanParser.parse(doc, context: context) else {
            return XCTFail("expected receipt")
        }
        XCTAssertEqual(candidate.categoryGuess, .entertainment, "history must outrank the rule table")
        XCTAssertEqual(candidate.merchant, "Netflix", "history spelling adopted")
        XCTAssertEqual(candidate.ownersGuess, [owner])
        XCTAssertEqual(candidate.guesses, [.category, .owners])
    }

    // MARK: - Fixture harness

    private struct ExpectedFile: Decodable {
        let kind: String
        let context: ExpectedContext
        let candidates: [ExpectedCandidate]
    }

    private struct ExpectedContext: Decodable {
        let referenceDate: String
        let existing: [ExpectedExisting]
        let history: [ExpectedHistory]
    }

    private struct ExpectedExisting: Decodable {
        let id: UUID
        let date: String
        let amountCents: Int64
    }

    private struct ExpectedHistory: Decodable {
        let merchant: String
        let category: String
        let count: Int
        let lastDate: String?
        let owners: [UUID]
    }

    private struct ExpectedCandidate: Decodable {
        let merchantRaw: String
        let merchant: String
        let date: String?
        let amountCents: Int64
        let direction: String
        let currency: String
        let originalAmount: String?
        let isPaymentRow: Bool
        let categoryGuess: String?
        let ownersGuess: [UUID]?
        let duplicateOf: UUID?
        let guesses: [String]
    }

    private struct FixtureError: Error { let message: String }

    /// Fixtures ship in the APP bundle; the synchronized project may keep the
    /// folder structure or flatten resources — try both. A missing fixture is
    /// a hard FAILURE (a skip here would green CI while testing nothing).
    private func fixtureURL(_ name: String, ext: String) throws -> URL {
        let bundle = Bundle(for: AppState.self)
        if let url = bundle.url(forResource: name, withExtension: ext, subdirectory: "ScanFixtures") {
            return url
        }
        if let url = bundle.url(forResource: name, withExtension: ext) {
            return url
        }
        XCTFail("MISSING FIXTURE \(name).\(ext) — check Resources/ScanFixtures/ made it into the app bundle")
        throw FixtureError(message: "missing fixture \(name).\(ext)")
    }

    private func loadExpected(_ name: String) throws -> ExpectedFile {
        let url = try fixtureURL("\(name).expected", ext: "json")
        return try JSONDecoder().decode(ExpectedFile.self, from: Data(contentsOf: url))
    }

    private func extractFixture(_ name: String, ext: String) async throws -> (ScanDocumentText, ExpectedFile) {
        let expected = try loadExpected(name)
        let url = try fixtureURL(name, ext: ext)
        let doc: ScanDocumentText
        if ext == "pdf" {
            doc = try await ScanTextExtractor.extract(pdfAt: url)
        } else {
            guard let image = UIImage(contentsOfFile: url.path) else {
                XCTFail("fixture \(name).\(ext) is not a readable image")
                throw FixtureError(message: "unreadable fixture \(name).\(ext)")
            }
            doc = try await ScanTextExtractor.extract(images: [image])
        }
        return (doc, expected)
    }

    /// The extractor's output, compact — appended to failure MESSAGES (CI's
    /// xcodebuild filter drops test stdout, so print() diagnostics never
    /// surface; assertion messages do).
    private func dump(_ doc: ScanDocumentText) -> String {
        doc.pages.enumerated().map { index, page in
            var out = "p\(index) lines=\(page.lines.map(\.text))"
            if !page.tables.isEmpty { out += " tables=\(page.tables.map(\.rows))" }
            return out
        }.joined(separator: " | ")
    }

    private func day(_ s: String) throws -> DateComponents {
        let parts = s.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { throw NSError(domain: "fixture", code: 1) }
        return DateComponents(year: parts[0], month: parts[1], day: parts[2])
    }

    private func makeContext(_ c: ExpectedContext) throws -> ScanContext {
        ScanContext(
            existing: try c.existing.map {
                ExistingTransactionDay(id: $0.id, day: try day($0.date), amountCents: $0.amountCents)
            },
            history: try c.history.map {
                MerchantHistory(
                    normalizedMerchant: ScanHeuristics.normalizeMerchant($0.merchant),
                    displayMerchant: $0.merchant,
                    category: TransactionCategory(rawValue: $0.category)!,
                    count: $0.count,
                    lastDay: try $0.lastDate.map { try day($0) },
                    owners: $0.owners
                )
            },
            defaultCurrency: .usd,
            referenceDay: try day(c.referenceDate)
        )
    }

    /// Runs extractor + parser (NEVER the refiner) and asserts the whole
    /// expected file, field by field.
    func assertFixture(_ name: String, ext: String,
                       file: StaticString = #filePath, line: UInt = #line) async throws {
        let (doc, expected) = try await extractFixture(name, ext: ext)
        let context = try makeContext(expected.context)
        let result = ScanParser.parse(doc, context: context)
        let diag = dump(doc)

        let candidates: [ParsedCandidate]
        switch (expected.kind, result) {
        case ("none", .none):
            return
        case ("receipt", .receipt(let c)):
            candidates = [c]
        case ("statement", .statement(let cs)):
            candidates = cs
        default:
            XCTFail("\(name): expected kind '\(expected.kind)', got \(label(of: result)) — EXTRACTED \(diag)",
                    file: file, line: line)
            return
        }

        XCTAssertEqual(candidates.count, expected.candidates.count,
                       "\(name): candidate count — EXTRACTED \(diag)", file: file, line: line)
        for (i, (got, want)) in zip(candidates, expected.candidates).enumerated() {
            try assertCandidate(got, want, "\(name)[\(i)]", diagnostics: diag, file: file, line: line)
        }
    }

    private func assertCandidate(_ got: ParsedCandidate, _ want: ExpectedCandidate,
                                 _ rawCtx: String, diagnostics: String,
                                 file: StaticString, line: UInt) throws {
        // Lazily-evaluated assert messages: the diagnostics only render on
        // an actual failure.
        let ctx = "\(rawCtx) [EXTRACTED \(diagnostics)]"
        XCTAssertEqual(got.merchantRaw, want.merchantRaw, "\(ctx) merchantRaw", file: file, line: line)
        XCTAssertEqual(got.merchant, want.merchant, "\(ctx) merchant", file: file, line: line)
        if let d = want.date {
            XCTAssertEqual(got.date, try day(d), "\(ctx) date", file: file, line: line)
        } else {
            XCTAssertNil(got.date, "\(ctx) date should be nil", file: file, line: line)
        }
        XCTAssertEqual(got.amountCents, want.amountCents, "\(ctx) amountCents", file: file, line: line)
        XCTAssertEqual(got.direction.rawValue, want.direction, "\(ctx) direction", file: file, line: line)
        XCTAssertEqual(got.currency.rawValue, want.currency, "\(ctx) currency", file: file, line: line)
        if let o = want.originalAmount {
            XCTAssertEqual(got.originalAmount, Decimal(string: o), "\(ctx) originalAmount", file: file, line: line)
        } else {
            XCTAssertNil(got.originalAmount, "\(ctx) originalAmount should be nil", file: file, line: line)
        }
        XCTAssertEqual(got.isPaymentRow, want.isPaymentRow, "\(ctx) isPaymentRow", file: file, line: line)
        XCTAssertEqual(got.categoryGuess?.rawValue, want.categoryGuess, "\(ctx) categoryGuess", file: file, line: line)
        XCTAssertEqual(got.ownersGuess, want.ownersGuess, "\(ctx) ownersGuess", file: file, line: line)
        XCTAssertEqual(got.duplicateOf, want.duplicateOf, "\(ctx) duplicateOf", file: file, line: line)
        XCTAssertEqual(Set(got.guesses.map(\.rawValue)), Set(want.guesses), "\(ctx) guesses", file: file, line: line)
    }

    private func label(of result: ScanParseResult) -> String {
        switch result {
        case .receipt: "receipt"
        case .statement(let c): "statement(\(c.count))"
        case .none: "none"
        }
    }

    /// Equality ignoring the session-local `id` UUIDs.
    private func resultsEquivalent(_ a: ScanParseResult, _ b: ScanParseResult) -> Bool {
        func strip(_ c: ParsedCandidate) -> ParsedCandidate {
            var copy = c
            copy = ParsedCandidate(id: UUID(uuidString: "00000000-0000-0000-0000-000000000000")!,
                                   merchantRaw: c.merchantRaw, merchant: c.merchant, date: c.date,
                                   amountCents: c.amountCents, direction: c.direction,
                                   currency: c.currency, originalAmount: c.originalAmount,
                                   isPaymentRow: c.isPaymentRow, guesses: c.guesses,
                                   categoryGuess: c.categoryGuess, ownersGuess: c.ownersGuess,
                                   duplicateOf: c.duplicateOf)
            return copy
        }
        switch (a, b) {
        case (.none, .none): return true
        case (.receipt(let x), .receipt(let y)): return strip(x) == strip(y)
        case (.statement(let xs), .statement(let ys)):
            return xs.map(strip) == ys.map(strip)
        default: return false
        }
    }
}
