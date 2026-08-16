# Tasks: Shared Ownership by Default

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Status**: ✅ complete

## US1 — a shared household's spending is shared by default (P1)

- [x] T001 `resolveDefaultOwnerIds()` in `web/lib/defaultOwner.ts` — every active person when
      the household has >1 and the preference is on; otherwise the byte-identical single-owner result.
- [x] T002 Unit tests: solo, multi, preference off, removed people excluded, never-empty fallback.
- [x] T003 `TxForm` uses it for NEW transactions only; `editing`/copy branches untouched.
- [x] T004 Share-sum property test over owner sets 1–6 on non-divisible amounts.
- [x] T005 Form tests: default owner set, persisted share rows, indivisible amounts, solo unchanged.

## US2 — narrowing takes one tap (P1)

- [x] T006 `ownAll()` / `ownJustMe()` beside `toggleOwner`, both re-splitting evenly.
- [x] T007 "Who is this for?" `Seg` row, rendered only for multi-person non-transfer forms.
- [x] T008 Preset state DERIVED from the owner set, so a custom subset activates neither.
- [x] T009 Tests: both presets, one-tap narrow/expand, custom shows neither, hidden when solo.

## US3 — opt out (P2)

- [x] T010 `web/components/settings/sharedByDefault.ts` (`ortho.sharedByDefault`, default true).
- [x] T011 Settings → Household toggle row, hidden for one-person households; read after mount
      so the static export never hydrate-mismatches.
- [x] T012 Preference tests: default, round-trip, unrecognized value coerces to default.

## Cross-cutting

- [x] T013 CSV import threads a default owner **list** through the session reducer.
- [x] T014 i18n ×5 — "Who is this for?", "Just me", "Shared by default", + the settings caption.
- [x] T015 Five existing form suites pin the preference OFF (their subject is split/accordion/
      validation mechanics); all 41 cases pass **unmodified** — the proof only the default moved.
- [x] T016 `tsc --noEmit` clean; full suite green; vectors regenerate with no diff.
