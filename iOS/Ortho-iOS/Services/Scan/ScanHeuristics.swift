// Deterministic, locale-invariant parsing primitives for the scan pipeline
// (spec 014). Pure functions only — no I/O, no clock, no Locale.current
// (contract §purity; constitution VI).
//
// The statement half ports the CLI ingest conventions from
// web/scripts/import/engine/{dates,categorize,exclusions}.ts (research R6) —
// the wizard is "ingest with a face", not a second convention set. The
// tables are convention mirrors documented in PARITY.md, not vectored math.

import Foundation

enum ScanHeuristics {

    // MARK: - Merchant text

    /// Strip processor prefixes (TST*, SQ *, …), store/reference numbers
    /// (#552, long digit runs), and phone numbers; collapse whitespace.
    /// Deliberately does NOT re-case — prettifying is the on-device refiner's
    /// job (research R4); history matches adopt the household's own spelling.
    static func cleanMerchant(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespaces)
        s = replace(s, pattern: "^(?:TST\\*|SQ \\*|SP \\*|PP\\*|PY \\*)\\s*", with: "")
        s = replace(s, pattern: "#\\S*\\d\\S*", with: " ")               // store numbers
        s = replace(s, pattern: "\\b\\d{3}-\\d{3}-\\d{4}\\b", with: " ") // phone numbers
        s = replace(s, pattern: "\\b\\d{5,}\\b", with: " ")              // long reference runs
        s = replace(s, pattern: "\\s{2,}", with: " ")
        return s.trimmingCharacters(in: .whitespaces)
    }

    /// Matching key: uppercase alphanumerics only. "Trader Joe's" and
    /// "TRADER JOE'S #552" (cleaned) both normalize to "TRADERJOES".
    static func normalizeMerchant(_ s: String) -> String {
        String(s.uppercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) })
    }

    // MARK: - Amounts

    struct AmountToken: Equatable {
        /// Minor units of `currency ?? default` (cents for 2-digit currencies).
        let minorUnits: Int64
        let negative: Bool
        /// Non-nil only when the text itself names a currency (€, EUR, £…).
        let currency: Currency?
    }

    /// Parse one money token ("$87.34", "-$500.00", "EUR 23,50", "87.34").
    /// Comma is a decimal separator only in the `\d+,\d{2}$` shape with no
    /// period present; otherwise commas are thousands grouping.
    static func parseAmount(_ text: String, defaultCurrency: Currency = .usd) -> AmountToken? {
        let currency = detectCurrency(in: text)
        let negative = text.range(of: "-") != nil
        guard let numberRange = firstMatch(in: text, pattern: "[0-9][0-9.,]*") else { return nil }
        var number = String(text[numberRange])
        if number.contains(".") {
            number = number.replacingOccurrences(of: ",", with: "")
        } else if matches(number, pattern: ",\\d{2}$") {
            number = number.replacingOccurrences(of: ",", with: ".")
        } else {
            number = number.replacingOccurrences(of: ",", with: "")
        }
        guard let decimal = Decimal(string: number, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
        let digits = (currency ?? defaultCurrency).fractionDigits
        let scaled = NSDecimalNumber(decimal: decimal)
            .multiplying(byPowerOf10: Int16(digits))
        let minor = Int64(scaled.doubleValue.rounded())
        return AmountToken(minorUnits: minor, negative: negative, currency: currency)
    }

    private static func detectCurrency(in text: String) -> Currency? {
        let upper = text.uppercased()
        if upper.contains("€") || matches(upper, pattern: "\\bEUR\\b") { return .eur }
        if upper.contains("£") || matches(upper, pattern: "\\bGBP\\b") { return .gbp }
        if matches(upper, pattern: "\\bJPY\\b") || upper.contains("¥") { return .jpy }
        if matches(upper, pattern: "\\bCNY\\b|\\bRMB\\b") { return .cny }
        if matches(upper, pattern: "\\bCAD\\b") { return .cad }
        if matches(upper, pattern: "\\bBDT\\b") || upper.contains("৳") { return .bdt }
        return nil
    }

    // MARK: - Dates

    /// First full date (MM/DD/YYYY, DD/MM/YYYY disambiguated by month > 12,
    /// or YYYY-MM-DD) found scanning lines in order. Receipt path only.
    static func firstFullDate(in lines: [String]) -> DateComponents? {
        for line in lines {
            if let d = fullDate(in: line) { return d }
        }
        return nil
    }

    static func fullDate(in text: String) -> DateComponents? {
        if let range = firstMatch(in: text, pattern: "\\b(\\d{1,2})/(\\d{1,2})/(\\d{4})\\b") {
            let parts = String(text[range]).split(separator: "/").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            let (a, b, year) = (parts[0], parts[1], parts[2])
            // a/b: month/day unless the first number can't be a month.
            let (month, dayValue) = a > 12 ? (b, a) : (a, b)
            guard (1...12).contains(month), (1...31).contains(dayValue) else { return nil }
            return DateComponents(year: year, month: month, day: dayValue)
        }
        if let range = firstMatch(in: text, pattern: "\\b(\\d{4})-(\\d{2})-(\\d{2})\\b") {
            let parts = String(text[range]).split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3, (1...12).contains(parts[1]), (1...31).contains(parts[2]) else { return nil }
            return DateComponents(year: parts[0], month: parts[1], day: parts[2])
        }
        return nil
    }

    /// "STATEMENT PERIOD 06/01/2026 - 06/30/2026" → (start, end).
    static func statementPeriod(in lines: [String]) -> (start: DateComponents, end: DateComponents)? {
        for line in lines {
            guard let range = firstMatch(
                in: line,
                pattern: "(\\d{1,2}/\\d{1,2}/\\d{4})\\s*[-–—]\\s*(\\d{1,2}/\\d{1,2}/\\d{4})"
            ) else { continue }
            let token = String(line[range])
            let dates = token
                .components(separatedBy: CharacterSet(charactersIn: "-–—"))
                .compactMap { fullDate(in: $0) }
            if dates.count >= 2 { return (dates[0], dates[dates.count - 1]) }
        }
        return nil
    }

    /// Resolve an MM/DD posting date to a full day — the CLI year-inference
    /// algorithm (engine/dates.ts): anchor on the period end (or the injected
    /// reference day), stepping back a year when the month/day would land
    /// after the anchor. Never fabricates a future date.
    static func resolveDay(month: Int, day: Int,
                           period: (start: DateComponents, end: DateComponents)?,
                           reference: DateComponents) -> DateComponents {
        let anchor = period?.end ?? reference
        let anchorYear = anchor.year ?? 2000
        let anchorMonth = anchor.month ?? 12
        let anchorDay = anchor.day ?? 31
        var year = anchorYear
        if month > anchorMonth || (month == anchorMonth && day > anchorDay) {
            year -= 1
        }
        return DateComponents(year: year, month: month, day: day)
    }

    // MARK: - Statement rows

    struct StatementRow: Equatable {
        let month: Int
        let day: Int
        let description: String
        let amount: AmountToken
    }

    /// One "MM/DD  DESCRIPTION  $AMOUNT" line → a row. The trailing token
    /// must be a decimal money amount; lines without a leading date (headers,
    /// balances, period lines) never match.
    static func statementRow(from line: String) -> StatementRow? {
        guard let match = firstGroups(
            in: line,
            pattern: "^\\s*(\\d{1,2})/(\\d{1,2})\\s+(.+?)\\s+(-?[$€£]?\\s?-?[0-9][0-9,]*\\.\\d{2})(?:\\s*CR)?\\s*$"
        ) else { return nil }
        guard let month = Int(match[0]), let day = Int(match[1]),
              (1...12).contains(month), (1...31).contains(day) else { return nil }
        let description = match[2].trimmingCharacters(in: .whitespaces)
        guard !description.isEmpty, let amount = parseAmount(match[3]) else { return nil }
        return StatementRow(month: month, day: day, description: description, amount: amount)
    }

    /// A table row (structured OCR) → the same shape: first date-bearing cell
    /// + last amount-bearing cell + the rest as description.
    static func statementRow(fromCells cells: [String]) -> StatementRow? {
        statementRow(from: cells.joined(separator: "  "))
    }

    // MARK: - Receipt grand total

    /// The labeled grand total: TOTAL / AMOUNT DUE / BALANCE DUE / GRAND
    /// TOTAL — never SUBTOTAL, never zero. Receipts repeat totals near the
    /// bottom, so the LAST labeled match wins.
    static func grandTotal(in lines: [String], defaultCurrency: Currency = .usd) -> AmountToken? {
        var found: AmountToken?
        for line in lines {
            let upper = line.uppercased()
            guard matches(upper, pattern: "(?<!SUB)TOTAL\\b|AMOUNT DUE|BALANCE DUE") else { continue }
            guard let amount = lastAmount(in: line, defaultCurrency: defaultCurrency),
                  amount.minorUnits > 0 else { continue }
            found = amount
        }
        return found
    }

    /// The last money token in a line (labels sit left, amounts right).
    /// Zero tokens are skipped — "TOTAL FEES $0.00" is never a grand total.
    static func lastAmount(in line: String, defaultCurrency: Currency = .usd) -> AmountToken? {
        let pattern = "(?:EUR|GBP|JPY|CNY|CAD|BDT)?\\s*[-$€£¥]*\\s?-?[0-9][0-9.,]*"
        guard let re = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(line.startIndex..., in: line)
        for match in re.matches(in: line, range: range).reversed() {
            guard let r = Range(match.range, in: line) else { continue }
            if let token = parseAmount(String(line[r]), defaultCurrency: defaultCurrency),
               token.minorUnits != 0 {
                return token
            }
        }
        return nil
    }

    // MARK: - Classification tables (CLI ports — keep in sync, see PARITY.md)

    /// Card-payment / transfer statement rows: flagged and default-skipped,
    /// never expense prefills (FR-012). Port of engine/exclusions.ts plus the
    /// generic PAYMENT THANK YOU / AUTOPAY shapes.
    static func isPaymentRow(_ merchant: String) -> Bool {
        let upper = merchant.uppercased()
        return matches(upper, pattern:
            "AMEX EPAYMENT|APPLECARD|CHASE CREDIT CRD|CREDIT CRD AUTOPAY|GSBANK PAYMENT|PAYMENT THANK YOU|ONLINE PAYMENT|AUTOPAY")
    }

    private struct CategoryRule {
        let pattern: String
        let category: TransactionCategory
    }

    /// Ordered most-specific-first, tested against the UPPERCASED merchant —
    /// a verbatim port of engine/categorize.ts RULES. Unlike the CLI, an
    /// unmatched merchant returns nil (the form default stands, FR-013) —
    /// never the CLI's 'entertainment' fallback.
    private static let categoryRules: [CategoryRule] = [
        .init(pattern: "UBER\\s*EATS|UBEREATS|GRUBHUB|DOORDASH|SEAMLESS", category: .dining),
        .init(pattern: "INSTACART|H\\s*MART|HMART|GROCER|SUPERMARKET|TRADER JOE|WHOLE FOODS|KEY FOOD", category: .groceries),
        .init(pattern: "UBER\\s*ONE|UBERONE", category: .subs),
        .init(pattern: "PLAYSTATION|COURSERA|SUBSCRIPTION|TMNA|NETFLIX|SPOTIFY|HULU|DISNEY|PATREON|ICLOUD|APPLE\\.COM|APPLE ONE|OPENAI|CHATGPT|CLAUDE|ANTHROPIC|\\bWISPR\\b|AMAZON WEB SERVICES|\\bAWS\\b|PEACOCK|HBO|\\bMAX\\b|PARAMOUNT|YOUTUBE PREMIUM|MIDJOURNEY|GITHUB", category: .subs),
        .init(pattern: "STARBUCKS|DUNKIN|\\bCOFFEE\\b|JOE\\s*AND\\s*THE\\s*JUIC", category: .coffee),
        .init(pattern: "\\bUBER\\b|CURB|TAXI|NYCT|PAYGO|\\bPATH\\b|\\bMTA\\b|LYFT|TRANSIT|\\bCLEAR\\b", category: .transit),
        .init(pattern: "EXXON|MOBIL|SHELL|\\bBP\\b|CHEVRON|GULF|SUNOCO|\\bFUEL\\b|GAS STATION", category: .fuel),
        .init(pattern: "CON\\s*ED|CONED|NATIONAL GRID|VERIZON|T-?MOBILE|SPECTRUM|PSEG|\\bWATER\\b|UTILITY|MAINTENANCE FEE|BANK FEE|PLUMBING", category: .utilities),
        .init(pattern: "\\bCVS\\b|PHARMACY|WALGREENS|\\bHIMS\\b|\\bHERS\\b|HEALTH|DENTAL|DOCTOR|CLINIC|HOSPITAL|FITNESS|\\bGYM\\b|EQUINOX|PELOTON", category: .health),
        .init(pattern: "\\bRENT\\b|MORTGAGE|\\bLEASE\\b", category: .rent),
        .init(pattern: "RESTAURANT|\\bCAFE\\b|\\bDELI\\b|BAKERY|GRILL|KITCHEN|PIZZA|SUSHI|EATERY|DINER|TST\\*|BRASIL|SAKAGURA|BANGLAD|EXOTIQ|HABIT|DONER", category: .dining),
    ]

    /// First matching rule's category, or nil (form default stands).
    static func ruleCategory(for merchant: String) -> TransactionCategory? {
        let upper = merchant.uppercased()
        for rule in categoryRules where matches(upper, pattern: rule.pattern) {
            return rule.category
        }
        return nil
    }

    // MARK: - Regex plumbing (NSRegularExpression, en_US_POSIX-invariant)

    private static var cache: [String: NSRegularExpression] = [:]
    private static let cacheLock = NSLock()

    private static func regex(_ pattern: String) -> NSRegularExpression? {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        if let cached = cache[pattern] { return cached }
        let built = try? NSRegularExpression(pattern: pattern)
        if let built { cache[pattern] = built }
        return built
    }

    static func matches(_ text: String, pattern: String) -> Bool {
        guard let re = regex(pattern) else { return false }
        return re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    private static func firstMatch(in text: String, pattern: String) -> Range<String.Index>? {
        guard let re = regex(pattern),
              let match = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        return Range(match.range, in: text)
    }

    /// Capture groups of the first match (1-based groups returned 0-based).
    private static func firstGroups(in text: String, pattern: String) -> [String]? {
        guard let re = regex(pattern),
              let match = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        var groups: [String] = []
        for i in 1..<match.numberOfRanges {
            guard let r = Range(match.range(at: i), in: text) else { return nil }
            groups.append(String(text[r]))
        }
        return groups
    }

    private static func replace(_ text: String, pattern: String, with template: String) -> String {
        guard let re = regex(pattern) else { return text }
        return re.stringByReplacingMatches(in: text,
                                           range: NSRange(text.startIndex..., in: text),
                                           withTemplate: template)
    }
}
