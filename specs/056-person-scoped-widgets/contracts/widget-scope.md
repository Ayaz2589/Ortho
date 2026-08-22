# Contract: Widget × Money Scope

The dashboard board's public behavioral contract under the people axis. This is the document a
reviewer checks the diff against, and the document a future widget author reads to decide whether
their widget needs the axis.

Two scopes exist: **household** (the default, and the only state before this feature) and **person**
(one named member selected in the dashboard picker).

---

## Part 1 — The universal rules

**C-1 — Household scope is the identity.** Under household scope every widget produces output
identical to its pre-feature output, for every household, including households that have never used
the people axis. This is not "equivalent" — `scopeTransactions(txs, HOUSEHOLD_SCOPE)` returns the
same array reference, so the downstream computation is bit-for-bit the one that ran before.

**C-2 — No provider is household scope.** A widget body rendered without a `MoneyScopeProvider` above
it behaves exactly as under household scope. It never throws. This is what lets existing widget test
suites remain unmodified, and those unmodified suites are the enforcement mechanism for C-1.

**C-3 — One attribution rule.** No widget implements its own person-narrowing. Every projected figure
comes from `scopeTransactions` / `scopeBudgets` in `lib/scope/moneyScope.ts`. A person's figure for a
shared expense or income is their **stored** share; a transfer is directional, counted at full amount
for its sender and its recipient, and absent for everyone else.

**C-4 — The axes compose.** The people axis and the time axis are independent. A widget that reads
both applies both; a widget that ignores one (as `activity` and `household-balances` ignore time)
still honours the other.

**C-5 — Empty is empty, not zero.** When a person has no qualifying activity, a widget shows its own
existing empty state. No widget renders a zeroed chart, a 0% rate, or a $0 row that could be read as
a measurement.

**C-6 — Narrowing never restates.** Where the axis filters rows rather than projecting amounts
(balances), the surviving rows show exactly the amounts they show under household scope.

---

## Part 2 — Per-widget behavior

### Scoped — projected through `scopeTransactions`

| Widget | Household scope | Person scope |
|---|---|---|
| `spending-pace` | 60-day expense buckets over the whole household; avg/day and the vs-prior-30 delta from those buckets. | The same computation over that person's expense **shares**. A shared $100 expense contributes $50 to a 50/50 owner, not $100. |
| `top-merchants` | Top 5 merchants by household spend in the window, with visit counts. | Top 5 by **that person's** spend. Visit count counts only transactions they are party to — a merchant the household visits often but they never do falls off the list entirely. |
| `savings-trends` | Per-month and headline savings rate from household income and expenses; single-month view also shows the previous month. | The same from that person's income and expense shares — **including the previous-month comparison**. Both figures on screen must have the same subject; a personal headline beside a household comparison is the defect this feature exists to fix. |
| `activity` | The 5 most recent household transactions, at full amount, with the owner line. | The 5 most recent transactions **that person is party to**, at their share amount. The owner line reads as that person (a consequence of projection setting `owner_ids: [personId]`). Continues to ignore the time window in both scopes. |

### Scoped — both halves projected

| Widget | Household scope | Person scope |
|---|---|---|
| `budgets` | Household budgets (`person_id == null`) only, measured against household spend, rollover-aware. | **That person's** budgets measured against **that person's** spend. Both halves projected by the same scope, so "spent X of Y" has one owner. **No fallback**: a person who has set no budget sees the empty state, never the household's limit measured against their share. |

### Scoped — by row filter, not projection

| Widget | Household scope | Person scope |
|---|---|---|
| `household-balances` | Every non-zero pair in the household. | Only pairs where the selected person is debtor or creditor, at **unchanged** amounts. Balances are computed from the **full, unprojected** ledger in both scopes — a projected row has lost the payer↔co-owner relationship a debt is derived from, so computing from projected rows would report "All settled up" for a household that owes money. The settled-state and no-household messages are unchanged. |

### Not scoped — no people axis

| Widget | Why |
|---|---|
| `housing-costs` | A property is a household asset. There is no per-person share to project. |
| `home-equity` | Same. |
| `download-data`, `widget-settings`, `change-currency`, `change-language` | Navigation shortcuts. They report no money. |

### Not scoped — excluded this release

| Widget | Status |
|---|---|
| `financial-health` | **Unchanged under every scope.** It already performs its own internal spec-052 scoping of the questionnaire against transactions; that behavior is untouched. Shipping in its own PR. |
| `goals` | **Unchanged under every scope.** Shipping in its own PR. |

These two must be verifiable as unchanged: rendering either body under a person-scoped provider must
produce identical output to rendering it under household scope.

---

## Part 3 — The picker

**C-7** — The default option reads **"Household"** in the collapsed button and in the open list, in
all five supported languages. The control's accessible name agrees with its visible name.

**C-8** — The rename is confined to the dashboard picker. `PlanScopeBar` (planning hub) and `TxForm`
("Who is this for?") continue to read **"Everyone"**; the shared i18n key keeps its wording and its
translations.

**C-9** — A single-person household sees no picker and no behavior change of any kind, exactly as
today.

**C-10** — A selection naming a person who is no longer active resolves to household scope. The board
never renders empty because of a stale selection.

---

## Part 4 — Extension

**C-11** — A new widget joins the people axis by calling `useScopedTransactions(transactions)` in
place of reading `transactions` directly. No registry field, no board change, no prop. A widget that
does not call it is household-scoped forever, which is the correct default for a widget with no
people axis.
