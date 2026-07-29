# Implementation Plan: Most-common copy + merchant name suggestions

**Branch**: `feat/032-common-copy-name-suggest` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-common-copy-name-suggest/spec.md`

## Summary

Two additive, client-side improvements to the shared add/edit transaction form
(`web/components/web/TxForm.tsx`), both driven by the household's own ledger:

1. **Copy from most common** — the New-form copy shortcut (`TxCopyList`) is re-ranked
   from newest-first to **merchant-frequency-first**, de-duplicated to one representative
   (most-recent) entry per merchant, and relabeled "Copy from most common".
2. **Merchant name suggestions** — the form's merchant/payer `<input>` gains the same
   as-you-type `<datalist>` suggestion affordance the CSV import review already uses,
   **kind-aware** (expense merchants vs income payers), on Add and Edit.

The testable logic is extracted into one new pure module, `web/lib/txSuggest.ts`, which
reuses the existing, tested `rankedMerchants`/`suggestMerchants`/`normalizeMerchant`
pure functions from `web/lib/csv/merchantSuggest.ts` (they are not CSV-specific despite
the folder). No DB/schema/API change; money and split logic are untouched.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19 / Next.js (App Router, static export)

**Primary Dependencies**: React, Next.js, Vitest + React Testing Library, existing
`web/lib/csv/merchantSuggest.ts` (`rankedMerchants`, `suggestMerchants`, `normalizeMerchant`)

**Storage**: N/A — reads `useApp().transactions` already loaded into the form context; no
new persistence, no migration.

**Testing**: Vitest + @testing-library/react, matching `web/test/` conventions (jsdom,
`test/setup.ts`). Pure helpers unit-tested; form behavior tested via accessible DOM.

**Target Platform**: Web (responsive phone→desktop) + the Capacitor-wrapped iOS shell —
same shared form body, so both surfaces change together.

**Project Type**: Web application (single `web/` codebase; the constitution's one
canonical implementation).

**Performance Goals**: Instant, interaction-time UI; ranking runs over the in-memory
ledger inside a `useMemo`. No perceptible latency for realistic household ledger sizes.

**Constraints**: Additive only; reuse existing tested logic; do NOT modify `lib/splits.ts`,
the money golden vectors, or the transfer/reimbursement form branch; keep the shared
mobile+desktop form body in sync; tokens-only styling; semantic controls + a11y.

**Scale/Scope**: 2 components touched (`TxForm.tsx`, `TxFormPageClient.tsx`), 1 new pure
lib module, 5 i18n catalogs, ~4 new test files. No backend.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| I. One Design System, Tokens Only | ✅ Reuses existing token-based styles (`ow-*` classes, `var(--*)`). No new colors/sizes. Suggestion chips mirror the CSV editor's existing token usage. |
| II. Calm Over Dense | ✅ Purely a re-ranking + an existing suggestion affordance; no new density, no new chrome. Copy list keeps its current layout. |
| III. Right Form Factor Per Canvas | ✅ Shared form body changes identically on mobile (modal) and desktop (drawer/page); no canvas-specific divergence introduced. |
| IV. Plainspoken Voice & Money Formatting | ✅ "Copy from most common" is plainspoken; money rendering untouched (`formatMoney`). |
| V. Accessible & Interaction-Complete | ✅ Copy rows stay `<button>`; merchant field stays a labelled `<input>` with a native `<datalist>` (keyboard-reachable, screen-reader friendly). Free-form typing preserved. |
| VI. Test-Driven & Regression-Safe (NON-NEGOTIABLE) | ✅ Pure ranking/known-names logic developed test-first in `web/lib/txSuggest.ts`; component behavior asserted via DOM. Money/splits vectors untouched and must stay green. |

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/032-common-copy-name-suggest/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ui-behavior.md   # Phase 1 output — behavioral contract for the two touch points
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
web/
├── lib/
│   ├── txSuggest.ts                 # NEW — pure helpers (most-common ranking + kind-aware known names)
│   └── csv/merchantSuggest.ts       # REUSED (unchanged) — rankedMerchants / suggestMerchants / normalizeMerchant
├── components/web/
│   ├── TxForm.tsx                   # EDIT — TxCopyList ranking + relabel; merchant input gains <datalist>
│   └── TxFormPageClient.tsx         # EDIT — mirror any copy-picker label/behavior on the full-page surface
├── lib/i18n/
│   ├── bn.ts es.ts ja.ts ko.ts zh.ts# EDIT — add "Copy from most common" (+ empty-state) keys
└── test/
    ├── lib/txSuggest.test.ts        # NEW — unit tests for the pure module
    ├── web/tx-copy-most-common.test.tsx  # NEW — copy list ranks by frequency, prefills, relabel
    └── web/tx-merchant-suggest.test.tsx  # NEW — kind-aware datalist suggestions on add + edit
```

**Structure Decision**: Single `web/` app. Testable logic is isolated in a new pure
module (`web/lib/txSuggest.ts`) that reuses the CSV module's pure primitives; the two
components consume it. This keeps Principle VI's "pure logic locked by unit tests" intact
while the components are tested for observable behavior only.

## Complexity Tracking

> Not required — Constitution Check passed with no violations.
