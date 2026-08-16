# Feature Specification: Person-Scoped Money Engines

**Feature Branch**: `051-person-scoped-engines`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Let the money engines see people. Budgets, goals, planning, insights and reports don't know people exist. This is the difference between a labelling system and a household system — and it's the step that makes per-person contribution real."

## Context

Ortho's household system is **descriptive, not operational**. It labels money; it never changes what
the app calculates. A useful test: remove every person from a household except the account holder and
budgets, goals, the plan, insights and reports all compute identically. Only owner chips, the filter
list and one settings line change.

| Layer | Person-aware? |
|---|---|
| `transaction_shares` / splits | **Yes** — exact cents per person |
| `lib/finance/budgets.ts` | No |
| `lib/finance/insights.ts` | No |
| `lib/planning/planSummary.ts` | No |
| `lib/reports/*` | No |
| `lib/finance/personSummary.ts` | Yes — and **nothing imports it** |

`personSummary.ts` (spec 043) already contains the correct attribution math — a person's portion of a
shared expense is their `effectiveShares` slice — but it is wired to a single dashboard row. There is
a scope concept for **time** (`DashboardScopeContext`) and none for **people**.

This feature introduces that missing primitive and threads it through the engines, so "how am *I*
doing" and "how are *we* doing" are the same question asked with a different scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One switch scopes the whole app to a person (Priority: P1) 🎯 MVP

Someone in a shared household wants to see their own picture: what they spent, how their budgets look
against their share, whether their plan is on track — not the household's totals with their name
somewhere in a chip.

A single **scope selector** — "Everyone" or a named person — sits with the existing month/range
controls. Choosing a person re-computes the surfaces below it from that person's share of every
shared transaction. Choosing "Everyone" restores today's household figures exactly.

**Why this priority**: This is the feature. Everything else is a consumer of the primitive it
introduces, and without it each surface would grow its own incompatible person filter.

**Independent Test**: In a household with two or more people, switch the scope from "Everyone" to a
person and confirm the spending figures drop to that person's share of shared transactions; switch
back and confirm the figures match the pre-change household totals byte for byte.

**Acceptance Scenarios**:

1. **Given** a household scope, **When** the user selects a person, **Then** every scoped surface
   recomputes from that person's shares.
2. **Given** a person scope, **When** the user selects "Everyone", **Then** figures are identical to
   the household figures before any scope was chosen.
3. **Given** a shared $60 expense split three ways, **When** scoped to one owner, **Then** it
   contributes exactly $20 — not $60 and not $0.
4. **Given** an expense a person does not own, **When** scoped to that person, **Then** it
   contributes nothing.
5. **Given** a one-person household, **When** any scoped surface renders, **Then** the selector is
   hidden and household scope is used.
6. **Given** a `transfer`, **When** scoped to a person, **Then** it is included only if that person
   is the sender or the recipient, and never counted as spend or income.

---

### User Story 2 - Budgets and the plan answer for one person (Priority: P1)

"Are we over on groceries?" and "am I over on groceries?" are different questions. Today only the
first is askable.

With a person scope active, the Planning hub's budget statuses, at-risk ranking, totals and
"left to plan" are computed from that person's share of spending. The budget's limit is unchanged —
what changes is the spend measured against it.

**Why this priority**: Budgets are the most-visited money surface and the one where a merged wallet
misleads most: a household grocery budget looks blown when two people both contribute to it.

**Independent Test**: Set a budget, record a shared expense in that category, and confirm the
household view counts the full amount while a person view counts only that person's share.

**Acceptance Scenarios**:

1. **Given** a $400 grocery budget and a shared $300 expense split evenly between two people,
   **When** scoped to one person, **Then** spend reads $150 against the $400 limit.
2. **Given** the same data in household scope, **When** the plan renders, **Then** spend reads $300
   (unchanged from today).
3. **Given** a person scope, **When** "left to plan" is computed, **Then** it uses that person's
   share of income and unbudgeted spend.
4. **Given** rollover carry, **When** scoped to a person, **Then** carry is derived from that
   person's scoped history using the same rollover rules.

---

### User Story 3 - Insights and reports respect the scope (Priority: P2)

An insight that says "your dining spend is up 40%" should mean the scoped subject's dining spend.

Insights and the savings/category report helpers accept the same scope, so a person-scoped view
produces person-scoped observations rather than household ones with a personal label.

**Why this priority**: Valuable, but the plan and budgets carry the feature's weight. Insights
correctness matters most once people trust the scoped numbers above.

**Independent Test**: With a scope active, confirm a category-total insight reflects the scoped
subject's share rather than the household total.

**Acceptance Scenarios**:

1. **Given** a person scope, **When** insights generate, **Then** category totals and month-over-month
   deltas use that person's shares.
2. **Given** household scope, **When** insights generate, **Then** output is identical to today's —
   asserted against the existing golden vectors.
3. **Given** a person scope, **When** the savings report computes a rate, **Then** it uses that
   person's scoped income and expenses.

---

### Edge Cases

- **Household scope must be a perfect no-op.** Scoping to "Everyone" must produce byte-identical
  results to the pre-feature engines. The existing golden vectors are the lock.
- **A person with no transactions.** Scoped surfaces show calm zero/empty states, never NaN or a
  divide-by-zero. `savingsRate` already returns null for non-positive income and must keep doing so.
- **A soft-removed person.** Not offered in the selector, but a scope already set to them resolves to
  household scope rather than showing an empty app.
- **A transaction with no share for the scoped person.** Contributes zero, not the full amount.
- **Uneven splits.** The scoped amount is the person's *stored* share, never a recomputed even split
  — the stored cents are authoritative.
- **Budgets have no owner.** A budget limit is household-level; scoping changes measured spend, not
  the limit. This is a deliberate v1 boundary (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a single `MoneyScope` value — household, or a named person — as the
  one representation of "whose money is this" across the app.
- **FR-002**: System MUST provide a pure function that projects a transaction list into a scope,
  replacing each transaction's amount with the scoped person's stored share.
- **FR-003**: Scoped projection MUST use a person's **stored** share cents, never a recomputed split.
- **FR-004**: Scoped projection MUST exclude transactions the scoped person does not own.
- **FR-005**: Scoped projection MUST treat `transfer` transactions directionally — included only when
  the scoped person is sender or recipient, never as spend or income.
- **FR-006**: Household scope MUST be a no-op returning the input unchanged, so existing engine output
  is bit-for-bit preserved.
- **FR-007**: Budget status, at-risk ranking, budget totals and "left to plan" MUST compute from the
  scoped transaction set.
- **FR-008**: Insight generation MUST accept and honor the scope.
- **FR-009**: Savings-rate and category-ranking helpers MUST accept and honor the scope.
- **FR-010**: Users MUST be able to select the scope from one control, and the selection MUST apply to
  every scoped surface simultaneously.
- **FR-011**: System MUST hide the scope control for one-person households and use household scope.
- **FR-012**: System MUST resolve a scope pointing at a removed or unknown person to household scope.
- **FR-013**: All scope logic MUST be pure, deterministic and side-effect free, with the reference
  "today" injected — matching every existing engine in `lib/finance/`.

### Key Entities

- **MoneyScope**: either the whole household, or exactly one person. The single axis this feature
  introduces; complements the existing time scope rather than replacing it.
- **Scoped transaction**: a transaction whose amount has been narrowed to one person's stored share,
  preserving id, date, category and kind so downstream engines need no other change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Household scope produces output identical to the previous release across every existing
  golden vector — zero vector diffs after regeneration.
- **SC-002**: A shared expense split N ways contributes exactly `stored_share` under a person scope,
  for every N from 1 to 6, with scoped amounts summing back to the household total.
- **SC-003**: Switching scope updates every scoped surface from one control, with no surface left
  showing household figures under a person scope.
- **SC-004**: A one-person household sees no scope control and no behavior change.
- **SC-005**: No scoped surface renders NaN, Infinity, or a negative-zero money figure for a person
  with no transactions.

## Assumptions

- **Budget limits stay household-level.** Scoping changes *measured spend*, not the limit. Per-person
  budget limits require a `person_id` column on budgets, which is deferred: the pooling model that
  would justify it is unvalidated, and the measured-spend change delivers most of the value.
- **Goals stay household-level** for the same reason. A goal's progress is its contributions; scoping
  contributions requires attributing them to people, which the contributions table does not yet do.
- **The scope is UI state, not persisted.** It follows the existing dashboard scope pattern — chosen
  per session, not stored. Persisting a default scope is a later refinement.
- **Housing and mortgage surfaces stay household-scoped.** A property is owned by the household; a
  per-person view of a mortgage is not meaningful without an ownership-share model.
- No database migration, no new dependency. Every change is a pure-function parameter plus its
  consumers.
