# Contract: presentation rules for Savings & Debts

**Feature**: `specs/059-savings-debts-redesign`

What every surface must honour. These are the rules a reviewer checks, and each maps to a test.

## P1 — Direction of travel is the type signal

| | Savings | Debt payoff |
|---|---|---|
| Headline | `{saved} saved` | `{left} left` |
| Percentage verb | `{n}% funded` | `{n}% paid` |
| Bar | one segment, anchored **left**, grows with contributions | remaining segment anchored **right**, depletes toward zero; paid share behind it at 22% opacity |
| Track caption | `{remaining} to go` / `{target}` | `{paid} paid` / `{target}` |
| Finish line | `Funded by {month} — {n} more deposits` | `Clear by {month} — {n} more payments` |
| Icon | outlined ring, `--positive` glyph, arrow **up** | filled `--surface-2` well, `--text-2` glyph, arrow **down** |

**One hue only.** Both use `--positive` at varying opacity. Introducing a second hue to separate the
two kinds is a contract violation (FR-033), not a styling preference.

## P2 — Never red, never alarming

No surface in this feature may render any element in a warning or error colour, under any data
condition — including a missed month, a later projection, an off-plan pace, and a zero-contribution
item (FR-032). A missed month is read by **absence plus a dashed outline**. A later what-if delta is
`--text-3`, the same as a neutral one; only *sooner* is marked, in `--positive` (FR-022, FR-034).

## P3 — The collapsed card is fixed-height

A card's collapsed height must not vary with its contribution count (FR-014, SC-002). The disclosure
row states the count; it does not list them. Pinned by rendering the same item with 3 and 30
contributions and asserting an identical rendered structure.

## P4 — Nothing is stated that isn't derivable

When `projection.available` is `false`, the surface renders the honest line ("Not enough history to
project yet") and **no** month, payment count, streak, or chart. No surface may compute its own
fallback date (contract C4).

## P5 — Tokens only

Every colour, size, radius, and duration resolves to a design token or an existing Tailwind theme
value. The handoff's hex values (`#A6C4A4`, `#141311`) are the *token values* and must be referenced
as `var(--positive)` / `var(--surface)`, never inlined (Constitution I). The prototype's `rgba(...)`
opacity variants are permitted where they already appear in the codebase's idiom (`color-mix` or
literal rgba over a token hue), matching `CycleStrip` and `SpendHeatmap`.

## P6 — Tabular figures everywhere
Every money, percentage, count, and date value carries `tabular-nums` (FR-036).

## P7 — Real controls, keyboard-reachable
The disclosure is a `<button>` with `aria-expanded`; the progress bar keeps `role="progressbar"` with
`aria-valuenow`/`aria-valuetext`; ledger edit/delete are `<button>`s with accessible labels; hit
targets ≥ 40px (≥ 44px touch). `prefers-reduced-motion` drops the disclosure animation to instant
(Constitution V, research R7).

## P8 — No horizontal overflow
A long item name truncates at the column edge and never widens its row (spec Edge Cases). Every flex
row carrying a name uses `min-w-0` on the shrinking child and `shrink-0` on the value — the defect
class `fix/058-mobile-horizontal-scroll` catalogues on a parallel branch. New panel rows must not
reintroduce it.

## P9 — Copy reads "Savings & Debts"

No member-facing string in this feature says "Goals" (FR-028). This includes the Planning section
title, the dashboard widget title and description, the empty states, and the detail page. Code names,
table names, routes (`/planning/goals?id=`), component names, and the widget registry `id` (`'goals'`)
are **unchanged** — the `id` is a localStorage key and changing it would reset every existing user's
dashboard layout (research R5). Pinned by a test asserting the id is still `'goals'`.

## P10 — Six languages, no fallback
Every new or renamed key resolves in `bn`, `es`, `ja`, `ko`, `zh`; English is the identity source
(SC-009, FR-030). A key present in the source but missing from a catalog is a failure, not a silent
English fallback.

## P11 — Cadence is described, never promised
Copy states observed behaviour ("$600/mo since Feb 2026"), never a future action the app will take
("we'll withdraw $600") (FR-037). No surface recommends an amount or judges pace (FR-035): the what-if
table offers levers without endorsing one.
