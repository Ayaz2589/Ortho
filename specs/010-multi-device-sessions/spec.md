# Feature Specification: Multi-Device Sessions + 30-Day Session Cap

**Feature Branch**: `010-multi-device-sessions`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "Update the login logic so a person can be signed in on iOS and web at the same time (remove the single-active-platform lock). Separately, no signed-in session may last longer than 30 days — after 30 days the person is automatically signed out and returned to the sign-in screen. Update PARITY.md to track this."

## Overview

Two changes to Ortho's authentication model, kept in lockstep across the iOS (canonical) and web
clients:

1. **Remove the single-active-platform lock.** Today, signing in on one client signs the other out (via
   the `platform_locks` table). This is removed so a person can be signed in on **iOS and web at the same
   time**.
2. **Cap session lifetime at 30 days.** No signed-in session may outlive 30 days from sign-in; after that
   the person is automatically signed out and returned to the sign-in screen on whichever client they next
   open.

This is a behavior change to existing auth, not a new surface. The 8-digit email-OTP sign-in flow is
unchanged. The `platform_locks` table is retained (no schema migration) but no longer used.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stay signed in on iOS and web at once (Priority: P1)

A person signs in on their iPhone and also signs in on the web app. Both stay signed in. Using or signing
out of one does not sign them out of the other.

**Why this priority**: This is the headline behavior change and the reason for the feature. Until the
single-active-platform lock is removed, a returning person is repeatedly bounced off whichever client they
aren't "active" on, which the household experiences as being randomly logged out.

**Independent Test**: Sign in on iOS, then sign in on web with the same account — neither sign-in evicts
the other; both reach their data. Sign out on web — iOS remains signed in. Verifiable without Story 2.

**Acceptance Scenarios**:

1. **Given** a person signed in on iOS, **When** they also sign in on web with the same account, **Then**
   both clients remain signed in and reach the person's data; neither is redirected to sign-in because of
   the other.
2. **Given** a person signed in on both clients, **When** they sign out on one client, **Then** the other
   client remains signed in (the sessions are independent).
3. **Given** a person using web, **When** they navigate around the app, **Then** they are never signed out
   or shown an "active on iOS" message on account of another device being signed in.

---

### User Story 2 - A session cannot outlive 30 days (Priority: P2)

A person who signed in more than 30 days ago opens the app (iOS or web). They are signed out and taken to
the sign-in screen; signing in again starts a fresh 30-day window.

**Why this priority**: A bounded session lifetime is the security backstop that makes always-on,
multi-device sign-in acceptable — a forgotten or lost device cannot stay authenticated forever.

**Independent Test**: With a session older than 30 days, launch each client — it lands on the sign-in
screen rather than the person's data. With a fresh session, the client stays signed in. Verifiable
independent of Story 1.

**Acceptance Scenarios**:

1. **Given** a stored session whose sign-in was more than 30 days ago, **When** the person next opens iOS
   or web (launch / navigation / token refresh), **Then** they are signed out and shown the sign-in
   screen.
2. **Given** a session less than 30 days old, **When** the person opens either client, **Then** they
   remain signed in and reach their data.
3. **Given** a session that expired at the 30-day mark, **When** the person signs in again, **Then** a new
   session begins and the 30-day window restarts.

---

### Edge Cases

- **Both clients signed in, one signs out** → the other is unaffected (independent sessions; no shared
  lock to release).
- **Session crosses the 30-day mark while the app is open** → the expiry takes effect on the next
  launch / navigation / token refresh, at which point the person is signed out cleanly (no mid-screen
  forced logout, but no indefinite continuation either).
- **Cold launch with a valid (<30-day) session** → straight to the person's data (no regression of the
  existing restore behavior).
- **Cold launch with a session that cannot be restored or refreshed** → sign-in screen cleanly (existing
  behavior), now also the path the 30-day expiry uses.

## Requirements *(mandatory)*

### Functional Requirements

**Multi-device sign-in (Story 1)**

- **FR-001**: The product MUST allow the same person to be signed in on iOS and web simultaneously; signing
  in on one client MUST NOT sign the person out of the other.
- **FR-002**: Neither client may read, claim, release, or yield to a single-active-platform lock; the
  "one active platform" guarantee is removed in full from both clients (no half-present behavior).
- **FR-003**: Signing out on one client MUST NOT affect the signed-in state of the other client.
- **FR-004**: No client may surface an "active on another device" message or redirect; that state no
  longer exists.

**30-day session cap (Story 2)**

- **FR-005**: A signed-in session MUST NOT remain valid for more than 30 days from sign-in; past 30 days
  the session MUST be treated as expired.
- **FR-006**: When a session has passed the 30-day cap, the next launch / navigation / token refresh on
  either client MUST sign the person out and present the sign-in screen.
- **FR-007**: Signing in again after expiry MUST start a new session with a fresh 30-day window.

**Cross-cutting**

- **FR-008**: The 8-digit email-OTP sign-in flow, and the existing valid-session restore (cold launch to
  data) behavior, MUST be unchanged except where this feature explicitly alters them.
- **FR-009**: The cross-surface parity documentation (`PARITY.md`) MUST be updated to reflect the new auth
  model: the single-active-platform lock is removed (both platforms may be signed in at once), and a
  30-day maximum session applies (both clients sign out → sign-in on expiry).

### Key Entities *(include if data involved)*

- **Session**: a person's authenticated context on one client. Independent per client (no cross-client
  lock). Has a maximum lifetime of 30 days from sign-in, after which it is invalid and the client returns
  to sign-in.
- **Single-active-platform lock** (retired): the record of which one client was "active." No longer
  consulted or written by either client; the backing table is retained but unused.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can be signed in on iOS and web concurrently with zero forced sign-outs between the
  two over normal use.
- **SC-002**: Signing out of one client leaves the other signed in in 100% of cases.
- **SC-003**: A session older than 30 days results in a sign-in screen on the next open of either client in
  100% of cases; a session younger than 30 days never expires for that reason.
- **SC-004**: Both clients' automated suites remain green, and a person performing the same auth task on
  iOS and web observes the same outcome (concurrent sign-in allowed; same 30-day cap).
- **SC-005**: `PARITY.md` accurately documents the removed lock and the 30-day cap.

## Assumptions

- **iOS is canonical; web mirrors it.**
- The **enforcement point for the 30-day cap is a server-side session timebox** (the auth provider's
  "time-box user sessions" setting = 30 days), which must be enabled on the production project as part of
  deploying this feature. Client code alone cannot guarantee the cap; the clients' existing
  failed-refresh → signed-out handling (from feature 008) is what surfaces the expiry to the person.
- This is an **absolute** 30-day cap measured from sign-in, **not** a rolling inactivity/idle timeout.
- **No database schema migration**: the `platform_locks` table is kept (unused) rather than dropped, so the
  change is reversible with zero schema risk.
- The change reconciles existing auth behavior; it does not alter the OTP code length/flow, the four
  destinations, or any non-auth behavior.
