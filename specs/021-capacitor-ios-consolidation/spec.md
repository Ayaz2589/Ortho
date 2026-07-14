# Feature Specification: Capacitor iOS Consolidation

**Feature Branch**: `021-capacitor-ios-consolidation`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Retire the native SwiftUI iOS app in favor of shipping iOS from a Capacitor-wrapped build of the existing Next.js web app, so the household budgeting product only needs to be built once instead of twice. Freeze `iOS/Ortho-iOS/` in the repo (no deletion, no new feature work). Preserve on-device receipt/bank-statement scanning (camera + on-device OCR + PDF import) with equivalent accuracy and equivalent on-device-only privacy. The app must feel native, not like a wrapped website (safe areas, keyboard behavior, scroll behavior, status bar, splash screen), and add genuine native affordances (Face ID/Touch ID unlock, haptics, native share sheet, native file picker). Reuse the existing App Store identity. Push notifications, deep/universal links, and Android are explicitly out of scope. Retire the cross-language golden-vector parity enforcement since there is only one implementation going forward. Roll out TestFlight-first with an explicit native-feel bar before public submission, keeping the frozen native app as a rollback path. Deliver test-first (TDD)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use the whole app natively on iPhone (Priority: P1)

A household member installs the app from TestFlight/the App Store and uses it exactly as they would any native iPhone app: the Dashboard, Transactions, Housing, and Settings destinations all work, nothing is rendered by or dependent on a remote server process, the interface respects the phone's screen (notch, home indicator, keyboard), and once signed in they stay signed in across app restarts and backgrounding.

**Why this priority**: This is the foundation the whole migration depends on. Without a fully-functional, native-feeling shell, none of the other stories (scanning, biometrics, etc.) matter — and this is also the story most exposed to App Store review risk if done poorly.

**Independent Test**: Install a build on a physical iPhone with no other app changes; navigate to every destination and complete a representative task in each (view the dashboard, add a transaction, open a property, change a setting); force-quit and relaunch and confirm the user is still signed in; confirm no content is ever obscured by the status bar, notch, home indicator, or on-screen keyboard.

**Acceptance Scenarios**:

1. **Given** a signed-in user with the app installed, **When** they open the app after their phone has been restarted, **Then** they land on their data without being asked to sign in again.
2. **Given** the user is on any screen with the on-screen keyboard open, **When** they focus a text field, **Then** the field being edited is never hidden behind the keyboard.
3. **Given** the user is scrolling any list, **When** they reach the top or bottom, **Then** the screen does not rubber-band/bounce past the content edge the way a web page does.
4. **Given** the app has no network connectivity, **When** the user opens it, **Then** they see a native-styled offline state, not a blank or browser-style error page.

---

### User Story 2 - Scan a receipt or bank statement on-device (Priority: P2)

A user photographs a paper receipt, photographs a bank statement, or imports a bank-statement PDF from Files/iCloud Drive, and the app turns it into a structured, categorized transaction — with all recognition happening on the device itself.

**Why this priority**: This is the app's signature differentiating capability and the one piece of today's native app with no adequate browser equivalent; it must survive the migration essentially unchanged in capability and privacy posture.

**Independent Test**: Using the existing library of representative sample receipts and statements (photos and PDFs, including at least one hard-to-read case), run each through the scan flow and confirm each produces the same structured result (merchant, amount, date, category) it produces in the current native app today, and confirm no network request containing image or document content occurs during processing.

**Acceptance Scenarios**:

1. **Given** a user photographs a legible paper receipt, **When** capture completes, **Then** the app prefills a transaction with the correct merchant, amount, date, and a reasonable category without the user retyping anything.
2. **Given** a user imports a multi-page bank-statement PDF from the Files app, **When** processing completes, **Then** the user is shown a reviewable list of candidate transactions matching what today's native app would have produced from the same file.
3. **Given** a device where the optional on-device "smart cleanup" assist is unavailable, **When** the user scans a document, **Then** scanning still completes successfully using the standard result, with no error surfaced to the user.
4. **Given** a photographed document is unreadable (blurry, no visible total), **When** processing completes, **Then** the user is told the document couldn't be read and can retry or enter the transaction manually, matching today's behavior.

---

### User Story 3 - Native session security and conveniences (Priority: P3)

A user unlocks access to their signed-in session with Face ID or Touch ID, feels haptic feedback on key confirmations, shares an export through the standard iOS share sheet, and picks a statement PDF from the Files app rather than only from Photos.

**Why this priority**: These are the concrete, checkable native affordances that distinguish "a real app" from "a wrapped website" to both users and App Store reviewers — important for credibility and polish, but the app is still usable without them if sequencing forces a cut.

**Independent Test**: On a device with Face ID/Touch ID enrolled, back out of the app and return to confirm a biometric prompt gates access; trigger a share action and confirm the native share sheet appears; trigger a PDF import and confirm the Files app picker (not only Photos) is reachable; confirm a haptic pulse accompanies a key confirmation action.

**Acceptance Scenarios**:

1. **Given** a signed-in user with Face ID enrolled, **When** they return to the app after it has been backgrounded, **Then** they must succeed a Face ID (or device passcode fallback) check before their data is shown again.
2. **Given** a device with no biometric enrollment, **When** the user opens the app, **Then** they reach their data without being blocked by a biometric prompt they have no way to satisfy.
3. **Given** a user taps to export or share data, **When** the share action is triggered, **Then** the standard iOS share sheet appears with the expected destinations (Messages, Mail, Files, etc.).
4. **Given** a user wants to import a bank statement, **When** they choose to import a file, **Then** they can browse and select a PDF from the Files app / iCloud Drive, not only a photo from their camera roll.

---

### User Story 4 - Safe, reversible engineering transition (Priority: P4)

As the maintainer, once there is only one live client implementation, the automated checks and documentation stop pretending there are two implementations to keep honest against each other, without losing the ability to fall back to the previous native app if the new one has problems after release.

**Why this priority**: This doesn't deliver end-user value directly, but leaving the old enforcement running produces permanent, misleading failures on unrelated work, and skipping a rollback path turns any post-launch issue into a crisis instead of a manageable regression.

**Independent Test**: Confirm the previous native app's source is untouched and still compiles on demand; confirm the automated cross-language check no longer runs as a required step on ordinary changes; confirm the audited cross-surface documentation accurately describes the new single-implementation reality instead of a stale two-implementation one.

**Acceptance Scenarios**:

1. **Given** a routine, unrelated code change is made after this migration, **When** automated checks run, **Then** they do not fail or report drift because of the frozen native app no longer being kept in sync.
2. **Given** the maintainer wants to verify the frozen native app still builds, **When** they trigger that check manually, **Then** it still runs and reports a clear pass/fail.
3. **Given** the new app has a serious post-release problem, **When** the maintainer needs to fall back, **Then** the previous native app can still be rebuilt and resubmitted without needing code archaeology to make it compile again.

---

### Edge Cases

- What happens when a user upgrades from the previous native app's App Store listing straight into the new build — do their local-only preferences (e.g. appearance) carry over, reset to default, or is this out of scope since domain data already lives server-side?
- How does the system handle a user who denies the Face ID/biometric permission prompt, or later revokes it in device Settings?
- How does the system handle a scan of a document type it has never seen a clean example of (e.g. a heavily stylized or non-English receipt)?
- What happens if a user backgrounds the app mid-scan (e.g. a phone call interrupts capture)?
- What happens during Apple App Store review if the reviewer cannot get past sign-in (no access to a real inbox for the one-time code)?
- What happens if the device's on-device OCR/ML capability is present but the OS version is older than what the assist step requires — does the base (non-assisted) scan path still work at full quality?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to reach and use every feature currently available on the web app (Dashboard, Transactions, Housing, Settings, budgets, insights) from the iOS app, with no functional gaps.
- **FR-002**: The iOS app MUST operate fully without dependence on any server-rendered page or server-side access gate; equivalent checks (e.g., redirecting a signed-out user to sign in) MUST happen within the app itself.
- **FR-003**: A signed-in user's session MUST persist across app restarts and backgrounding at least as reliably as the current native app's session persistence, and MUST NOT be lost the way an ordinary browser tab's state can be.
- **FR-004**: The app MUST NOT render any content obscured by the device status bar, notch, Dynamic Island, or home indicator, on any screen.
- **FR-005**: When any text field is focused, the on-screen keyboard MUST NOT cover the field being edited.
- **FR-006**: Scrolling and touch interactions MUST NOT exhibit browser-style rubber-band/bounce overscroll, unintended text-selection callouts, or perceptible tap-response delay.
- **FR-007**: The status bar appearance and the app's launch screen MUST match the app's current light/dark theme.
- **FR-008**: Users MUST be able to capture a photo of a receipt or bank statement, or import a bank-statement PDF, and have it turned into a structured, categorized transaction candidate entirely through on-device processing, with no image or document content transmitted off-device for that processing.
- **FR-009**: The on-device scanning capability MUST produce results at least as accurate as today's native scanning feature, verified against the existing library of representative sample receipts and statements.
- **FR-010**: If the optional on-device "smart cleanup" assist step is unavailable on a given device, scanning MUST still complete successfully via the standard (non-assisted) path, exactly as it does today, with no user-visible error caused by the assist step's absence.
- **FR-011**: Where the device supports it, users MUST be able to gate access to their signed-in session behind Face ID or Touch ID; on devices without biometric enrollment, users MUST still reach their data without being blocked.
- **FR-012**: The app MUST provide haptic feedback on key confirmation/deletion interactions, consistent with standard iOS conventions.
- **FR-013**: Users MUST be able to share exportable data via the standard iOS share sheet.
- **FR-014**: Users MUST be able to select a bank-statement PDF from the Files app / iCloud Drive for import, not only from the photo library.
- **FR-015**: The iOS app MUST continue to be distributed under its existing App Store identity (the same app listing), not as a new, separate listing.
- **FR-016**: The native SwiftUI app's existing source code MUST remain in the repository, unmodified in behavior, and MUST NOT receive new product features going forward.
- **FR-017**: The automated build/test check for the native SwiftUI app MUST stop being a required, always-on check on ordinary code changes, becoming an on-demand/manual verification instead, so its inevitable drift cannot block unrelated work.
- **FR-018**: The cross-language enforcement that previously locked the web/TypeScript and native/Swift implementations against each other MUST be reframed as an ordinary single-implementation regression safety net; the audited cross-surface documentation MUST be updated to describe iOS as delivered from the same implementation as web, not as a second, independently-maintained one.
- **FR-019**: This feature MUST NOT introduce push-notification prompts, deep/universal link handling, or an Android build.
- **FR-020**: The new iOS app MUST be distributed through internal, then external, TestFlight testing before any public App Store submission.
- **FR-021**: Until the new iOS app has completed a defined trial period of stable production distribution, it MUST remain possible to rebuild and resubmit the previous native app as a fallback.

### Key Entities

- **Scan Capture**: A photograph or PDF page a user supplies, processed entirely on-device into recognized text and, from that, a structured transaction candidate (merchant, amount, date, suggested category) for the user to review — same information shape produced by today's native scanning feature.
- **Device Session**: The signed-in credential state kept on the device so a user remains signed in across app launches; distinguished from ordinary browser storage by needing to persist independent of the kind of clearing behavior a browser tab is subject to.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete every primary task available on the web app (viewing the dashboard, logging a transaction, managing a property, adjusting a setting) from the iOS app without encountering a missing or broken feature.
- **SC-002**: A user who force-quits and reopens the app remains signed in without re-entering credentials.
- **SC-003**: Scanning a receipt or bank statement produces a correctly structured transaction for at least the same proportion of the existing sample-document library that today's native app handles correctly.
- **SC-004**: A pre-release native-feel review (safe areas, keyboard behavior, scroll behavior, status bar/launch screen, tap responsiveness) finds zero violations before any public release build is submitted.
- **SC-005**: The app is accepted through Apple's App Store review process without a Guideline 4.2 ("Minimum Functionality") rejection.
- **SC-006**: After this migration, a new feature affecting both web and iOS is implemented once, in one codebase — not twice.
- **SC-007**: No instance of scanned receipt/statement image or document content being transmitted off-device during processing is found in testing or review.

## Assumptions

- The existing web app's functionality (Dashboard, Transactions, Housing, Settings, budgets, insights) is the complete feature baseline this migration must preserve; this migration does not itself introduce new product features beyond the native-feel and native-affordance requirements listed above.
- The existing App Store Connect listing and app identity are reused for continuity of reviews, ranking, and install base, rather than creating a new listing.
- Push notifications, deep/universal links, and Android distribution are explicitly out of scope for this feature and are not prerequisites for any of its success criteria.
- The optional on-device "smart cleanup" scanning assist remains on-device only; no cloud-based substitute is introduced. If a device or OS version can't run it, the feature is simply unavailable there, exactly as today.
- "TestFlight-first" rollout means this feature's engineering completion includes successful internal and external TestFlight distribution; the timing of final public App Store submission is a subsequent operational decision, not a blocker to considering this feature done.
- A defined trial/rollback period is expected to elapse (an operational decision made at release time, not fixed by this spec) before the previous native app's fallback capability is retired.
- "Household member" here refers to the same authenticated user population the web app already serves; no new user types or permission levels are introduced.
