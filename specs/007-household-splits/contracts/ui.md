# Contract: UI per canvas

Same product, native affordances (Constitution III). Reuse existing components; the split
editor is the only net-new surface. Removals are as important as additions.

## Transaction form (web `TxForm` / iOS `AddTransactionSheet`)

**Remove**: the scope (Personal/Shared) segmented control and all scope-pruning logic; the
dual owner pools.

**Owners**: one chip row drawn from the single household people list (active, non-removed).
Toggle owners; ≥1 always selected.

**Split editor** — shown only when `owners.length >= 2` (any kind: expense or income):
- A method toggle: **Even · By %· By amount** (web `Segmented`/`Seg`; iOS segmented pill).
- `Even`: no inputs; shows the computed per-owner amounts read-only (e.g. "$50.00 each").
- `By %`: a labelled numeric field per owner; live total indicator; computed cents shown.
- `By amount`: a labelled cents field per owner; live "remaining $X" indicator.
- Live reconciliation: the running total/remaining updates as you type; **Save is disabled**
  with a calm message when `validateSplit` fails (`percent_sum` → "Percentages must total
  100%"; `value_sum` → "Amounts must add up to $TOTAL").
- Switching method recomputes from the current owners (even default); changing the amount
  re-derives % /even and re-validates value.
- Single owner ⇒ editor hidden; owner gets the full amount.

**Save**: persists the transaction + one `transaction_shares` row per owner with `amount_cents`
from `computeShares`.

## Transaction detail (web `TransactionDetailBody` / iOS `TransactionDetailSheet`)

- Single owner: show the owner, no split.
- Multiple owners: list each owner with their **exact amount** (e.g. "Maya — $70.00") and a
  derived percentage badge ("70%"). Money tabular, never abbreviated.

## Transactions list + filters (both)

- **Remove** the scope segmented control on the list, the Scope filter, and the scope active-
  filter chip. Search / Category / Kind / Source / Owner / Month remain unchanged.
- Owner filter draws from the unified people list.

## Dashboard per-owner breakdown (web `PerOwnerBreakdownCard` / iOS widget)

- Per person, sum their `transaction_shares.amount_cents` over the period (exact). Expandable
  rows show each transaction with that person's share amount + derived %.
- Per-person totals reconcile to the household total for the period (SC-003).

## Household settings (web `settings/household` + `HouseholdDrawer` / iOS `HouseholdView` +
`AddUserSheet`)

- One plain list of people (no "Local" vs member distinction, no scope footnotes).
- Actions: **add a person by name** (auto-derive initial, pick color), **rename** a person,
  **rename** the household, **remove** a person (soft-remove → hidden from pickers; history
  intact). No invitations/accounts.

## Accessibility (Constitution V)

Numeric split fields are labelled (`aria-label`/SwiftUI label); method toggle is a real
segmented control; ≥44px touch targets; sand focus-visible ring (web); reduced-motion honored;
reconciliation messages are secondary, non-alarmist text, never red.
