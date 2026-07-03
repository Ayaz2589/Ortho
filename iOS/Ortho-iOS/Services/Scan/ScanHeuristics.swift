// Deterministic, locale-invariant parsing primitives for the scan pipeline
// (spec 014). Pure functions only — no I/O, no clock, no Locale.current
// (contract §purity; constitution VI).
//
// The statement half ports the CLI ingest conventions from
// web/scripts/import/engine/{dates,categorize,exclusions}.ts (research R6) —
// the wizard is "ingest with a face", not a second convention set. The
// tables are convention mirrors documented in PARITY.md, not vectored math.

import Foundation

nonisolated enum ScanHeuristics {

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

    /// Letter-boundary lookarounds instead of \b: OCR often drops the space
    /// ("EUR23,50"), and \b fails between a letter and a digit.
    private static func detectCurrency(in text: String) -> Currency? {
        let upper = text.uppercased()
        func code(_ c: String) -> Bool { matches(upper, pattern: "(?<![A-Z])(?:\(c))(?![A-Z])") }
        if upper.contains("€") || code("EUR") { return .eur }
        if upper.contains("£") || code("GBP") { return .gbp }
        if upper.contains("¥") || code("JPY") { return .jpy }
        if code("CNY|RMB") { return .cny }
        if code("CAD") { return .cad }
        if upper.contains("৳") || code("BDT") { return .bdt }
        return nil
    }

    // MARK: - Dates

    /// English month names, as bank UIs and receipts print them ("Jul 1" on
    /// the Amex web rows that motivated the fallback tier). The first three
    /// letters are unambiguous, so "Jul", "Jul.", and "July" all resolve.
    private static let monthNamePattern =
        "JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?"

    private static let monthNumbers: [String: Int] = [
        "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
        "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
    ]

    static func monthNumber(_ name: String) -> Int? {
        monthNumbers[String(name.uppercased().prefix(3))]
    }

    /// First full date (MM/DD/YYYY, DD/MM/YYYY disambiguated by month > 12,
    /// YYYY-MM-DD, or a month-name form like "Jul 1, 2026") found scanning
    /// lines in order. Receipt path only.
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
        // "Jul 1, 2026" / "July 1 2026" — the shape web banking UIs print.
        if let groups = firstGroups(
            in: text,
            pattern: "(?i)\\b(\(monthNamePattern))\\.?\\s+(\\d{1,2})(?:ST|ND|RD|TH)?,?\\s+(\\d{4})\\b"
        ), let month = monthNumber(groups[0]),
           let dayValue = Int(groups[1]), (1...31).contains(dayValue),
           let year = Int(groups[2]) {
            return DateComponents(year: year, month: month, day: dayValue)
        }
        // "1 Jul 2026" (day-first European form).
        if let groups = firstGroups(
            in: text,
            pattern: "(?i)\\b(\\d{1,2})\\s+(\(monthNamePattern))\\.?\\s+(\\d{4})\\b"
        ), let dayValue = Int(groups[0]), (1...31).contains(dayValue),
           let month = monthNumber(groups[1]),
           let year = Int(groups[2]) {
            return DateComponents(year: year, month: month, day: dayValue)
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

    /// One "MM/DD  DESCRIPTION  $AMOUNT" line → a row — or the month-name
    /// form web banking UIs print ("Jul 1  UBER TRIP  $24.51", an optional
    /// year swallowed). The trailing token must be a decimal money amount;
    /// lines without a leading date (headers, balances, period lines) never
    /// match. A trailing "CR" is the credit notation used instead of a minus
    /// sign on Amex/Chase-style statements — it flips the sign (FR-011).
    static func statementRow(from line: String, defaultCurrency: Currency = .usd) -> StatementRow? {
        let amountTail = "(-?[$€£]?\\s?-?[0-9][0-9,]*\\.\\d{2})(\\s*CR)?\\s*$"
        var month: Int?
        var day: Int?
        var match: [String]?
        if let numeric = firstGroups(
            in: line,
            pattern: "^\\s*(\\d{1,2})/(\\d{1,2})\\s+(.+?)\\s+\(amountTail)"
        ) {
            month = Int(numeric[0])
            day = Int(numeric[1])
            match = numeric
        } else if let named = firstGroups(
            in: line,
            pattern: "(?i)^\\s*(\(monthNamePattern))\\.?\\s+(\\d{1,2})(?:,?\\s+\\d{4})?\\s+(.+?)\\s+\(amountTail)"
        ) {
            month = monthNumber(named[0])
            day = Int(named[1])
            match = named
        } else if let inline = firstGroups(
            in: line,
            // Structured OCR joins an app-list cell into one string with the
            // description FIRST: "UBER TRIP  Jul 1  $24.51" (post-T041).
            pattern: "(?i)^\\s*(.+?)\\s+(\(monthNamePattern))\\.?\\s+(\\d{1,2})(?:,?\\s+\\d{4})?\\s+\(amountTail)"
        ) {
            month = monthNumber(inline[1])
            day = Int(inline[2])
            match = [inline[1], inline[2], inline[0], inline[3], inline[4]]
        }
        guard let month, let day, let match,
              (1...12).contains(month), (1...31).contains(day) else { return nil }
        let description = match[2].trimmingCharacters(in: .whitespaces)
        guard !description.isEmpty,
              var amount = parseAmount(match[3], defaultCurrency: defaultCurrency) else { return nil }
        if !match[4].isEmpty {
            amount = AmountToken(minorUnits: amount.minorUnits, negative: true, currency: amount.currency)
        }
        return StatementRow(month: month, day: day, description: description, amount: amount)
    }

    /// A table row (structured OCR) → the same shape: first date-bearing cell
    /// + last amount-bearing cell + the rest as description.
    static func statementRow(fromCells cells: [String], defaultCurrency: Currency = .usd) -> StatementRow? {
        statementRow(from: cells.joined(separator: "  "), defaultCurrency: defaultCurrency)
    }

    // MARK: - Stacked statement rows (app-list captures, post-T041)

    /// Optional weekday prefix on a date line ("Tue, Jul 1"). Non-capturing.
    private static let weekdayPrefixPattern =
        "(?:(?:MON|TUE(?:S)?|WED(?:NES)?|THU(?:R(?:S)?)?|FRI|SAT(?:UR)?|SUN)(?:DAY)?\\.?,?\\s+)?"

    /// A line that is NOTHING but a posting date — the date line of a bank
    /// app/web list cell: "Jul 1", "Jul 1, 2026", "07/01", "07/01/2026",
    /// optionally weekday-prefixed. Never a date embedded in prose.
    static func bareDate(_ line: String) -> (month: Int, day: Int)? {
        if let groups = firstGroups(
            in: line,
            pattern: "(?i)^\\s*\(weekdayPrefixPattern)(\(monthNamePattern))\\.?\\s+(\\d{1,2})(?:ST|ND|RD|TH)?(?:,?\\s+\\d{4})?\\s*$"
        ), let month = monthNumber(groups[0]),
           let day = Int(groups[1]), (1...31).contains(day) {
            return (month, day)
        }
        if let groups = firstGroups(
            in: line,
            pattern: "(?i)^\\s*\(weekdayPrefixPattern)(\\d{1,2})/(\\d{1,2})(?:/\\d{2,4})?\\s*$"
        ), let month = Int(groups[0]), let day = Int(groups[1]),
           (1...12).contains(month), (1...31).contains(day) {
            return (month, day)
        }
        return nil
    }

    /// Status words that ride along in app list cells but are never the
    /// merchant ("Pending", "Posted"...).
    private static let statusNoisePattern =
        "(?i)^\\s*(?:PENDING|POSTED|PROCESSING|COMPLETED|DECLINED)\\s*$"

    /// Reconstruct statement rows from STACKED app-list cells — the shape a
    /// photo of a banking app/website produces: each transaction spreads
    /// over 2–3 OCR lines (merchant / bare date / amount in some order), so
    /// the one-line row regex never fires. Anchor on each amount (an
    /// amount-only line, or a description line with a trailing amount);
    /// match anchors to bare-date lines globally by proximity (nearest pair
    /// first, each line claimable once — so a "Total balance" header can't
    /// steal the first row's date), then claim the nearest description
    /// looking back, then forward. Anchors that can't claim their OWN date
    /// yield nothing — per-row dates are exactly what separates a
    /// transaction list from a receipt's price column.
    static func stackedRows(in lines: [String], defaultCurrency: Currency = .usd) -> [StatementRow] {
        struct Anchor {
            let index: Int
            let amount: AmountToken
            let inlineDesc: String?
        }
        var anchors: [Anchor] = []
        var dateIndexes: [Int] = []
        var descAvailable: Set<Int> = []

        for (index, line) in lines.enumerated() {
            if bareDate(line) != nil {
                dateIndexes.append(index)
                continue
            }
            if isAmountOnly(line) {
                if let amount = lastAmount(in: line, defaultCurrency: defaultCurrency) {
                    anchors.append(Anchor(index: index, amount: amount, inlineDesc: nil))
                }
                continue
            }
            guard line.rangeOfCharacter(from: .letters) != nil,
                  !matches(line, pattern: statusNoisePattern) else { continue }
            if let amount = lastAmount(in: line, defaultCurrency: defaultCurrency) {
                // "UBER TRIP  $24.51" — merchant and amount share the line.
                anchors.append(Anchor(index: index, amount: amount, inlineDesc: line))
            } else {
                descAvailable.insert(index)
            }
        }
        guard anchors.count >= 2, dateIndexes.count >= 2 else { return [] }

        // Every cell in one app lays out the same way, so its date is
        // consistently on ONE side of its amount — but that side varies by
        // app, and an amount can sit nearer the NEXT cell's date than its
        // own. Try both directional readings (date after vs before the
        // amount, ≤2 lines away, nearest-first greedy, each date claimable
        // once) and keep whichever explains more rows; a "Total balance"
        // header loses every claim it contests either way.
        func assign(dateAfterAmount: Bool) -> [Int: Int] {   // anchor array idx → date line idx
            var pairs: [(distance: Int, anchorIdx: Int, dateIdx: Int)] = []
            for (a, anchor) in anchors.enumerated() {
                for dateIdx in dateIndexes {
                    guard dateAfterAmount ? dateIdx > anchor.index : dateIdx < anchor.index else { continue }
                    let distance = abs(anchor.index - dateIdx)
                    if distance <= 2 { pairs.append((distance, a, dateIdx)) }
                }
            }
            pairs.sort { ($0.distance, $0.anchorIdx, $0.dateIdx) < ($1.distance, $1.anchorIdx, $1.dateIdx) }
            var dateFor: [Int: Int] = [:]
            var claimedDates: Set<Int> = []
            for pair in pairs where dateFor[pair.anchorIdx] == nil && !claimedDates.contains(pair.dateIdx) {
                dateFor[pair.anchorIdx] = pair.dateIdx
                claimedDates.insert(pair.dateIdx)
            }
            return dateFor
        }
        let after = assign(dateAfterAmount: true)
        let before = assign(dateAfterAmount: false)
        let dateFor = after.count >= before.count ? after : before

        var rows: [StatementRow] = []
        for (a, anchor) in anchors.enumerated() {
            guard let dateIdx = dateFor[a], let date = bareDate(lines[dateIdx]) else { continue }
            var description = anchor.inlineDesc.map {
                // Drop the trailing amount token from the shared line.
                replace($0, pattern: "\\s*(?:EUR|GBP|JPY|CNY|CAD|BDT)?\\s*[-$€£¥]*\\s?-?[0-9][0-9.,]*(\\s*CR)?\\s*$", with: "")
                    .trimmingCharacters(in: .whitespaces)
            } ?? ""
            if description.isEmpty {
                // Nearest unclaimed description: back up to 3 lines, else 1 forward.
                let back = (1...3).lazy.map { anchor.index - $0 }.first {
                    descAvailable.contains($0)
                }
                let candidate = back ?? (descAvailable.contains(anchor.index + 1) ? anchor.index + 1 : nil)
                guard let candidate else { continue }
                descAvailable.remove(candidate)
                description = lines[candidate].trimmingCharacters(in: .whitespaces)
            }
            guard !description.isEmpty else { continue }
            rows.append(StatementRow(month: date.month, day: date.day,
                                     description: description, amount: anchor.amount))
        }
        return rows
    }

    // MARK: - Receipt grand total

    private static let totalLabelPattern = "(?<!SUB)TOTAL\\b|AMOUNT DUE|BALANCE DUE"

    /// A token/line only counts as money for TOTAL purposes when it looks
    /// like money: a two-digit decimal part or an explicit currency marker.
    /// This keeps "TOTAL ITEMS SOLD 12", years, and zip codes from ever
    /// becoming a receipt total.
    private static func looksLikeMoney(_ text: String) -> Bool {
        matches(text, pattern: "[.,][0-9]{2}(?![0-9])|[$€£¥৳]|(?<![A-Z])(?:EUR|GBP|JPY|CNY|CAD|BDT)(?![A-Z])")
    }

    /// A line that is nothing but one money token (an OCR column fragment).
    static func isAmountOnly(_ line: String) -> Bool {
        matches(line, pattern: "^\\s*(?:EUR|GBP|JPY|CNY|CAD|BDT)?\\s*[-$€£¥]*\\s?-?[0-9][0-9.,]*\\s*$")
            && looksLikeMoney(line)
    }

    /// The labeled grand total: TOTAL / AMOUNT DUE / BALANCE DUE — never
    /// SUBTOTAL, never zero. Receipts repeat totals near the bottom, so the
    /// LAST labeled match wins. OCR robustness (label and amount need not
    /// share a line — structured OCR splits columns and tables):
    ///   a) amount on the label's own line,
    ///   b) else an amount-only neighbor line (after, then before),
    ///   c) else — some label existed but no adjacent amount — the largest
    ///      amount among amount-only lines (column-ordered transcripts).
    static func grandTotal(in lines: [String], defaultCurrency: Currency = .usd) -> AmountToken? {
        var found: AmountToken?
        var sawLabel = false
        for (index, line) in lines.enumerated() {
            guard matches(line.uppercased(), pattern: totalLabelPattern) else { continue }
            sawLabel = true
            if let amount = lastAmount(in: line, defaultCurrency: defaultCurrency),
               amount.minorUnits > 0 {
                found = amount
                continue
            }
            for neighbor in [index + 1, index - 1] where lines.indices.contains(neighbor) {
                let text = lines[neighbor]
                guard isAmountOnly(text),
                      let amount = lastAmount(in: text, defaultCurrency: defaultCurrency),
                      amount.minorUnits > 0 else { continue }
                found = amount
                break
            }
        }
        if found == nil, sawLabel {
            let amountOnly = lines
                .filter { isAmountOnly($0) }
                .compactMap { line -> (token: AmountToken, marked: Bool)? in
                    guard let token = lastAmount(in: line, defaultCurrency: defaultCurrency),
                          token.minorUnits > 0 else { return nil }
                    let marked = token.currency != nil || matches(line, pattern: "[$€£¥৳]")
                    return (token, marked)
                }
            // Receipts mark the total with the currency ("$87.34",
            // "EUR 23,50") while item prices are bare — the LAST marked
            // amount is the strongest signal; the largest bare amount is
            // the fallback of the fallback.
            found = amountOnly.last(where: \.marked)?.token
                ?? amountOnly.map(\.token).max { $0.minorUnits < $1.minorUnits }
        }
        return found
    }

    /// Best-effort amount for the forgiving fallback tier: receipts and
    /// screenshots mark the amount that matters with a currency ("$13.50")
    /// while item prices are bare, so the largest currency-marked token wins;
    /// only when nothing is marked does the largest bare money-shaped token
    /// stand in. Nil when the text has no money shape at all — that, not a
    /// missing TOTAL label, is what "couldn't read this" means.
    static func strongestAmount(in lines: [String], defaultCurrency: Currency = .usd) -> AmountToken? {
        var best: (token: AmountToken, marked: Bool)?
        for line in lines {
            guard let token = lastAmount(in: line, defaultCurrency: defaultCurrency) else { continue }
            let marked = token.currency != nil || matches(line, pattern: "[$€£¥৳]")
            let better: Bool
            if let current = best {
                if marked != current.marked {
                    better = marked
                } else {
                    better = abs(token.minorUnits) > abs(current.token.minorUnits)
                }
            } else {
                better = true
            }
            if better { best = (token, marked) }
        }
        return best?.token
    }

    /// The last money-shaped token in a line (labels sit left, amounts
    /// right). Bare integers ("SOLD 12", "DUE BY 07/15/2026") never qualify;
    /// zero tokens are skipped — "TOTAL FEES $0.00" is never a grand total.
    static func lastAmount(in line: String, defaultCurrency: Currency = .usd) -> AmountToken? {
        guard let re = regex("(?:EUR|GBP|JPY|CNY|CAD|BDT)?\\s*[-$€£¥]*\\s?-?[0-9][0-9.,]*") else { return nil }
        let range = NSRange(line.startIndex..., in: line)
        for match in re.matches(in: line, range: range).reversed() {
            guard let r = Range(match.range, in: line) else { continue }
            let token = String(line[r])
            guard looksLikeMoney(token) else { continue }
            if let amount = parseAmount(token, defaultCurrency: defaultCurrency),
               amount.minorUnits != 0 {
                return amount
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
    /// Unmatched optional groups come back as empty strings.
    private static func firstGroups(in text: String, pattern: String) -> [String]? {
        guard let re = regex(pattern),
              let match = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        var groups: [String] = []
        for i in 1..<match.numberOfRanges {
            groups.append(Range(match.range(at: i), in: text).map { String(text[$0]) } ?? "")
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
