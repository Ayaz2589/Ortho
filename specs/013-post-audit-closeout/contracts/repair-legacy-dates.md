# Contract: Legacy Date Repair Script

**Entry**: `web/scripts/maintenance/repair-legacy-dates.ts`, wrapped by Make target
`repair-dates` (`make repair-dates [APPLY=1] [ADMIN=1]`). Reuses `scripts/import/db/client.ts
makeClient` (operator OTP session by default; `ADMIN=1` service-role if the key is present) and
`engine/args.ts` flag parsing.

## Modes (FR-004, FR-005)

| Mode | Invocation | Behavior |
|---|---|---|
| Dry run (DEFAULT) | `make repair-dates` | Select + report; **zero writes**. Exit 0 with row count. |
| Apply | `make repair-dates APPLY=1` | Prints the same report, then a confirmation prompt (`type "repair" to proceed`), then updates `date` only, row by row, printing per-row result. |

There is no flag that skips the confirmation prompt — the operator gate is structural.

## Selection (data-model §2)

`date`'s UTC time-of-day ≠ `12:00:00` AND ∈ `[00:00:00, 04:00:00)Z`. Repaired/normal rows never
match (idempotence, FR-005/SC-002).

## Inference

NY calendar day of the instant via `Intl.DateTimeFormat` with `timeZone: 'America/New_York'`
(handles EST/EDT per-instant — no fixed offset). Proposed value:
`<NY-day>T12:00:00.000Z`. **Ambiguous** (FR-006): NY wall-clock ∈ `[00:00, 01:00)` — reported
under a separate `AMBIGUOUS (not repaired)` section, always excluded from APPLY.

## Report format (per row)

`id · stored ISO · NY local rendering · inferred day · proposed ISO · merchant · amount`
followed by totals: `N repairable · M ambiguous · 0 written (dry run)`.

## Write

`update transactions set date = <proposed> where id = <id> and date = <original>` (the `date`
equality guard makes each write race-safe and re-run-safe); any per-row failure is reported and
does not halt remaining rows; non-zero exit if any write failed.

## Tests (all on-sandbox, red-first)

Pure functions `isLegacy(dateISO)`, `proposeRepair(dateISO)` extracted and unit-tested:
window boundaries (23:59:59Z out, 00:00:00Z in, 03:59:59Z in, 04:00:00Z out), noon-UTC excluded,
EST vs EDT instants, DST transition days, ambiguity band, idempotence (proposed output is never
itself legacy). IO wrapper tested with the `web/test/import/` mock-builder: dry run performs no
`update`; APPLY updates only reported non-ambiguous ids with the date guard; partial-failure
reporting.

## Live execution protocol (spec assumption, FR-005)

Dry run may be executed by the agent and the report delivered to the operator. `APPLY=1` runs
only after the operator's explicit go-ahead in conversation, and its output (rows written,
re-run showing zero) is reported back verbatim.
