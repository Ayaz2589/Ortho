# Specification Quality Checklist: Widget Detail Panels

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Two decisions that would otherwise have been `[NEEDS CLARIFICATION]` markers were resolved
with the user before the spec was written, and are recorded in **Assumptions** with their
consequences rather than left open:

1. Mobile presentation — the shared drawer's existing full-screen mode, not a route per
   widget. The accepted cost (no panel URL, no back-gesture dismissal) is stated explicitly
   rather than glossed.
2. Base-branch scope — the frame plus two structurally dissimilar reference panels, with the
   shared primitives kit extracted from them afterwards rather than designed in advance.

**On "no implementation details":** the spec deliberately references three things that already
exist — the 1024px expanded breakpoint, the shared right-side drawer, and the per-widget
declaration that adding a panel extends. These are treated as passing because each is an
inherited **constraint** rather than a new implementation choice: the breakpoint is fixed by
the project constitution's responsive contract, the drawer is the app's established
master–detail affordance across several surfaces, and the single-declaration rule is what
SC-006 measures in order to make the parallel build safe. No new mechanism, data shape, or
technology is prescribed.

**Two requirements carry non-obvious reasoning** and should survive into planning intact:

- **FR-015** (balances read the whole ledger, never person-projected rows). This is not a
  stylistic preference. Projection would silently produce "all settled up" for a household
  that owes money — a plausible wrong answer rather than a visible failure. The corresponding
  card already carries a warning comment against exactly this refactor.
- **FR-013** (every panel states its period and subject). The panel is a large surface of
  derived numbers that covers the very controls naming its scope. A panel whose figures and
  caption can disagree reintroduces the mixed-subject defect spec 056 was written to remove.

**Story count vs. sandbox count:** the spec covers **nine** panels, not eight — the registry
holds ten data widgets, and financial health is the only one excluded. US1–US3 form the base
branch; **seven** panels remain as parallel follow-ups.
