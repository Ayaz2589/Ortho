# Specification Quality Checklist: Savings & Debts — replacing the Goals section

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-01
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

Two questions that would otherwise have been `[NEEDS CLARIFICATION]` markers were resolved with the
user before the spec was written, so none remain in the document:

1. **Naming** — the container is renamed to "Savings & Debts" in member-facing copy across all six
   languages (FR-028, FR-030). The design prototype still labelled it "GOALS"; the user chose the
   rename. Code, table, and route names keep `goal` (FR-031).
2. **Reach** — the dashboard widget body and the spec-057 detail panel are in scope (US5, FR-029),
   beyond the two surfaces the handoff drew. Both are *adapted* to the vocabulary rather than
   transcribed, since neither was drawn.

Three questions the handoff itself raised are recorded in Assumptions rather than left open, matching
the handoff's own stated resolutions: the three-contribution projection floor, the rounding of a
partial final payment, and items with no target amount being out of scope.

Deliberately excluded from Success Criteria: pixel measurements from the prototype. The spec states
the *invariants* the measurements exist to protect (constant collapsed height SC-002, a shorter
section SC-003) so they can be verified without transcribing a static mock.
