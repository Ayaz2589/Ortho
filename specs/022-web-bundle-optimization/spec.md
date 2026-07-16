# Feature Specification: Web Bundle Optimization (Static-Export-Safe Code-Splitting)

**Feature Branch**: `022-web-bundle-optimization`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Reduce the web app's initial-load JavaScript by lazy-loading the heaviest, least-frequently-needed parts of the bundle — without changing any behavior or visuals, and without breaking the static-export + Capacitor iOS delivery model."

## Overview

The Ortho web app is the single canonical implementation, delivered to two targets from one static export: an ordinary responsive browser app and a Capacitor-wrapped iOS app. Today the app ships **all** of its JavaScript eagerly — nothing is loaded on demand — so the heaviest and least-frequently-used code (charts, the receipt/statement scan pipeline, and the desktop-only interface) sits in the initial download that every user pays for on first load, on both targets.

This feature reduces the initial-load JavaScript by deferring those heavy pieces so they download only when they are actually needed, while keeping the app's behavior and appearance **exactly** the same and keeping the static-export delivery model intact so the iOS app is unaffected.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Faster first load by deferring charts (Priority: P1)

A person opens Ortho (in the browser or the iOS app). The core money figures they came to see appear as fast as possible; the richer chart visualizations fill in a moment later rather than being part of the very first thing that must download.

**Why this priority**: Charts are the single heaviest dependency in the app and render on only two of the four destinations (Dashboard, Housing), yet they are currently part of the download every user pays for before seeing anything. Deferring them is the largest, lowest-risk reduction in initial-load weight, and it directly protects the product's "money is the headline, tap response feels immediate" promise. It is independently valuable even if nothing else in this feature ships.

**Independent Test**: Build the app and confirm the charting code is no longer present in the initial/shared download and instead loads as a separate on-demand piece; open the Dashboard and confirm the summary numbers appear first and the charts still render correctly a moment later with no visual difference from today.

**Acceptance Scenarios**:

1. **Given** a freshly built app, **When** the initial download is inspected, **Then** the charting library is not part of the initial/shared download and appears only as a separately-loaded piece.
2. **Given** the Dashboard, **When** it opens, **Then** the money summary renders immediately and each chart renders correctly once its code has loaded, identical in appearance to the current app.
3. **Given** the Housing detail with a mortgage, **When** it opens, **Then** the amortization/mortgage chart renders correctly after its code loads, unchanged in appearance.
4. **Given** a destination with no charts (Transactions, Settings), **When** it opens, **Then** no charting code is downloaded at all.

---

### User Story 2 - Defer the scan pipeline until a scan starts (Priority: P2)

A person who never taps "scan a receipt/statement" in a session never downloads the scanning code at all; a person who does tap it gets the scanning experience loaded on demand at that moment.

**Why this priority**: The on-device scan pipeline (capture parsing, heuristics, inference, and its interface) is substantial code that is only relevant to an occasional, explicitly-initiated action, yet it is currently pulled into the initial download of the Transactions destination. Deferring it removes meaningful weight from a primary destination for the majority of sessions that never scan.

**Independent Test**: Build the app and confirm the scan-pipeline code is not in the Transactions destination's initial download; open Transactions without scanning and confirm scanning code was never fetched; then initiate a scan and confirm the scanning experience loads and works exactly as it does today.

**Acceptance Scenarios**:

1. **Given** the Transactions destination, **When** it opens without a scan being initiated, **Then** the scan-pipeline code is not downloaded.
2. **Given** the Transactions destination, **When** the user initiates a scan, **Then** the scan experience loads on demand and behaves identically to the current app (capture, parse, prefill).
3. **Given** the scan code has already loaded once in a session, **When** the user initiates a scan again, **Then** it opens without re-fetching.

---

### User Story 3 - Each form factor stops carrying the other's interface (Priority: P3)

A person on a phone-sized canvas (including the iOS app) does not download the desktop-only interface composition, and a person on a desktop canvas does not download the mobile-only composition.

**Why this priority**: The app has a distinct desktop interface layer (sidebar layouts, master–detail, slide-out drawer, desktop transaction form) separate from the mobile/Capacitor interface. Only one applies to any given session, but both are currently bundled. Serving only the relevant one trims weight from every session. It is lowest priority because it is the most involved split and the least heavy of the three, and it must be done carefully to avoid any flash of the wrong layout.

**Independent Test**: Build the app; on a mobile-sized canvas confirm the desktop composition code is not part of the initial download and the mobile interface renders with no wrong-layout flash; on a desktop canvas confirm the reverse; confirm behavior and appearance are unchanged on both.

**Acceptance Scenarios**:

1. **Given** a mobile-sized canvas (or the iOS app), **When** a destination opens, **Then** the desktop-only composition code is not downloaded and the mobile interface renders correctly with no visible wrong-layout flash.
2. **Given** a desktop-sized canvas, **When** a destination opens, **Then** the mobile-only composition code is not downloaded and the desktop interface renders correctly.
3. **Given** either canvas, **When** the user interacts with the loaded interface, **Then** all behavior is identical to the current app.

---

### User Story 4 - Every split is measured, not assumed (Priority: P1)

A developer (or CI) can produce a clear before/after measurement of the built download sizes, so each optimization is proven to actually reduce initial-load weight rather than merely reorganizing it.

**Why this priority**: Without measurement, code-splitting can look done while accidentally shifting weight around, duplicating code across pieces, or regressing. A repeatable size measurement is the acceptance instrument for every other story in this feature, so it lands first. It is P1 because the other stories cannot be credibly accepted without it.

**Independent Test**: Run the measurement on the current app to capture a baseline, apply a split, run it again, and confirm it reports the change in initial-load and total sizes in a human-readable form.

**Acceptance Scenarios**:

1. **Given** the current app, **When** the measurement is run, **Then** it reports the initial-load download size and a per-piece breakdown in a readable form.
2. **Given** a change that moves code out of the initial download, **When** the measurement is re-run, **Then** the reported initial-load size decreases and the change is attributable to the moved code.

### Edge Cases

- **Chart/scan code fails to load** (flaky network mid-session): the deferred piece must fail gracefully — the surrounding screen stays usable and the money figures remain visible; a failed chart/scan load must not blank the whole screen.
- **Slow load of a deferred piece**: while a chart or the scan experience is still loading, the surrounding screen must remain interactive; there must be no layout jump that shifts the money figures when the deferred piece appears (reserve its space).
- **Wrong-layout flash on form-factor split**: the correct form-factor interface must be chosen before first paint of that region, so a mobile user never sees a flash of the desktop layout (or vice versa).
- **iOS (Capacitor) delivery**: the optimization must not require any runtime server; the app must still export to fully static files that the iOS shell can wrap and load offline from the app bundle.
- **Server-side/prerender safety**: deferred pieces that depend on browser-only measurement (e.g. charts) must be excluded from any build-time prerendering so the static export still succeeds.
- **Behavior parity**: the regression-vector parity suites and all existing tests must remain green — this feature changes *when* code loads, never *what* it computes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST defer the charting visualization code so it is not part of the initial/shared download and is fetched only when a screen that renders a chart is shown.
- **FR-002**: The system MUST render the primary money figures on the Dashboard immediately, independent of whether the chart code has finished loading.
- **FR-003**: The system MUST render each chart identically to the current app once its code has loaded (no visual change).
- **FR-004**: The system MUST NOT download charting code on destinations that render no charts.
- **FR-005**: The system MUST defer the receipt/statement scan-pipeline code (parsing/heuristics/inference and its interface) so it is not part of the Transactions destination's initial download.
- **FR-006**: The system MUST load the scan experience on demand when the user initiates a scan, and it MUST behave identically to the current app (capture → parse → prefill).
- **FR-007**: The system MUST NOT re-fetch a deferred piece that has already loaded within the same session.
- **FR-008**: The system MUST serve only the interface composition for the active form factor, so a mobile/iOS session does not download the desktop-only composition and a desktop session does not download the mobile-only composition.
- **FR-009**: The system MUST select the correct form-factor interface before first paint of that region, with no visible wrong-layout flash.
- **FR-010**: Deferred pieces MUST fail gracefully: a load failure of a chart or the scan experience MUST leave the surrounding screen usable and MUST NOT blank the money figures.
- **FR-011**: Deferred pieces MUST NOT cause a layout shift of the money figures when they appear (their space is reserved while loading).
- **FR-012**: The system MUST provide a repeatable measurement of built download sizes that reports the initial-load size and a per-piece breakdown in a human-readable form, usable for before/after comparison.
- **FR-013**: The optimization MUST preserve the static-export delivery model: the app MUST continue to build to fully static files with no runtime server, no server endpoints, and no server-rendered runtime data, so the Capacitor iOS target is unaffected.
- **FR-014**: The change MUST NOT alter any computed result or user-visible behavior: all existing automated tests (including the finance regression-vector parity suites) and the type check MUST pass unchanged.
- **FR-015**: The system MUST NOT introduce a new design token, color, copy string, or visual treatment (this is a delivery optimization only, governed by the existing design system).

### Key Entities

- **Initial-load download**: the set of code every user must fetch before the app is usable; the primary quantity this feature reduces.
- **Deferred piece**: a unit of code (charts, scan pipeline, a form-factor interface layer) separated from the initial-load download and fetched on demand.
- **Form factor**: the canvas class (mobile/iOS vs. desktop) that determines which interface composition applies to a session.
- **Size measurement**: a human-readable report of initial-load and per-piece download sizes, captured before and after each split.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The initial-load JavaScript download shrinks measurably versus the current baseline, with the charting library, the scan pipeline, and the non-active form-factor interface no longer present in the initial/shared download (each verified by the size measurement).
- **SC-002**: On destinations that render no charts, zero charting code is downloaded; in sessions with no scan initiated, zero scan-pipeline code is downloaded.
- **SC-003**: The Dashboard's primary money figures are visible on first paint regardless of chart-code load state (charts fill in after, with no layout shift of the figures).
- **SC-004**: Every deferred chart, the scan experience, and both form-factor interfaces render and behave identically to the current app — zero visual or behavioral differences observable by a user.
- **SC-005**: All existing automated tests (including the regression-vector parity suites) and the type check pass unchanged, and the app still produces a working fully-static export that the iOS shell can wrap.
- **SC-006**: A before/after size measurement is produced and recorded for each split, attributing the reduction to the moved code.

## Assumptions

- **Delivery model is fixed**: the Capacitor iOS app stays; the static-export delivery model (no runtime server) is a hard constraint, not up for revisiting in this feature. (Decision confirmed with the requester.)
- **No behavior/visual change is intended**: this is purely about *when* code loads, never *what* it does or how it looks; any observable change is a regression.
- **iOS build verification is via CI**: the local (Linux) environment can build the static export and run the full test suite and type check, but cannot build the iOS app; the existing Capacitor iOS CI on push is the iOS build signal. Because the changes are static-export-safe by construction, the iOS build is expected to be unaffected.
- **"Initiate a scan" is an explicit user action** on the Transactions destination; deferring the scan pipeline behind that action does not remove any capability.
- **Form-factor selection already exists** in the app (the app already renders different interfaces per canvas); this feature changes only whether the non-active side is downloaded, not how the choice is made.
- **Out of scope, deferred to a fast-follow feature**: (a) deferring the interface-translation (i18n) language catalogs, because the current translation lookup is synchronous and would need reworking into a preload flow, carrying design risk; and (b) wiring the currently-dormant server-side aggregate rollups, which is a correctness/consistency task rather than a bundle-size lever. Neither is part of this feature.
- **Dependency**: relies on the app's existing build tooling's ability to split code and load pieces on demand, and on the existing per-canvas interface selection.
