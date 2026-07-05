# Feature Specification: Subscription System — Free Month, Paid Plans, Admin Bypass

**Feature Branch**: `018-subscription-system`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "Subscription system with free trial, paid plans, and admin bypass. Every new user can use the full app free for 1 month from signup. After the trial ends they must subscribe — a monthly plan or a yearly plan (prices operator-configurable, not hardcoded) — to keep using the app; lapsed users see a calm blocking paywall and can subscribe, manage billing, or sign out. Admin-type users bypass the subscription requirement entirely and never see the paywall; regular users (including household owners and members) all require an active trial or subscription. Web billing runs on Stripe Checkout + Stripe Customer Portal; iOS subscribes via link-out to the same Stripe web checkout (US storefront rules) — no StoreKit purchase flow in v1, but the design keeps a provider-adapter seam so StoreKit 2 can be added later as a second provider feeding the same entitlement source of truth. Entitlements live in one Postgres table in Supabase written ONLY by the service role via Supabase Edge Functions (Stripe webhook receiver + checkout/portal session creators) — this is Ortho's first server-side code. The trial is administered app-level: an entitlement row is created at first bootstrap with trial expiry ≈ signup + 31 days; no Stripe customer exists until a user actually subscribes. The billing logic must be an isolated, extraction-ready package (services/billing/: pure runtime-agnostic TypeScript core, zero Ortho/Supabase imports, own tests, provider adapters) because the owner plans to reuse this payments service across future applications. Both clients gate on a single entitlement fact (admin | trialing | active | past_due/paused | lapsed) using their existing blocking-gate patterns; Settings on both surfaces gains a subscription row (status + manage/subscribe). Lifecycle correctness: never revoke on first payment failure (dunning states are explicit), never assume a cancellation event fires, webhook idempotency required. Constraints: no changes to existing table schemas, no new golden vectors, no money/date engine changes; paywall UI follows the constitution (calm, tokens-only, plainspoken '1 month free' copy, loss never red); i18n on both surfaces (web catalogs ×5 + iOS xcstrings). Sandbox cannot reach Stripe or hosted Supabase: migration deploy, edge-function deploy, Stripe product/price/webhook setup, and live end-to-end verification are operator-pending scripts + runbook, mirroring spec 017's approach."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A free month starts automatically (Priority: P1)

A person signs up (or an existing user signs in after this feature ships) and simply uses Ortho. Nothing about signup changes: no payment details are requested, no plan is chosen, no interstitial appears. Behind the scenes their free month begins the first time they use the app, and every part of Ortho works exactly as it does today for the entire month.

**Why this priority**: This is the foundation every other story gates on — the entitlement record must exist and be readable before any paywall, plan, or bypass logic can behave correctly. It also embodies the product promise ("1 month free, no card") and must not add signup friction.

**Independent Test**: Can be fully tested by signing in as a brand-new user and verifying (a) no payment/plan step appears anywhere, (b) all four tabs work normally, and (c) the user's subscription status reads as a free month with a known end date.

**Acceptance Scenarios**:

1. **Given** a brand-new user completing first sign-in, **When** the app finishes loading, **Then** a free-month entitlement exists for that user with an expiry about one month out, and the full app is usable with no payment prompt.
2. **Given** an existing user (created before this feature) signing in after rollout, **When** the app finishes loading, **Then** they receive the same free month starting from that first post-rollout sign-in — their history and data are untouched.
3. **Given** a user mid-trial who deletes and reinstalls the app (or clears their browser), **When** they sign back in, **Then** the trial continues from its original start date — it does not reset.
4. **Given** a user mid-trial, **When** they open Settings, **Then** they can see that they are on the free month and when it ends.

---

### User Story 2 - Trial ends → calm paywall → subscribe → back in (Priority: P1)

When the free month ends and the person hasn't subscribed, the next time the app loads they see one calm, plainspoken screen: their data is safe, the free month has ended, and they can continue with a monthly or yearly plan. They pick a plan, pay on a hosted checkout page, and are back in the app — same data, same households, nothing lost.

**Why this priority**: This is the monetization moment — the entire reason the feature exists. Without it there is no revenue path.

**Independent Test**: Simulate an expired entitlement and verify the app is fully blocked behind the paywall; simulate a completed purchase and verify access is restored without re-signing in.

**Acceptance Scenarios**:

1. **Given** a user whose free month has expired without a subscription, **When** they open the app, **Then** a blocking paywall appears before any app content, offering a monthly plan, a yearly plan, a way to re-check status, and a quiet sign-out.
2. **Given** the paywall is shown, **When** the user chooses a plan, **Then** they are taken to a hosted checkout that displays the operator-configured price, and after paying they regain full access without reinstalling or signing in again.
3. **Given** a user completed payment moments ago, **When** the entitlement update is still in flight, **Then** the paywall offers a "check again" affordance that picks up the new status within a few minutes at most.
4. **Given** an expired user, **When** they try to reach any app content by navigation tricks (deep link, URL, tab switch), **Then** the paywall still blocks everything — there is no route around it.
5. **Given** the paywall is shown, **When** the user signs out, **Then** they return to the sign-in screen; signing into a different, entitled account works normally.

---

### User Story 3 - Subscribers manage their own billing (Priority: P2)

An active subscriber can see their plan in Settings and manage it themselves — update their card, switch between monthly and yearly, or cancel — through a self-serve billing portal. Cancelling keeps access until the end of the period already paid for; after that, the paywall returns.

**Why this priority**: Self-serve management is what keeps a one-person operation viable (no support inbox for card updates), but it only matters once subscriptions exist.

**Independent Test**: With an active subscription simulated, verify Settings shows plan status and a manage entry that opens the billing portal; simulate a cancellation and verify access persists until the paid-through date and lapses after.

**Acceptance Scenarios**:

1. **Given** an active subscriber, **When** they open Settings, **Then** they see their subscription status (plan and renewal) and can open a self-serve billing portal.
2. **Given** a subscriber cancels in the portal, **When** their paid period ends, **Then** access lapses to the paywall; until then the app works fully and Settings reflects the scheduled end.
3. **Given** a subscriber switches plan (monthly ↔ yearly) in the portal, **When** the change takes effect, **Then** access continues uninterrupted and Settings reflects the new plan.

---

### User Story 4 - Admins never see a paywall (Priority: P2)

A user designated as an admin (the operator, testers, household of the developer) uses Ortho indefinitely without any subscription. They never see the paywall, never get trial-ending nudges, and Settings shows that no subscription is needed for this account.

**Why this priority**: The operator must be able to use and test the product forever without paying themselves; granting this to a partner/tester account is the same mechanism.

**Independent Test**: Designate a test user as admin, expire any trial dates, and verify the app never blocks and Settings shows the admin state.

**Acceptance Scenarios**:

1. **Given** an admin user with no subscription and an expired trial window, **When** they open the app, **Then** it loads fully with no paywall and no subscription prompts.
2. **Given** an admin user, **When** they open Settings, **Then** the subscription row states that this account doesn't need a subscription (calmly, without jargon).
3. **Given** a regular user, **When** they attempt to obtain admin status through the app, **Then** there is no in-app path to do so — designation is an operator-only action.

---

### User Story 5 - A failed renewal never cuts access abruptly (Priority: P2)

A subscriber's card fails at renewal. Nothing dramatic happens: they keep using the app while the payment provider retries, and Settings quietly notes there's a billing problem they can fix in the portal. Only if the situation is truly unresolved after the provider gives up does access lapse to the paywall — and even then, subscribing again restores everything.

**Why this priority**: Getting this wrong (instant lockout on a flaky card) is the classic subscription-app failure mode and directly contradicts the product's calm ethos; but it can only occur after renewals exist.

**Independent Test**: Simulate payment-failure and retry events and verify access is retained through the dunning window; simulate final failure and verify lapse; verify the Settings hint appears during dunning.

**Acceptance Scenarios**:

1. **Given** an active subscriber whose renewal payment fails once, **When** they use the app during the provider's retry window, **Then** access is unaffected and no paywall appears.
2. **Given** a subscriber in the retry window, **When** they open Settings, **Then** a calm, non-alarmist notice explains there's a billing issue and links to the portal to fix it (never red, never blocking).
3. **Given** the provider exhausts retries without payment and the paid-through leeway passes, **When** the user next opens the app, **Then** the paywall appears; **When** they update payment and resubscribe, **Then** access is restored.
4. **Given** any single failure or retry event arrives more than once or out of order, **When** events are processed, **Then** the resulting entitlement state is the same as if each event arrived exactly once, in order.

---

### User Story 6 - iOS subscribes through the same checkout, one source of truth (Priority: P2)

An iPhone user whose free month ended taps Subscribe on the iOS paywall and is taken (in the browser) to the same hosted checkout the web uses. After paying, they return to the app, tap "check again," and they're in. A user who subscribed on the web opens the iOS app and is already entitled — and vice versa. One subscription covers the person everywhere.

**Why this priority**: iOS is the canonical surface, so the paywall and subscribe path must exist there — but it deliberately reuses the web checkout, so it depends on Stories 1–2 being done.

**Independent Test**: With an expired entitlement on an iOS build, verify the paywall blocks, Subscribe opens the external checkout page, and a simulated entitlement flip plus "check again" unblocks the app.

**Acceptance Scenarios**:

1. **Given** an expired user on iOS, **When** the app loads, **Then** a blocking, non-dismissable paywall appears with the same plan choices, a "check again" affordance, and a quiet sign-out.
2. **Given** the iOS paywall, **When** the user picks a plan, **Then** checkout opens externally (in the browser), and the app never collects payment details itself.
3. **Given** a user entitled via a purchase made on either surface, **When** they open the other surface, **Then** it reflects the same entitlement after its normal load/refresh — there is no per-device subscription.
4. **Given** an iOS user who is an active subscriber, **When** they open Settings, **Then** they see the same status the web shows, and managing billing opens the external portal.

---

### User Story 7 - Status at a glance in Settings, in every language (Priority: P3)

Every user can always answer "what's my subscription situation?" from Settings on either surface: free month with days remaining, active plan with renewal date, billing problem, ended, or admin. All new copy reads calmly in all six supported languages.

**Why this priority**: Transparency reduces surprise at trial end and support burden, but it decorates the states created by earlier stories.

**Independent Test**: Drive each entitlement state in turn and verify the Settings row renders the correct, localized copy on both surfaces.

**Acceptance Scenarios**:

1. **Given** each possible entitlement state (free month, active monthly, active yearly, billing issue, ended, admin), **When** Settings renders, **Then** the subscription row shows state-appropriate, plainspoken copy and the appropriate action (subscribe or manage).
2. **Given** any supported language is selected, **When** paywall or Settings subscription copy renders, **Then** it is fully localized (no English fallbacks in the five non-English catalogs).

---

### Edge Cases

- **Purchase completes but confirmation is slow** (provider event latency): the user has paid but the app doesn't know yet. The paywall's "check again" and the return-from-checkout path must both re-read status; the system must never require reinstall/re-auth to pick up entitlement.
- **A cancellation/termination event never arrives** (missed webhook, provider config): access must still lapse correctly because entitlement is governed by a paid-through/expiry timestamp plus leeway — never solely by receiving a terminal event.
- **Duplicate or out-of-order provider events**: processing must be idempotent; replaying the full event stream must converge to the same entitlement state.
- **Entitlement can't be loaded at startup** (network failure, backend outage): this is a load failure, not a lapse — show the existing calm recovery path (retry), never the paywall. The paywall only ever appears on a *successfully loaded* unentitled state.
- **Clock skew / user changes device clock**: entitlement decisions compare against server-recorded timestamps; a device clock change must not unlock (or falsely lock) the app beyond the stated leeway.
- **Refund or chargeback**: treated as a provider-driven lapse; access ends and the paywall returns (with resubscribe available).
- **Same user in multiple households** (or joining another household later): entitlement is per-person, not per-household — membership changes never alter subscription status.
- **User signs out from paywall and a different, entitled user signs in on the same device**: the second user gets their own state; no leakage of the first user's paywall or entitlement.
- **Payment requiring extra authentication** (bank challenge mid-renewal): behaves as a billing issue in dunning — access retained during the window, Settings hints at the portal.
- **Operator misconfiguration (missing prices/products)**: the paywall must fail calmly (plans unavailable, try again later) rather than crash or show broken price text.

## Requirements *(mandatory)*

### Functional Requirements

**Trial**

- **FR-001**: The system MUST grant every user a free-usage window of 31 days, starting at their first app use after this feature ships (for new users, effectively at signup). No payment information is collected to start it.
- **FR-002**: The free window MUST be recorded server-side per user, exactly once; reinstalls, new devices, or re-sign-ins MUST NOT reset or re-grant it.
- **FR-003**: During the free window the entire product MUST behave identically to today — no feature is degraded or withheld.
- **FR-004**: Signup/sign-in flow MUST be unchanged in steps and screens; the free window begins silently.

**Gating**

- **FR-005**: Each client MUST derive a single entitlement fact for the signed-in user — one of: admin, in free month, active subscription, billing-issue grace, or ended — and MUST gate the app shell on it.
- **FR-006**: Users whose state is "ended" MUST be blocked from all app content by a full-screen paywall on both surfaces; no navigation path (tabs, deep links, URLs) may bypass it.
- **FR-007**: The paywall MUST offer exactly: a monthly plan, a yearly plan, a way to re-check entitlement ("check again"), and a quiet sign-out. Nothing else competes for attention.
- **FR-008**: A failure to *load* entitlement state MUST route to the existing load-failure/recovery experience, never to the paywall.
- **FR-009**: Entitlement gating MUST happen after successful data bootstrap on the client, and the paywall MUST NOT flash for entitled users during normal loading.

**Subscribing & managing**

- **FR-010**: Choosing a plan MUST hand the user to a hosted, operator-configured checkout; the apps themselves MUST never collect or handle payment details.
- **FR-011**: Plan prices MUST come from operator configuration in the billing provider; no price literal may exist in app code or copy. The paywall MUST render whatever the operator has configured (including after a price change) without an app release.
- **FR-012**: After a successful purchase, the user MUST regain access without reinstalling or re-authenticating: automatically on next load/refresh, and on demand via "check again", within minutes of payment at worst.
- **FR-013**: Active subscribers MUST be able to open a self-serve billing portal from Settings to update payment method, switch monthly ↔ yearly, or cancel.
- **FR-014**: Cancellation MUST preserve access through the already-paid period and lapse it afterward.
- **FR-015**: iOS MUST offer subscription via link-out to the same hosted web checkout (opened externally); the iOS app contains no in-app purchase flow in this release.

**Entitlement integrity**

- **FR-016**: Entitlement state MUST be stored in exactly one server-side record per user, which is the single source of truth for every surface.
- **FR-017**: End users and client apps MUST NOT be able to create, modify, or delete entitlement state; clients may only read their own user's record. All writes occur in trusted server-side code driven by verified billing-provider events or operator action.
- **FR-018**: Processing of billing-provider events MUST be idempotent (dedup by event identity) and MUST verify event authenticity before acting.
- **FR-019**: Entitlement MUST be governed by a paid-through/expiry timestamp with a small leeway (1–2 days), so that a missed terminal event still lapses access correctly and a slightly-late renewal doesn't cut access.
- **FR-020**: A first failed renewal payment MUST NOT revoke access. The system MUST represent the provider's retry/dunning window as a distinct grace state, retain access during it, and lapse only when the provider outcome (or expiry + leeway) says so.
- **FR-021**: The system MUST keep an auditable record of received billing events and the entitlement transitions they caused.

**Admin**

- **FR-022**: A per-user admin designation MUST exist, distinct from household roles (owner/member). Admin users bypass all subscription requirements: no paywall, no trial expiry, no nudges, on both surfaces.
- **FR-023**: Admin designation MUST be an operator-only action performed outside the apps; there is no in-app path to grant or request it.
- **FR-024**: Admin bypass MUST be enforced by the same server-side entitlement source of truth (not client-only logic).

**Settings & communication**

- **FR-025**: Settings on both surfaces MUST show a subscription row with state-appropriate copy for every state (free month + end date, active plan + renewal, billing issue + portal link, ended + subscribe, admin) and the matching action.
- **FR-026**: During the billing-issue grace state, the app MUST show a calm, non-blocking notice (Settings-level, never a takeover, never red) pointing to the portal.
- **FR-027**: All new user-facing copy MUST be localized on both surfaces (all five non-English web catalogs and the iOS string catalog), following existing i18n mechanics.
- **FR-028**: Paywall and subscription UI MUST meet the constitution: tokens-only styling, calm layout, plainspoken second-person copy ("Your free month has ended"), accessible semantics, hit targets, and focus behavior consistent with existing gates.

**Operations**

- **FR-029**: All steps that require reaching live external systems (schema deploy, server function deploy, provider product/price/webhook configuration, admin grants, end-to-end purchase verification) MUST ship as operator-executable scripts plus a runbook, clearly marked pending until an operator runs them — the feature must be merge-safe with these pending.
- **FR-030**: The feature MUST introduce no changes to existing table schemas, no new golden test vectors, and no changes to the shared money/date engines; existing test suites must remain green.

### Key Entities

- **Entitlement**: One per user; the single fact every surface trusts. Holds the user's current standing (admin / free month / active / grace / ended), the timestamp access is paid or granted through, which plan (if any) is active, and how the standing was established (trial, billing provider, operator).
- **Billing customer link**: The association between an Ortho user and their identity at the billing provider, created the first time they start a checkout — non-existent for users who never subscribe.
- **Billing event record**: An append-only log entry for each provider event received (identity, type, when, resulting transition), used for idempotency and audit.
- **Plan**: The monthly and yearly offerings, defined and priced entirely in operator configuration at the billing provider; the app knows plans only by reference.
- **Admin designation**: A per-user, operator-granted marker (independent of household owner/member roles) that exempts the user from subscription requirements.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: New-user signup requires exactly as many steps as before this feature (zero added screens, zero payment fields), and 100% of product features work during the free month.
- **SC-002**: A user whose free month expired without subscribing can reach 0 app screens beyond the paywall until they subscribe.
- **SC-003**: After a successful payment, users regain full access within 5 minutes without reinstalling or re-signing in (typically on the next "check again" tap).
- **SC-004**: Admin-designated accounts encounter the paywall 0 times, regardless of trial dates or subscription absence.
- **SC-005**: A single first payment failure causes 0 interruptions to app access during the provider's retry window.
- **SC-006**: A subscription purchased on one surface is reflected on the other surface after one normal load/refresh, with no per-device steps.
- **SC-007**: Replaying any billing event stream with duplicates and reordering yields the same final entitlement state as the clean stream (verified in tests).
- **SC-008**: The operator can change a plan's price in provider configuration and see the paywall reflect it with no app release.
- **SC-009**: All pre-existing automated tests still pass (web suite ≥ 731 green), and the new billing logic ships with its own test suite covering every state transition.
- **SC-010**: Every new user-facing string renders localized in all six languages (System + 5) with zero English leakage in non-English catalogs.

## Assumptions

- **Per-person, not per-household**: Each user needs their own trial/subscription; a household with two partners means two subscriptions. Household-level or partner-covering plans are explicitly out of scope for v1 (noted as future work).
- **Existing users get a fresh month**: Users who predate this feature receive their 31-day free window starting at their first sign-in after rollout — simple, generous, and avoids retroactive lockouts.
- **"1 month" = 31 days** from first use, giving every user at least a full calendar month regardless of month length.
- **Full block on lapse**: An ended, unsubscribed user is fully blocked (no read-only mode) — matching the existing all-or-nothing gate patterns; their data is never deleted or modified by lapsing.
- **US storefront link-out is acceptable for iOS v1**: Current US App Store rules permit linking out to web checkout for digital subscriptions with no in-app purchase alongside; this is under active litigation, so the design keeps a clean seam to add native in-app purchasing later without changing the entitlement source of truth. (Owner accepts this risk for v1.)
- **Prices are operator business decisions**: "$X/month or $X/year" are configured at the billing provider by the operator; this spec deliberately contains no price values.
- **Admin grants are rare, operator-performed actions** (developer, partner, testers) — a documented runbook step, not a product surface.
- **Trust boundary note**: Data-table access rules are unchanged in v1; enforcement of the paywall is via the entitlement source of truth plus client shell gating (same trust model as existing features). Hardening data reads against a hostile custom API client with valid credentials but no subscription is documented as a known limitation and future-work candidate.
- **Owner-mandated architecture constraints (binding on the plan)**: billing runs on Stripe Checkout + Customer Portal; entitlements live in one Postgres table written only by service-role server code (Supabase Edge Functions: webhook receiver + checkout/portal session creators — Ortho's first server-side code); the trial is app-administered (no Stripe object until first checkout); billing logic is an isolated, extraction-ready package (`services/billing/`: pure runtime-agnostic TypeScript core, zero Ortho/Supabase imports, own tests, provider adapters) because the owner intends to reuse it across future applications; a provider-adapter seam is preserved for adding StoreKit 2 later.
- **Sandbox/live-system reality**: the development environment cannot reach Stripe or the hosted database; everything requiring live systems ships as `[OPERATOR-PENDING]` scripts + runbook (the spec-017 pattern), and the branch merges safely with those pending.
