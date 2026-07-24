# Dashboard Widget Research & Redesign Plan

**Date:** 2026-07-24  
**Scope:** Budget dashboard UX, competitor analysis, widget design principles, and a concrete
implementation roadmap for Ortho's desktop Overview screen.

This document combines:
- A verified deep-research pass (105 agents, 23 sources, 25 claims verified, 5 confirmed) against
  Copilot Money, Rocket Money, and Monarch Money primary documentation and reviews
- A first-principles audit of the current `DashboardDesktop.tsx` layout and every widget component
- Ortho's existing competitive analysis (`docs/research/competetive-analysis/`)
- Ortho's design constitution (tokens-only palette, "loss is never red," calm aesthetic)

Read alongside `docs/web.md` §5 (dashboard page) and `docs/research/competetive-analysis/`.

---

## 1. What the competition does — verified findings

The deep-research pass verified 5 high/medium-confidence claims from primary sources; 20 were
killed as unsourced or overstated.

### 1.1 The signature hero widget: "Safe / Free to Spend"

**Confidence: High** — sourced from Copilot Money's own help documentation and Rocket Money reviews.

Both Copilot and Rocket Money anchor their dashboard on a single derived number:

> **"Free to Spend"** (Copilot) / **"Safe to Spend"** (Rocket Money) = Monthly budget − bills
> scheduled before next paycheck − spend to date.

This is NOT the raw account balance. It is a forward-looking number that accounts for upcoming
obligations, giving the user the answer to their most important question: *Can I spend money today?*

The widget pair that renders it:
1. A **large typographic hero value** at the biggest type size on the page
2. A **dual-line spending-pace chart** directly below: dotted line = ideal linear burn rate for the
   month, solid line = actual cumulative spend to date. When actual crosses ideal, the chart signals
   over-pace without using red.

**Ortho gap:** Ortho's hero card shows net income (income − expenses). This is backward-looking and
answers "how did I do?" rather than "what can I spend?". The `DailySpendTrendCard` shows a partial
version (daily avg + 30-day sparkline), but it is small and placed at the bottom of the grid.

### 1.2 Color-coded budget category progress bars

**Confidence: High** — sourced directly from Copilot's Categories tab documentation.

Color semantics, confirmed:
- **Sage green** → on pace (under ~85% of limit)
- **Amber/sand** → approaching limit (~85–100%)
- **Terracotta** → over budget (>100%)

Each bar shows the **dollar remaining**, not a percentage. Users respond better to concrete money
figures.

**Ortho status:** `BudgetProgressCard` already implements this correctly — sage `--positive` below
85%, sand `--accent` above. This is validated by the research. The issue is not the bars themselves
but the card's layout (see §3).

### 1.3 Empty state design

**Confidence: Medium** — sourced from Eleken, corroborated by LogRocket, UserGuiding, Mobbin.

The validated pattern:
- **Specific, contextual copy** — "You haven't added any budgets yet" not "No data"
- **Single CTA** — "Set up your first budget →"
- **Never render a blank outline** — if the widget has no data, show the empty state message
  *inside the widget's intended bounding box*, maintaining the card's height, or collapse it
  entirely. A card-shaped hole in the grid is worse than either option.

**Ortho status:** Current empty states use correct short-copy patterns (`t('No expenses in this
period yet.')`) but some conditional widgets self-hide entirely (InsightsCardStack,
BudgetProgressCard), leaving invisible layout gaps in the grid that cause the row below to float up
unexpectedly.

### 1.4 Typography as the primary organizational tool

**Confidence: High** — sourced from Number Analytics, corroborated by NN/G and Material Design.

Visual hierarchy in a premium financial dashboard:
- **Primary KPI value:** 28–40px, light-to-medium weight (Ortho uses 36px / font-weight 300 — ✓)
- **Secondary stats (income/expense columns):** 17–22px, regular weight — ✓
- **Section labels / captions:** 11–13px, 55–65% opacity of body color — ✓
- **Card boundaries:** use 16–24px whitespace as the separator, not decorative borders

Ortho's typography scale already follows this pattern. The gap is not the type — it is the layout
grid behavior around conditionally-rendered cards.

### 1.5 The validated extended widget set

**Confidence: Medium** — sourced from Copilot dashboard docs + comparative reviews; some items
(goal rings, subscription tracker) cited across reviews but not directly confirmed from primary docs.

Leading apps include, beyond basics:
1. Spending-pace chart with "safe to spend" headline
2. Color-coded category progress bars
3. **Upcoming bills / recurring transactions** list (scrollable, sorted by next-due date)
4. Net worth trend sparkline
5. Savings rate / "Net this month" (income vs spend vs prior month comparison)
6. Goal progress rings or compact bars
7. Subscription tracker (distinct from general recurring bills)

---

## 2. Current dashboard audit

### 2.1 Grid layout

`DashboardDesktop.tsx` uses a 12-column grid (`ow-grid`, 16px gap):

```
Row 1:  [Net Summary ── s7 ──────────][Housing ─── s5 ──]
Row 2:  [InsightsCardStack ──────── s12 ────────────────]  (conditional: hidden when 0 insights)
Row 3:  [BudgetProgressCard ────── s12 ────────────────]  (conditional: hidden when no budgets)
Row 4:  [SpendByCategoryCard ─ s6 ─][PerOwnerBreakdown ─ s6 ─]
Row 5:  [TopMerchantsCard ─── s6 ──][DailySpendTrend ── s6 ──]
```

**Confirmed layout problems:**

1. **Invisible gap when rows 2–3 are hidden.** When a new user has no insights and no budgets,
   rows 2 and 3 collapse to zero height. The grid jumps from the hero cards directly to the
   category/owner row, leaving the first visible card area floating with no visual anchor.

2. **BudgetProgressCard is s12 but its content is narrow.** Progress bars are line-height items.
   At 1080px wide, a s12 card shows bars spanning ~900px. The bars fill the left ~60%; the right
   ~40% is dead whitespace. This is the most visible "awkward gap" in the current design.

3. **InsightsCardStack at s12 renders a vertical list of individual cards.** Each insight card
   is full-width at s12 (1080px). This is appropriate for high-density copy but at 2 insights
   it leaves a lot of unused horizontal space. At 6 insights it produces a long scroll section.

4. **Goals are invisible on the dashboard.** Goals only surface as off-track insights. A user
   with 2 on-track goals sees no goal data at all. `GoalCard` exists and is fully designed —
   it is simply not wired to the dashboard.

5. **DailySpendTrendCard sparkline is 64–80px tall.** This is compressed for a s6 card on a
   1080px-wide desktop layout. The sparkline provides little information at that height.

6. **No spending pace / month projection widget.** The most validated pattern in the research
   (Copilot's #1 widget) is absent. Ortho has all the data to compute it locally.

7. **No subscription summary widget.** The subscription detection engine already runs inside
   `insights.ts` (Rule 5, trailing 6-month recurring detection). The result only surfaces as
   one insight card among many. It deserves a dedicated card slot.

### 2.2 Widget-by-widget assessment

| Widget | Grid | Status | Issue |
|---|---|---|---|
| Net Summary | s7 | ✓ Good | Hero position correct; missing "to spend" projection |
| Housing | s5 | ✓ Good | Empty state text-only, no CTA |
| InsightsCardStack | s12 | ⚠ Layout | Full-width cards waste horizontal space |
| BudgetProgressCard | s12 | ⚠ Layout | s12 creates wide dead whitespace on the right |
| SpendByCategoryCard | s6 | ✓ Good | Donut + expandable list is validated pattern |
| PerOwnerBreakdownCard | s6 | ✓ Good | Per-member bars + drill-down is correct |
| TopMerchantsCard | s6 | ✓ Good | Could add avg per visit sub-label |
| DailySpendTrendCard | s6 | ⚠ Content | Sparkline too short; needs projection line |
| Goals | — | ✗ Missing | Not on dashboard at all |
| Spending pace | — | ✗ Missing | Most validated pattern from research |
| Subscriptions widget | — | ✗ Missing | Detection exists, widget absent |

---

## 3. Design principles for Ortho's widgets

These are grounded in both the verified research and Ortho's constitution.

### 3.1 No hollow cards

**Rule:** Every card must always fill its allocated grid space with either content or a purposeful
empty state. Never collapse a card to zero height inside the grid — this leaves ghost gaps.

**Two valid empty-state strategies:**
1. **Maintain height, show inline message + CTA.** The card occupies its normal grid slot, renders
   its label, and shows a short contextual message with a navigation link.
2. **Remove card and redistribute space.** If a card is not applicable (e.g., Housing with no
   properties), reallocate its columns to an adjacent card or replace with a different widget.

**Never:** conditionally render `null` from a card that holds a grid slot without handing the
columns to something else.

### 3.2 Cards must answer one question

Each widget answers exactly one user question:
- Net Summary: "How did I do this month?"
- SpendingPace (new): "What can I still spend?"
- BudgetProgressCard: "Which categories are at risk?"
- Goals (new): "Am I on track for my goals?"
- Subscriptions (new): "What am I paying repeatedly?"
- SpendByCategory: "Where is my money going?"
- PerOwner: "Who is spending what?"
- Housing: "What does my housing cost / earn?"
- TopMerchants: "Where do I spend most often?"
- DailyTrend: "Is my daily spend accelerating?"

### 3.3 Typography hierarchy (enforce existing scale)

Ortho's current type scale is already correct. Apply consistently:

| Use | Size | Weight | Color |
|---|---|---|---|
| Hero KPI (net, safe-to-spend) | 36–40px | 300 | `--text` or `--positive` |
| Secondary stats (income, expense) | 17–22px | 400 | `--text` / `--positive` |
| Category amounts, merchant names | 14–15px | 400 | `--text` |
| Card section labels | 13px, uppercase, 0.6px tracking | 400 | `--text-2` |
| Captions, date ranges, visit counts | 11–12px | 400 | `--text-3` |

### 3.4 Color semantics (enforce consistently)

Ortho's palette maps correctly to the research-validated semantics:

| State | Ortho token | Usage |
|---|---|---|
| Positive / on-pace | `--positive` (sage rgb 94,126,91) | Net income, on-pace budgets, goals reached |
| Neutral / information | `--text` | Expenses, amounts, default |
| Caution / approaching | `--accent` (sand rgb 140,122,92) | Budget bars ≥85%, off-pace goals |
| Missing (never red) | `--text-2` | Deficit, over-budget bars — never `--destructive` |

**Rule:** Loss and over-budget spend are never red. Position and sign communicate direction; color
communicates pace/health only. This is Ortho's clearest design differentiation from Copilot/Monarch.

### 3.5 Prevent horizontal dead space

**Rule:** Cards at s12 (full width) must fill their width with meaningful content. Options:
- Use a chart or visualization that uses the full width (dual-line spending-pace chart)
- Switch from s12 to paired s6+s6 so each half has its own content
- Use a two-column internal layout (e.g., BudgetProgressCard in a 2-column grid internally)

### 3.6 Sparkline minimum height

Any sparkline or trend chart on desktop must be at least **80px tall** (currently 64px in the
DashboardDesktop inline version). The `DailySpendTrendCard` component uses 80px (h-20 = 80px) —
the inlined DashboardDesktop version should match.

---

## 4. Recommended layout redesign

### 4.1 Proposed grid

```
Row 1:  [SpendingPaceCard ─────────── s8 ────────────][Goals ──── s4 ────]
Row 2:  [Net Summary ─── s5 ──][Housing ──── s4 ──][Subscriptions ─ s3 ─]
Row 3:  [InsightsCardStack (2-col internal) ──── s12 ─────────────────────]  (conditional, always keeps its slot)
Row 4:  [BudgetProgressCard ─────── s6 ──────────][SpendByCategoryCard ─ s6 ─]
Row 5:  [PerOwnerBreakdownCard ───── s6 ──────────][TopMerchantsCard ── s6 ──]
Row 6:  [DailySpendTrendCard ─────── s12 (or s6 paired) ───────────────────]
```

**Key changes from current:**

1. **SpendingPaceCard (s8) → new hero.** Replaces the current dominant hero role. Shows "Safe to
   spend this month: $X" as the headline, with a dual-line chart below (ideal rate vs actual).
   This is the #1 pattern from the research.

2. **Goals (s4) → new hero pair.** The Goals widget sits beside the spending pace card. When empty
   ("No goals yet"), it shows an illustrated empty state with "Set your first goal →", not blank
   space.

3. **Net Summary demoted to s5 / second row.** Still important but no longer the primary hero —
   it answers the retrospective question ("how did I do?") while SpendingPace answers the
   forward-looking question ("what can I spend?").

4. **Subscriptions (s3) joins second row.** Small card, summary number only ("11 recurring charges,
   ~$219/mo"), taps to InsightsCardStack which already has the detail.

5. **InsightsCardStack at s12, 2-column internal grid.** Instead of stacking cards vertically,
   insights render in 2 columns on desktop (each insight card spans half the width). 1 insight:
   full-width. 2–6 insights: 2-column grid. This uses the horizontal space.

6. **BudgetProgressCard at s6.** Paired with SpendByCategoryCard. The bars now use ~450px instead
   of 900px — much tighter fit, no dead whitespace.

7. **DailySpendTrendCard at s12 or s6.** If paired, put it beside PerOwner. If standalone (no good
   pair), use s12 and make the sparkline fill the full width with a proper reference line.

### 4.2 Alternative: minimal-change approach

If a full layout rework is not the immediate goal, these targeted fixes address the most visible
issues with minimal code change:

| Fix | Change | File |
|---|---|---|
| BudgetProgressCard → s6 | Change `ow-s12` → `ow-s6`, pair with a GoalsCard (s6) | `DashboardDesktop.tsx` |
| InsightsCardStack → 2-col | Add `display: grid; grid-template-columns: 1fr 1fr; gap: 12px` inside the stack | `InsightsCardStack.tsx` |
| Empty state for conditional cards | When insights/budgets = 0, show a minimal placeholder card instead of null | `DashboardDesktop.tsx` |
| Sparkline height | Change `height={64}` → `height={80}` in DashboardDesktop's inline Sparkline | `DashboardDesktop.tsx` |

---

## 5. New widget specifications

### 5.1 SpendingPaceCard

**Purpose:** "What can I still spend this month?"

**Data needed (all local, already in store):**
- `budgets.reduce(sum of monthly_limit_cents)` = total budget
- Expenses this month = already computed
- Days elapsed / days in month = from `scope.now`

**Headline metric:**
```
safe_to_spend = total_monthly_budget - expenses_this_month
```

If no budgets are set, fall back to a pace-based projection:
```
projected_month_total = (expenses_this_month / day_of_month) * days_in_month
```

**Chart:** Dual SVG lines over the month days:
- Dotted line: linear ideal rate (total_budget / days_in_month × day)
- Solid line: cumulative actual spend per day

**Color rule:** When actual > ideal, the solid line ticks to `--accent`. Never to `--destructive`.

**Empty state (no budgets):** Show the projected pace chart only (no "safe to spend" headline);
caption: "Set budgets to see how much you have left to spend →".

**Grid:** s8 (desktop hero); s12 (mobile, stacked).

### 5.2 GoalsProgressCard

**Purpose:** "Am I on track for my goals?"

**Data needed:** `goals`, `goalContributions` — already in store. Uses existing `goalProgress()` and
`goalPacing()` from `lib/finance/goals.ts`.

**Layout:** Compact multi-goal list. Each row: goal name (truncated), progress bar (sage fill), 
"$X to go" or "On pace" in `--text-2`. Max 3 goals visible; "+N more →" link to `/goals`.

**Empty state (no goals):** Full card height, centered: icon (PiggyBank), "Set your first savings 
goal", button → `/goals/new`. Do NOT collapse or render null.

**Grid:** s4 (paired with SpendingPaceCard) or s6 (standalone).

**Implementation note:** Reuse `GoalCard`'s `goalProgress()` and `goalPacing()` calls. The compact
row is a new layout — not the full `GoalCard` component (which has contribution button, pace text,
etc.).

### 5.3 SubscriptionsSummaryCard

**Purpose:** "What are my recurring charges?"

**Data needed:** The recurring detection logic already runs in `lib/finance/insights.ts` (Rule 5).
Extract it into a shared helper or call it from a new component.

**Layout:** Single headline number: "~$219/mo across 11 charges". Below: top 3 merchant names
(already in insight's `preview_merchants`). Tap → expands or links to the insight.

**Empty state:** "No recurring charges detected yet" — no collapse.

**Grid:** s3 (small info card in row 2).

**Implementation note:** This card can read from the same insight generation logic without
duplicating the detection. Either:
1. Read from `insights` array, find the `subs` insight, and extract its data
2. Extract the recurring detection into `lib/finance/subscriptions.ts` and call from both

Option 1 is zero-duplication but couples card visibility to insight generation. Option 2 is cleaner.
Prefer option 2 when implementing.

### 5.4 InsightsCardStack (2-column desktop mode)

**Purpose:** Use horizontal space; don't stack 6 cards vertically at 1080px wide.

**Change:** In `InsightsCardStack.tsx`, detect desktop width (or receive a `cols` prop) and
switch the flex container to a CSS grid with 2 columns:

```tsx
// current
<div className="flex flex-col gap-3">

// proposed for desktop
<div className={cols === 2
  ? "grid grid-cols-2 gap-3"
  : "flex flex-col gap-3"
}>
```

Pass `cols={2}` from `DashboardDesktop.tsx`.

**Odd-insight rule:** When `insights.length` is odd, the last card spans both columns
(`className="col-span-2"`). Never leave a half-row gap.

### 5.5 Empty state placeholder when conditional cards absent

When both InsightsCardStack and BudgetProgressCard are absent (new user, no data), the grid
currently has a visual gap. Add a "Getting started" onboarding strip at s12 that renders only
when both would be absent:

```tsx
const showOnboarding = insights.length === 0 && !budgets.some(b => b.monthly_limit_cents > 0)

{showOnboarding && (
  <div className="ow-card ow-s12" style={{ padding: 20 }}>
    <p className="text-sm text-text-2">
      Add your first budget to start tracking spend → 
      <Link href="/budgets">Set up budgets</Link>
    </p>
  </div>
)}
```

This is the "contextual CTA" empty state pattern validated by the research.

---

## 6. Empty state rules — card by card

| Widget | Empty condition | Treatment |
|---|---|---|
| SpendingPaceCard | No budgets | Show pace projection only; "Set budgets →" CTA caption |
| GoalsProgressCard | No goals | Full card height, centered icon + "Set your first goal →" button |
| SubscriptionsSummaryCard | No recurring detected | "No recurring charges detected" — keep card in grid |
| InsightsCardStack | 0 insights | Collapsed BUT replaced by onboarding strip (see §5.5) |
| BudgetProgressCard | No budgets with limit | Collapsed BUT paired GoalsCard absorbs its space |
| SpendByCategoryCard | No expenses in range | Render empty state text in card at h-40 min height |
| PerOwnerBreakdownCard | No members | Render "No household members yet" at normal card height |
| TopMerchantsCard | No expenses | Render empty state text at normal card height |
| DailySpendTrendCard | No expenses last 30d | Render "No expenses in the last 30 days" at normal height |
| HousingSnapshotCard | No properties | Keep card at s5; "Add a property →" link |

---

## 7. Implementation roadmap

### Phase 1 — No-regression layout fixes (low risk, high impact)

These change no data logic, only layout and empty states.

- [ ] **T001** `InsightsCardStack`: accept `cols?: 1 | 2` prop; render 2-col CSS grid on desktop;
  handle odd-insight `col-span-2` last card.
- [ ] **T002** `DashboardDesktop`: move `BudgetProgressCard` from `ow-s12` to `ow-s6`; pair with a
  new `GoalsProgressCard` at `ow-s6` (stub with "No goals yet" empty state is fine for T002).
- [ ] **T003** `DashboardDesktop`: add onboarding strip when both insights and budgets are absent.
- [ ] **T004** `DashboardDesktop`: fix inline Sparkline height from `height={64}` to `height={80}`.
- [ ] **T005** All empty-state cards: ensure minimum height is preserved (add `minHeight` or
  `paddingBottom` so cards don't collapse to near-zero when content is absent).

### Phase 2 — New widgets (medium complexity, no new data fetching)

All data is already in the store; these are pure compute + render additions.

- [ ] **T006** Implement `GoalsProgressCard` component: compact goal list, progress bars, empty
  state CTA, `+N more` overflow link.
- [ ] **T007** Implement `SpendingPaceCard` component: safe-to-spend headline, dual-line SVG chart
  (ideal rate vs actual cumulative), empty state for no-budgets.
- [ ] **T008** Extract subscription detection from `insights.ts` into
  `lib/finance/subscriptions.ts`; implement `SubscriptionsSummaryCard` component.
- [ ] **T009** Wire T006, T007, T008 into `DashboardDesktop.tsx` with the proposed grid layout.

### Phase 3 — Polish and mobile parity

- [ ] **T010** Mobile: add `GoalsProgressCard` and `SubscriptionsSummaryCard` to the mobile single-
  column stack (below `BudgetProgressCard`, above `SpendByCategoryCard`).
- [ ] **T011** `SpendingPaceCard` mobile: full-width, s12; chart height 80px; headline large.
- [ ] **T012** Regression vector check: run `npm run gen:vectors` to confirm no behavior drift in
  insights, budget, goal math after extracting subscription logic.
- [ ] **T013** Full green: `npm test`, `npx tsc --noEmit`, visual review with seed data.

---

## 8. What to NOT do

Based on the research's adversarial verification, these patterns were killed (20 of 25 claims
refuted) and should be avoided:

- **Do not add F-pattern / Z-pattern "rules"** for card placement — these apply to text-heavy
  pages, not structured visual dashboards.
- **Do not prescribe exact pixel widths** (200–280px cards, 28–32px hero font) — these were
  refuted as blog opinions, not validated standards. Use Ortho's existing type scale.
- **Do not use circular progress dials** (animated budget dials) — claimed for Copilot, refuted by
  actual Copilot docs which use linear bars.
- **Do not add a timestamp watermark** ("Data as of 10:00 AM") — refuted as a blog opinion
  inapplicable to real-time local-compute dashboards.
- **Do not add a "net worth" widget yet** — requires bank balance sync, which Ortho does not yet
  have (spec 028 SimpleFIN sync adds transaction history, not balance snapshots).
- **Do not use red** for over-budget or deficit states — Ortho's constitution is clear; the
  research validates that warm palette apps use amber/terracotta instead.

---

## 9. Open questions for future investigation

From the deep-research open-questions output:

1. **How do Monarch Money and YNAB specifically handle empty dashboard states for new users?**
   Illustrated onboarding placeholders, progressive disclosure, or pre-seeded sample data? This
   matters for T003's onboarding strip design.

2. **What is the minimum data threshold before a sparkline should render vs. show an empty state?**
   1 data point? 7 days? Leading apps' specific thresholds were not confirmed.

3. **Master-detail interaction patterns on desktop:** When a user clicks a budget category or goal
   on the dashboard, what transition is preferred — slide-in drawer, inline expansion, or page
   navigation? Ortho currently uses inline expansion (chevron) for SpendByCategoryCard; this
   may not be the best desktop pattern for the new SpendingPaceCard.

4. **Scrollable card vs. pagination within a widget:** If a user has 12 budget categories, should
   BudgetProgressCard show all 12 in a scrollable list, or paginate at 6? No validated answer found.

---

## 10. Sources

| Source | Type | Used for |
|---|---|---|
| [Copilot Money Help — Dashboard Tab](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview) | Primary product docs | Hero widget pattern, widget list |
| [Copilot Money Help — Categories Tab](https://help.copilot.money/en/articles/9504513-categories-tab-overview) | Primary product docs | Budget bar color semantics |
| [Wall Street Survivor — Rocket vs Monarch](https://www.wallstreetsurvivor.com/rocket-money-vs-monarch/) | Review | Safe to Spend pattern |
| [Eleken — Empty State UX](https://www.eleken.co/blog-posts/empty-state-ux) | Design blog | Empty state copy rules |
| [Number Analytics — Typography in Dashboards](https://www.numberanalytics.com/blog/typography-in-dashboard-design) | Design blog | Type hierarchy |
| `docs/research/competetive-analysis/monarch-money-competitive-analysis.md` | Ortho internal | Monarch feature gap analysis |
| `docs/research/finance-habits-budgeting-apps.md` | Ortho internal | Real household spending patterns |
