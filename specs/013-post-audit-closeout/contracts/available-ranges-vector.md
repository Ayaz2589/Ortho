# Contract: availableRanges Golden Vector

**Vector**: new `availableRanges` section inside `shared/test-vectors/dashboard-month-scope.json`
(extending the existing file — no new pbxproj resource; regenerated via
`cd web && npm run gen:vectors`, never hand-edited).

**Source of truth**: `availableRanges(transactions, now)` in
`web/components/dashboard/range.ts:84-99`. iOS mirror: pure function
`availableRanges(_ transactions: [Transaction], now: Date)` extracted into
`App/DashboardRange.swift`; `AppState.availableRanges` (AppState.swift:684-698) delegates to it.

## Case set (FR-009, spec edge cases)

| Case | Shape | Expected |
|---|---|---|
| empty | no transactions | `["thisMonth"]` |
| single-month | all tx in `now`'s month | `["thisMonth"]` |
| two-month | earliest 1 month back | `+ last3Months`? No — months-back 1 < 2 → `["thisMonth"]` (documents the `monthCount-1` boundary) |
| exactly-3 | earliest 2 months back | `["thisMonth","last3Months"]` |
| five-month | earliest 4 months back | thisMonth + last3Months |
| exactly-6 / exactly-12 boundaries | earliest 5 / 11 months back | adds last6Months / last12Months respectively |
| thirteen-month | earliest 12 months back | all four |
| gap-months | sparse dates, earliest 12 months back | all four (gaps irrelevant — earliest date drives) |
| year-boundary | earliest Dec, now Jan | correct month-index math across the year line |
| future-dated | a tx after `now` | earliest still drives; documents current behavior |

Inputs: `dates: string[]` (ISO, noon UTC) + `now` (ISO). Expected: ordered `DashboardRange` raw
values (`thisMonth`, `last3Months`, `last6Months`, `last12Months`).

## Assertions

- Web: `web/test/dashboard-scope.parity.test.ts` (or the existing dashboard-scope parity file)
  gains a describe block iterating the section.
- iOS: `DashboardScopeParityTests.swift` gains the decode struct + loop, using the existing
  UTC ISO formatter (lines 44–49).

## TDD proof (SC-004)

Web assertions land before the Swift extraction; the batched iOS push runs both suites in CI.
The mutation check (deliberate off-by-one fails the suite) is exercised once during development
on the web side (cheap) and relied on transitively for iOS (same JSON, same assertions).
