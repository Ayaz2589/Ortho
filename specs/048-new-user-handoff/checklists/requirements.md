# Specification Quality Checklist: New-User Hand-Off to Financial Health

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-15
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
- [x] Success criteria are technology-agnostic
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

**Scaffolded, not clarified.** Written from `docs/plan/onboarding-funnel.md` and the contracts spec
045 shipped. Has NOT been through `/speckit-clarify`. Run `/speckit-plan` next.

**This feature reverses a prior deliberate decision, and the reversal is the risk.** Spec 041
hard-redirected every profile-less user into the questionnaire; spec 042 deleted that redirect on
purpose and replaced it with a dismissible announcement. Reintroducing a hard hand-off for
funnel-walkers **only** is the whole scope. If an implementer widens it to "any new user", spec 042
has been undone — US2 and SC-002 exist to catch exactly that, and every spec 041/042 test must still
pass (SC-006).

**The design's crux, easy to get wrong**: the decision keys on the funnel record, **not** on profile
absence, because `web/app/sign-in/page.tsx` renders outside the app's data provider and cannot read
the profile. The profile check belongs at the questionnaire's entry guard instead. That is why
FR-004 is a separate requirement from FR-001 rather than a clause inside it.

**Do not reintroduce the zero-income profile.** Spec 042 made skipping dismiss-only because writing
neutral defaults produced a misleading score from no data. FR-007/FR-008 restate that; US3 tests it.

**Testable before spec 047 exists** — nothing sets the funnel record until the tour ships, so test
by setting it directly. This feature merges independently of 046 and 047.
