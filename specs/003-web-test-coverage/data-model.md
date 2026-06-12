# Data Model: Test Foundation

A testing feature has no runtime schema. The "entities" are the test-support artifacts
and the mapping of behaviors → suites.

## Test-support entities

### Golden test vector
- **Shape**: `{ input: {...}, expected: {...} }[]` stored as JSON in `shared/test-vectors/`.
- **Existing**: `mortgage.json`, `insights.json` (consumed by the two parity suites).
- **Use**: lock deterministic logic; optionally extended for money/format/aggregates if a
  vector table is clearer than inline cases. `name` field labels each `it()`.

### Mocked data layer (`makeSupabaseMock(dataset)`)
- **Input**: `dataset` — a partial map of table name → row array
  (`users`, `household_members`, `transactions`, `transaction_shares`, `cards`,
  `properties`, `budgets`, …) plus an optional `authUser`.
- **Output**: an object shaped like the Supabase browser client:
  - `auth.getUser()` → `{ data: { user }, error: null }`
  - `from(table)` → chainable builder (`select/eq/in/order/limit` return `this`; awaiting
    resolves `{ data: dataset[table] ?? [], error: null }`)
  - `insert/update/delete/upsert` → record into `mock.calls`, resolve `{ error: null }`
- **Guarantee**: never performs real I/O; `mock.calls` lets tests assert persistence and
  that no unexpected call happened.

### Fixtures (`test/helpers/fixtures.ts`)
- Builders for a `User`, `Household`, and `Transaction` with sensible defaults and
  overrides (`makeTx({ amount_cents, owner_ids, scope, splits })`). Keeps each test terse
  and intention-revealing.

### Reference date
- An explicit `Date` passed to time-dependent pure functions, or set via
  `vi.setSystemTime(...)` for component paths that call `new Date()` internally. Standard
  pin for this suite: **2026-06-12** (a Friday) unless a case needs a specific calendar
  shape (month boundaries, year rollover).

## Behavior → suite map (traceability)

| Spec story | Module/Component | Suite (file) | Env |
|---|---|---|---|
| P1 | `finance/money.ts` (formatMoney, toUSDCents) | `money.test.ts` | node |
| P1 | `finance/currency.ts` (symbols, fractionDigits, names, rates) | `currency.test.ts` | node |
| P1 | `format.ts` (startOfDay/Month, dayLabel, *Date, monthYear[Long], groupByDay, groupDaysByMonth, expenseTotal, effectiveSplits, relativeTime) | `format.test.ts` | node |
| P1 | `categories.ts` (categoryMeta, paletteFor, SPEND_CATEGORIES) | `categories.test.ts` | node |
| P1 | `api/aggregates.ts` | `aggregates.test.ts` | node |
| P1 | `utils.ts` (cn) | `utils.test.ts` | node |
| P1 | `finance/mortgage.ts`, `finance/insights.ts` | *existing parity suites* | node |
| P2 | `store.tsx` (add/update/delete, ownersDisplay, formatMoney, scope, splits) | `store.test.tsx` | jsdom |
| P3 | `inputs.tsx` DatePicker | `DatePicker.test.tsx` | jsdom |
| P3 | transactions month accordion (`app/(app)/transactions/page.tsx`) | `transactions-accordion.test.tsx` | jsdom |
| P3 | `Sidebar.tsx`, `TabBar.tsx` | `nav.test.tsx` | jsdom |
| P3 | `TxForm.tsx` `useTxForm.canSave` | `tx-form-validation.test.tsx` | jsdom |

## Validation rules captured by tests (examples)

- `toUSDCents` rounds to an integer; `rate === 0` → 0 (no divide-by-zero).
- Zero-fraction currencies (`jpy`) format with no decimals and convert with divisor 1.
- `isoToDate('2026-06-12')` is local June 12 (not UTC) — no day shift; `dateToISO` round-trips.
- Even `effectiveSplits` over N owners sums to 100; explicit splits pass through untouched;
  zero owners → `{}`.
- `groupDaysByMonth` orders months newest-first and preserves day order within a month.
- Accordion: exactly the current month open by default; if current month empty → most
  recent non-empty month; non-empty search → all open.
- Nav: active route → exactly one `aria-current="page"`; items are `<a>`/links.
- `canSave` false until amount > 0 and merchant present (and ≥1 owner for shared scope).
