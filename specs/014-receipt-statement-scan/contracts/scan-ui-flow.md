# Contract: Scan UI flow

**Scope**: every user-visible behavior of the feature. Design-token-only; all copy via
`Localizable.xcstrings` ×6 languages (FR-020). State machine: [data-model.md](../data-model.md).

## Entry (AddTransactionSheet, add mode only)

- Capsule row at top: `Copy from recent` · `Scan` (new, SF Symbol `doc.viewfinder`),
  same capsule style (accent text on `text.opacity(0.05)` fill). Absent in edit mode
  and for transfers (FR-001).
- Tap → SwiftUI `Menu`: **Camera** / **Photo Library** / **Choose File** (FR-002).
  Cancel from any source returns the form untouched (US1 #5).
- While parsing: capsule shows a quiet inline "Reading…" state (ProgressView +
  caption, text2); the form stays interactive; a second tap is ignored until done.

## Receipt path

- Form prefills **in place**: amount hero, merchant, date, plus guesses (category,
  owners/split, FX original amount). Caption under the capsule row, text2:
  `Filled from scan — review before adding` (FR-005).
- **Guessed affordance** (FR-016): each guessed field shows a one-word text3 label
  `Guessed` beside its form label. First edit of that field removes it permanently for
  this entry. No colors, no icons, no animation beyond the standard field behavior.
- **Duplicate line** (FR-015): single text2 caption above the Add button:
  `Looks like a duplicate of {merchant}, {date} — add anyway?` — informational only;
  Add stays enabled per normal validation.
- Validation/save identical to manual entry (FR-006). "Save and add another" keeps its
  existing semantics; the scan caption and remaining guess markers clear on reset.

## Statement interstitial (sheet content replacing the form body)

- Title: `Review statement`. Body lines (text token sizes per AppTheme):
  `{n} rows found · {d} look like duplicates` (plural-aware), payment rows counted in a
  second quiet line when present: `{p} card payments will be skipped`.
- Toggle: `Skip duplicates` — default ON (FR-007).
- Primary: `Start review`. Secondary: `Cancel` (back to untouched form, session
  discarded). Nothing saves here.

## Wizard (AddTransactionSheet + chrome)

- Progress header replaces the sheet title: `{i} of {n}` (text2, tabular digits).
- The form body is the standard add form, prefilled from the current candidate with
  guess markers; direction flippable (FR-011).
- Buttons: primary `Add and next` (replaces Add; on last row `Add and finish`),
  secondary `Skip`, toolbar `Stop` (always visible, replaces Cancel) (FR-008).
- `Add and next` = exactly one existing optimistic add (FR-009); on server failure the
  standard rollback + "Something didn't save" alert fires and the wizard stays on the
  failed row (edge case) — never silently advances.
- Pre-skipped rows (duplicates when toggle ON, payment rows always by default) are
  never shown; they surface only in the summary counts (FR-012/FR-015).

## Summary (sheet content)

- `{a} added · {s} skipped · {d} duplicates left out` (plural-aware; zero-count
  segments omitted). Single button: `Done` → dismiss sheet, session released (FR-010).
- Reached from the last row or from Stop at any point (US2 #3).

## Failure state

- In-form quiet block replacing the caption: `Couldn't read this. Try a flatter,
  brighter photo.` + `Retake` capsule (reopens last source). No red anywhere; prior
  form contents untouched (FR-017).

## Accessibility & constitution checks

- All controls are real Buttons/Toggles, ≥44 pt targets, VoiceOver labels including
  the guessed markers ("Category, guessed value: Groceries").
- Money renders through existing `Money` formatting (tabular, U+2212, never
  abbreviated). Dynamic type respected like the rest of the form.

## New string catalog keys (binding names)

`scan.capsule`, `scan.source.camera`, `scan.source.library`, `scan.source.file`,
`scan.reading`, `scan.filled_caption`, `scan.duplicate_line %@ %@`,
`scan.guessed`, `scan.interstitial.title`, `scan.interstitial.rows %lld`,
`scan.interstitial.duplicates %lld`, `scan.interstitial.payments %lld`,
`scan.interstitial.skip_duplicates`, `scan.interstitial.start`,
`scan.wizard.progress %lld %lld`, `scan.wizard.add_next`, `scan.wizard.add_finish`,
`scan.wizard.skip`, `scan.wizard.stop`, `scan.summary.line %lld %lld %lld` (or split
per-segment plural keys at implementation discretion), `scan.summary.done`,
`scan.failed.copy`, `scan.failed.retake`, plus the camera purpose string (build
setting, English-only per platform convention). All keys translated ×6; বাংলা uses
Latin digits via the existing locale plumbing.
