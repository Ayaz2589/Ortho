# Feature Specification: Global Text Size

**Feature Branch**: `040-text-size`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "Increase the font-size a tad bit globally without messing up the designs; in Settings add different font sizes to choose from, each of which looks good with the current design. Targeting a lower-income user base which skews older."

## Overview

Ortho's launch market skews lower-income and often older — NYC immigrant / limited-English-proficiency households (`docs/research/market-analysis/nyc-market-language-analysis.md`) where a calm, non-shaming, readable interface is load-bearing, not decorative. Readability is therefore a first-class accessibility concern, consistent with the product's "never shrink type", AA-contrast, and calm-over-dense principles.

This feature does two things:

1. **Nudges the default text a touch larger for everyone** — a subtle global bump so the app reads more comfortably out of the box.
2. **Lets each person pick a comfortable size** in Settings from four levels, where every level scales the whole interface proportionally so the design stays visually intact (nothing is cropped, cramped, or knocked out of alignment).

The chosen size is remembered on the device, survives closing/reopening the app and moving between screens, and takes effect immediately with no visible flash of the previous size on load.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the whole app more comfortably by default (Priority: P1)

An older person opening Ortho for the first time — who has not touched any setting — sees text that is a little larger and easier to read than the previous baseline, across every screen (Dashboard, Transactions, Housing, Settings), while the layout still looks balanced and intentional.

**Why this priority**: This is the core promise — "increase the font-size a tad globally." It delivers value to 100% of users, including the many who will never open Settings, and it is the accessibility win that motivates the feature. It stands alone as a shippable improvement even if the picker (Story 2) were deferred.

**Independent Test**: With no stored preference, load the app and confirm the interface renders at the new default comfortable size (larger than the prior baseline) on every primary screen, with no layout breakage.

**Acceptance Scenarios**:

1. **Given** a device that has never set a text size, **When** the user opens the app, **Then** the interface renders at the default "Medium" comfortable size (a subtle step above the prior baseline) and all four destinations remain correctly laid out.
2. **Given** the default size is active, **When** the user reads money amounts, labels, and controls, **Then** everything scales together proportionally — amounts still read as money, rows stay aligned, and nothing is truncated or overlapping.

---

### User Story 2 - Choose a comfortable text size in Settings (Priority: P1)

A person who finds the default too small (low vision) or prefers the previous denser look opens **Settings → Text size** and picks from four clearly-labelled options. The whole app immediately re-renders at the chosen size, and it stays that way next time they open the app.

**Why this priority**: The explicit ask ("in the settings add different font sizes to choose from"). Directly serves the low-vision / older segment who need more than the default bump, and gives users who preferred the old density a way back. Together with Story 1 this is the MVP.

**Independent Test**: Open the Text size setting, select each of the four options in turn, and confirm the interface visibly rescales and the selection is reflected as active; reload and confirm the last choice persists.

**Acceptance Scenarios**:

1. **Given** the Text size setting is open, **When** the user selects "Large", **Then** the entire interface scales up proportionally and "Large" is shown as the active choice.
2. **Given** the user has selected "X-Large", **When** they close and reopen the app, **Then** the app opens at "X-Large" with no flash of a smaller size first.
3. **Given** the user has selected "Small", **When** they view any screen, **Then** the interface matches the prior baseline density (the pre-feature look), confirming a way back for users who preferred it.
4. **Given** any size is selected, **When** the user navigates between Dashboard, Transactions, Housing, and Settings, **Then** the selected size stays applied across every screen without needing to be re-chosen.
5. **Given** the user changes the size, **When** the change applies, **Then** it takes effect instantly and calmly (no alarming animation), respecting reduced-motion preferences.

---

### User Story 3 - Text size in the reader's own language (Priority: P2)

A Spanish-, Chinese-, Bengali-, Korean-, or Japanese-speaking user finds the Text size setting — its title, option names, and helper text — presented in their own language, consistent with the rest of Settings.

**Why this priority**: Ortho's multilingual reach is a first-class differentiator and the target market is heavily LEP; an English-only accessibility control undercuts exactly the users it is meant to help. Depends on Stories 1–2 existing but is a thin, additive layer.

**Independent Test**: Switch the app language to each supported locale and confirm the Text size section renders fully translated with no English fallback.

**Acceptance Scenarios**:

1. **Given** the app language is set to any supported non-English locale, **When** the user opens the Text size setting, **Then** the section title, the four size labels, and the helper text all appear in that language.

---

### Edge Cases

- **Corrupt or unrecognized stored value**: If the saved preference is missing, empty, malformed, or an unknown value, the app falls back to the default "Medium" size rather than failing or rendering unscaled.
- **First paint / no flash**: On a cold load with a non-default size stored, the app must render at the stored size from the first paint — the user must not briefly see the default size and then a jump.
- **Smallest size and touch input**: At the smallest ("Small") size, on-screen text-entry fields must still not trigger the mobile browser's zoom-on-focus behavior (the interface must not become *smaller* than the prior baseline that already guarded against this).
- **Largest size and dense screens**: At "X-Large", content-heavy screens (dashboard widgets, long transaction lists, settings) must remain usable — scrolled rather than clipped — with money amounts never abbreviated to fit.
- **Interaction with light/dark appearance**: Choosing a text size must not disturb the separately-stored light/dark appearance preference, and vice versa.
- **Per-device nature**: The size is remembered per device/browser; a user on two devices may have two different sizes, and that is acceptable (matches how appearance/language/currency already behave).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide exactly four selectable text sizes, in ascending order: **Small**, **Medium**, **Large**, **X-Large**.
- **FR-002**: The system MUST scale the entire interface *proportionally* at each size (a whole-UI comfortable scale), not merely enlarge glyphs, so that spacing, controls, and alignment remain visually consistent with the current design at every level.
- **FR-003**: The default size, when the user has expressed no preference, MUST be **Medium** — a subtle step above the pre-feature baseline (the "increase globally a tad" bump). **Small** MUST reproduce the pre-feature baseline exactly.
- **FR-004**: The relative scale steps MUST be gentle and evenly graded so each size "looks good" with the current design: Small = baseline (1.00), Medium ≈ +6%, Large ≈ +14%, X-Large ≈ +22% (approximate; final values tuned during design, but Small MUST equal baseline and steps MUST increase monotonically).
- **FR-005**: The system MUST expose the choice as a dedicated **Text size** section within Settings, consistent with the existing appearance/theme settings pattern (a single-select list of the four options with the active one clearly indicated).
- **FR-006**: Selecting a size MUST apply it to the whole app immediately, without a page reload and without requiring the user to confirm or navigate away.
- **FR-007**: The selected size MUST persist on the device across app restarts and across in-app navigation between all screens.
- **FR-008**: On load, the stored size MUST be applied before first paint, so no flash of a different size is visible.
- **FR-009**: If the stored preference is absent, empty, malformed, or an unrecognized value, the system MUST fall back to **Medium** and MUST NOT render the app unscaled or in an error state.
- **FR-010**: The Text size setting (section title, the four option labels, and any helper text) MUST be fully translated in every language Ortho supports, with no untranslated (English-fallback) strings for supported locales.
- **FR-011**: Changing the text size MUST NOT alter any other stored preference (light/dark appearance, language, display currency, dashboard scope, widget choices), and those preferences MUST NOT alter the text size.
- **FR-012**: Applying any size MUST NOT re-introduce the mobile zoom-on-focus problem: at every size, text-entry fields on touch devices MUST remain at or above the threshold that prevents the browser from auto-zooming when a field is focused.
- **FR-013**: The size change MUST be applied calmly (no alarming or bouncing animation) and MUST respect the user's reduced-motion preference.
- **FR-014**: Every size MUST preserve the money-formatting and calm-design guarantees: amounts read as money and are never abbreviated to fit, meaning is carried by weight/position not color, and no size shrinks primary reading text below the pre-feature baseline.

### Key Entities *(include if feature involves data)*

- **Text size preference**: A single per-device value identifying which of the four sizes is active. Has a well-defined default (Medium) and a defined ordering (Small < Medium < Large < X-Large). Stored locally on the device; not associated with a server account. Read on every load and written whenever the user changes it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user (no stored preference) sees the app at the new default comfortable size on 100% of the four primary screens, with the default reading measurably larger than the pre-feature baseline.
- **SC-002**: A user can change the text size and see the whole app rescale in a single action (one selection, no reload, no confirmation step).
- **SC-003**: 100% of the four sizes render every primary screen without clipped, overlapping, or truncated content and without abbreviating money amounts.
- **SC-004**: The chosen size survives 100% of app restarts and screen navigations without being reset.
- **SC-005**: On a cold load with a non-default size stored, 0 users observe a flash of a different size before the correct one.
- **SC-006**: 100% of the Text size UI strings are presented in the user's selected language across every supported locale (no English fallback).
- **SC-007**: Selecting "Small" reproduces the pre-feature baseline layout, giving users who preferred the previous density an exact way back.
- **SC-008**: At every size, focusing a text-entry field on a touch device does not trigger browser auto-zoom.

## Assumptions

- **Per-device, not per-account**: Like the existing appearance, language, and display-currency preferences, text size is stored locally on the device and is intentionally not synced to a server account. Cross-device sync is explicitly out of scope.
- **Whole-UI proportional scale**: "Increase font size without messing up the design" is best satisfied by scaling the entire interface proportionally rather than resizing individual text elements, which keeps the design pixel-proportional and avoids per-element breakage. (Chosen by the requester over a text-only approach.)
- **Four levels are sufficient**: Small / Medium / Large / X-Large covers the range from "previous density" to "clear low-vision comfort" without overwhelming the picker; a smaller-than-baseline option is intentionally not offered (the product never shrinks type below baseline).
- **Mirror the appearance/theme pattern**: The setting reuses the established per-device-preference and pre-paint application pattern already used for light/dark appearance, for consistency and to guarantee no-flash behavior.
- **Supported locales are the current set** (English source plus Spanish, Simplified Chinese, Bengali, Korean, Japanese); adding future languages is out of scope here but the strings are added in the same way as all other UI strings.

## Out of Scope

- Per-element or per-screen font controls (e.g., "make only amounts bigger").
- Syncing the text-size preference to the user's account or across devices.
- A wholesale refactor of how individual components express their sizes (e.g., migrating every component from fixed pixels to relative units); the feature is delivered through a single global scaling mechanism, not a component-by-component rewrite.
- Changing fonts, weights, colors, or spacing tokens beyond the uniform scale.
- A smaller-than-baseline ("compact"/"tiny") size.
