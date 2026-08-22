# Phase 0 Research: Person-Scoped Dashboard Widgets

The spec left no `[NEEDS CLARIFICATION]` markers, so this is not a gap-filling document. It records
the design decisions that had real alternatives, and the two findings from reading the existing code
that changed what the plan does.

---

## D1 — How the people axis reaches a propless widget body

**Decision**: A new React context, `web/lib/widgets/MoneyScopeContext.tsx`, holding a `MoneyScope`.
Bodies read it with `useMoneyScope()` / `useScopedTransactions(txs)`.

**Rationale**: The board's contract since spec 034 is that a widget body takes **no props** — it is
registered by id and reads everything it needs from hooks (`registry.tsx` types `Body` as
`ComponentType`, with no props at all). The time axis already solved the identical problem the
identical way: spec 035's `DashboardScopeContext` exists specifically because per-widget state would
desync the board. The people axis is the sibling of that axis; giving it the sibling solution keeps
one mental model for "shared dashboard state".

**Alternatives considered**:

- **Thread a `personId` prop** through `WidgetBoard` → `Widget` → `Body`. Rejected: it changes the
  `WidgetDefinition.Body` type from `ComponentType` to `ComponentType<{personId}>`, which touches all
  fifteen widgets — including the nine that have no people axis — to serve six. It also breaks SC-006
  (a future widget author gets the axis for free) and would force every existing widget test to pass
  a prop.
- **Put the person in the global store (`useApp()`)**. Rejected for the reason `DashboardScopeContext`
  documents in its own header: the store is for persisted household data and explicit preferences.
  The member selection is neither — it is transient view state for one page (FR-020).
- **Extend `DashboardScopeContext` with a `scope` field.** Rejected — see D2.

---

## D2 — Two contexts, not one

**Decision**: Keep the time axis and the people axis in separate contexts and separate providers.

**Rationale**: The consumer sets differ and the exclusions matter. Nine widgets read the time window;
six will read the subject; `financial-health` and `goals` must read the subject **not at all** this
release. If the person rode along inside `DashboardScopeContext`, every body that destructures that
context would be one careless `const { interval, scope } = ...` away from silently changing an
excluded widget — the exact failure this spec is trying to avoid elsewhere. Two contexts make the
exclusion structural: `GoalsBody` cannot accidentally become person-scoped, because it never imports
the module.

It also keeps the axes' *shapes* honest. `DashboardScopeContext` is a rich object (interval,
referenceDate, now, selectedMonth, availableMonths, rangeOptions, setters). The people axis is one
discriminated union. Merging them would bury a two-state value inside a nine-field object.

**Alternatives considered**: one merged `DashboardContext`. Rejected above. The cost of two contexts
is one extra provider in one file — cheap.

---

## D3 — Reading the context outside a provider returns household scope

**Decision**: `useMoneyScope()` returns `HOUSEHOLD_SCOPE` when there is no provider above it.
`useDashboardScopeContext()`, by contrast, throws.

**Rationale**: Two reasons, and the second is the important one.

1. **It is semantically the identity, not a fallback.** `scopeTransactions(txs, HOUSEHOLD_SCOPE)`
   returns the *same array reference* — spec 051 made the household case a strict no-op and asserts
   that identity in `test/scope/moneyScope.test.ts`. So "no provider" and "household" are not merely
   similar states; they are the same computation. A default that is the identity cannot mask a bug
   the way a guessed fallback can. The time axis has no such identity value — there is no "no month"
   — which is why throwing is right there and wrong here.

2. **It makes the existing test suites the regression lock.** Twenty files under `web/test/widgets/`
   render bodies directly, mocking `@/lib/store` and `@/lib/widgets/DashboardScopeContext`. They know
   nothing about a money scope. With this default they keep passing **byte-for-byte unmodified**, and
   that is the direct evidence for FR-005 and SC-002 — household output did not move. If the hook
   threw, all twenty would need a new provider or a new mock, and the edit would destroy exactly the
   evidence the edit was supposed to preserve. Spec 050 used this same technique deliberately: "Five
   existing form suites pin the preference OFF and pass **unmodified**, which is the proof only the
   default moved."

**Alternatives considered**: throw for consistency with the time axis, and add a provider to twenty
test files. Rejected — consistency is not worth trading a free regression proof for twenty diffs.

---

## D4 — Where the projection is memoized

**Decision**: One `useScopedTransactions(transactions)` hook exported from the context module, which
memoizes `scopeTransactions(transactions, scope)` on `[transactions, scope]`.

**Rationale**: Five bodies need the same projected array from the same two inputs. Writing the
`useMemo` in each body would run the O(n) projection five times per render pass for identical output,
and would put the same three lines in five files where they could drift apart. One hook is one
implementation and, under React's memo semantics with stable inputs, one pass.

**The identity requirement this creates**: the memo is only worth having if `scope` is referentially
stable across renders. `HOUSEHOLD_SCOPE` is a module constant, so it is. `personScope(id)` allocates
a **new object on every call**, so a naive `const scope = personId ? personScope(personId) : HOUSEHOLD_SCOPE`
in the page body would produce a fresh reference every render and defeat every downstream memo.

This is precisely why the dashboard page will hold **`MoneyScope` itself in state**, not a `personId`
string — mirroring `app/(app)/planning/page.tsx`, which already does exactly this:

```ts
const [rawScope, setScope] = useState<MoneyScope>(HOUSEHOLD_SCOPE)
const scope = resolveScope(rawScope, householdMembers.map((m) => m.id))
```

`resolveScope` returns either the module constant or the *same* `rawScope` object, so the result is
referentially stable without a `useMemo` wrapper. The `personId` the picker and the hero need is then
*derived* from the scope, which is the opposite of today's direction and the reason the page change
is a rewrite of three lines rather than an addition.

---

## D5 — Balances must not be computed from projected transactions

**Decision**: `HouseholdBalancesBody` keeps computing `outstandingBalances(peopleInLedger(txs), txs)`
over the **full, unprojected** ledger, and filters the resulting rows to those involving the selected
person.

**Rationale**: This is the one place where the obvious one-line change is wrong, so it is worth being
explicit. `projectForPerson` rewrites a transaction to `{ amount_cents: <their share>, owner_ids: [personId], shares: { [personId]: share } }`.
A debt exists because person A **paid** for something person B **co-owns** — it is derived from the
relationship between `paid_by` and the other owners' shares. Projection deletes the other owners. Run
over projected rows, `outstandingBalances` would find a ledger where every expense is single-owner,
conclude nobody owes anybody, and render "All settled up." That is not a crash — it is a plausible,
wrong money figure, which Constitution VI treats as the failure mode to design against.

Filtering rows is also the behavior the spec actually asks for (FR-012: amounts unchanged, fewer
rows) and it composes correctly: `allPairBalances` is antisymmetric by construction, so selecting a
person and reading their rows gives the same numbers a third party sees.

**Alternatives considered**: passing scoped transactions in for uniformity with the other five
bodies. Rejected as silently incorrect, per above. Uniformity of *code shape* is not worth a wrong
number.

---

## D6 — Which widgets are in scope, and why each one is or is not

Derived by reading all eleven non-shortcut bodies. The rule: a widget takes the people axis iff it
reports money attributable to a person.

| Widget | Reads | Verdict |
|---|---|---|
| `spending-pace` | `transactions` | **Scoped.** Daily expense buckets are per-person money. |
| `top-merchants` | `transactions` | **Scoped.** "Where *you* spend" is the widget's own framing. |
| `savings-trends` | `transactions` (twice — the bucket loop and the `monthTotals` comparison) | **Scoped, both paths.** Missing the comparison path would show this month personal against last month household — the exact mixed-subject bug being fixed. |
| `activity` | `transactions` | **Scoped.** Filters to rows the person is party to. Note it deliberately ignores the *time* axis (spec 041 O-2); the people axis is independent of that and still applies. |
| `budgets` | `budgets` + `transactions` | **Scoped, both halves.** `scopeBudgets` for limits, `scopeTransactions` for spend — the whole point of spec 054 being that "spent X of Y" has one owner. |
| `household-balances` | `transactions` | **Scoped by row filter** — see D5. |
| `financial-health` | profile + `transactions` | **Excluded by request** (own PR). Note it *already* has an internal scope call from spec 052; that stays exactly as-is. |
| `goals` | `goals`, `goalContributions` | **Excluded by request** (own PR). |
| `housing-costs` | `properties` | **No people axis.** A property is a household asset; there is no per-person share column to project. |
| `home-equity` | `properties` | **No people axis.** Same. |
| the four settings shortcuts | `t` only | **No money.** |

**Finding worth recording**: `financial-health` and `goals` were already going to be the two hardest
to scope — health because spec 052 gave it a *user-private* profile whose interaction with a
*viewer-selected* person is a genuine design question, and goals because a goal has no owner column
at all. The user's instinct to split them into their own PR matches where the real design work is.

---

## D7 — The rename is two call sites, not a key rename

**Finding from the code**, and it changes what the task looks like.

`"Everyone"` is a **shared** i18n key with three consumers: `MemberScopePicker` (the dashboard),
`PlanScopeBar` (the planning hub), and `TxForm`'s "Who is this for?" segmented control. Renaming the
key — or changing its translated values — would silently reword two controls the spec explicitly
protects (FR-016).

`"Household"` **already exists** in all five catalogs (`lib/i18n/{es,bn,ja,zh,ko}.ts`), shipped for
the household-name settings surface.

So the change is: swap `t('Everyone')` → `t('Household')` at the two `MemberScopePicker` call sites
(the collapsed button and the list option), leave every catalog file untouched, and add no key. The
`aria-label` moves with the visible copy so the accessible name matches (Constitution V).

**Also unchanged**: `test/i18n/catalog-reachability.test.ts` stays green either way, because
`"Everyone"` keeps two live consumers and `"Household"` gains one.
