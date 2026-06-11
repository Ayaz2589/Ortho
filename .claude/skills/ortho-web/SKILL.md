---
name: ortho-web
description: Use this skill to design and build the Ortho WEB app (desktop + responsive) so it stays true to the calm, money-first iOS design system. Covers what carries over from iOS, what must change for the desktop form factor, the responsive grid, sidebar navigation, master–detail layouts, modal/drawer patterns, hover/focus states, and a handoff checklist. Read alongside `colors_and_type.css` (the single source of truth for tokens) and the root `README.md`/`SKILL.md`.
user-invocable: true
---

# Ortho Web — Design & UX Guide

Ortho is a calm, shared budgeting app. The iOS app is the canonical expression:
warm off-white surfaces, graphite type, hairline rules, **one sage accent**
(`--positive`, incoming money) and **one sand accent** (`--accent`, focus/links).
Money is the headline; everything else recedes. No gradients, no patterns, no
emoji in chrome, no saturated status colors.

**The web app is the same product on a bigger canvas — not a denser one.**
The single biggest failure mode for a budgeting app on desktop is turning into
a Bloomberg terminal: tiny type, grid lines everywhere, six charts above the
fold. Resist it. Desktop gives Ortho **room to breathe**, not room to cram.

Always start from `colors_and_type.css`. Every token (color, type, spacing,
radius, motion) already exists there and is shared with the iOS build. Do not
introduce a new color or font-size without checking it first.

---

## 1. What carries over unchanged

These are non-negotiable and identical to iOS:

- **Tokens.** All of `colors_and_type.css` — surfaces, text shades, the two
  accents, owner identity colors, category tints, the type scale, spacing,
  radii. Light + dark via `prefers-color-scheme` or `data-theme`.
- **Voice & content rules.** Plainspoken second-person. "Activity" not
  "Transactions feed." First-name / "Joint" owners. Money reads as money
  (`$87.42`), income gets `+`, Unicode minus (`−`) for shown negatives,
  tabular figures always, no `$3.4K` abbreviation.
- **The calm.** Hairlines over borders. Inset cards float on the bg with **no
  shadow** — shadow is reserved for genuinely floating chrome (modals,
  drawers, menus). Solid backgrounds only.
- **Iconography.** The pastel "sticker" nav icons and the 1.2-stroke category
  glyphs. Don't swap in a generic web icon font.
- **Meaning through position + weight, not color.** Loss/cost is never red.

---

## 2. What changes for the web form factor

| Concern | iOS | Web |
|---|---|---|
| **Frame** | Rendered inside a device bezel (`IOSDevice`) | No bezel. Content lives in the real viewport. Delete all phone-frame chrome. |
| **Primary nav** | Bottom tab bar | **Left sidebar rail** (see §4). Bottom bars are a mobile affordance; on desktop they waste the most valuable edge. |
| **Status bar** | 54px reserve for clock/island | None. Remove the reserve spacers. |
| **Sheets** | Bottom sheet slides up (`AddTransaction`, `AddProperty`, `AddUser`) | **Centered modal** (forms) or **right-side drawer** (contextual detail). See §6. |
| **Navigation model** | One screen at a time, push/pop | **Master–detail**: list + detail side-by-side on wide screens (see §5). |
| **Input** | Press-first, no hover | Hover states are real and expected (see §7). Pointer + keyboard. |
| **Title bar "+"** | Chip button on the title row | Same chip in the screen header; on desktop a labeled `+ Add transaction` button is also acceptable in the content header. |
| **Scroll** | Whole screen scrolls under sticky day headers | Sidebar is fixed; only the content column scrolls. Day headers still sticky within it. |

---

## 3. Responsive breakpoints & the content column

Mobile-first. Three meaningful widths:

```
--bp-compact:  0–639px     single column, sidebar collapses to bottom bar
--bp-medium:   640–1023px  sidebar as icon rail (collapsed), single content col
--bp-expanded: 1024px+     full sidebar (icon + label) + content, master–detail
```

**The cardinal rule: content does not stretch to fill ultrawide screens.**
Money lists become unreadable when a row spans too wide — the eye can't connect
merchant on the left to amount on the right.

- **Reading column** (a single list/form, e.g. Settings, a focused form):
  `max-width: 560px`, centered in the content area.
- **List + detail** (Transactions, Housing): list pane `380–440px` fixed-ish,
  detail pane flexes but caps at `max-width: 720px`. The pair centers in the
  content area with generous gutters.
- **Dashboard grid**: cards in a responsive grid, `minmax(300px, 1fr)`,
  `gap: 16px`, the whole grid capped at `max-width: 1080px`.

Gutters: `24px` content padding at compact, `40px`+ at expanded. Let whitespace
do the work — empty space on a 27" monitor is correct, not a bug to fill.

---

## 4. Sidebar navigation (replaces the tab bar)

The four destinations are unchanged: **Dashboard · Transactions · Housing ·
Settings**. Reuse the pastel sticker icons (`NavIconColor`).

**Expanded (≥1024px) — full rail, ~240px wide:**
- Pinned left, full height, `background: var(--bg)` with a `0.5px solid
  var(--hairline)` rule on its right edge (no shadow — it's not floating).
- Top: the Ortho wordmark logo, padded `24px`.
- Nav items: icon + label in a row, `12px` gap, `10–12px` vertical padding,
  `--radius-card` hit area. Active item: label in `--text`, icon full-color,
  a quiet `var(--surface)` or `rgba(text,0.05)` pill behind it. Inactive:
  label `--text-3`, icon at 42% (the `tone="muted"` treatment), hover lifts to
  `rgba(text,0.04)`.
- Bottom of rail: the current household (owner avatars) + a settings/sign-out
  affordance. This is where the "who's logged in" context lives on web.

**Medium (640–1023px) — icon rail, ~72px wide:** icons only, labels become
tooltips on hover. Active dot/pill stays.

**Compact (<640px) — fall back to the bottom tab bar** (`BottomNavTabBarColor`).
The mobile web view you already built is correct here.

Never put primary nav in a top horizontal bar — it competes with screen titles
and doesn't scale to more destinations.

---

## 5. Master–detail per screen

On expanded screens, prefer showing a selected item's detail inline
together rather than navigating away.

- **Transactions.** Left: the day-grouped activity list (your existing
  `ActivityScreen`, narrowed to the list pane). Right: the selected
  transaction's detail (merchant, category, owner, source, full date, notes,
  edit). Default state with nothing selected: show the detail pane empty with a
  quiet prompt ("Select a transaction"), or show the month summary there.
  Search stays at the top of the list pane.
- **Housing.** Left: a list of properties (primary home, multifamily,
  rentals) when the user has more than one; right: the full Housing detail
  (the mortgage or rental screen you designed). With a single property, skip
  the list and show the detail full-width within the reading column.
- **Settings.** Reading column is enough — no detail pane needed. Sub-screens
  (e.g. a user's detail) open as a modal or a right drawer.

Keep the hairline-and-inset-card vocabulary inside each pane. The divider
between panes is a single `0.5px var(--hairline)` rule, not a heavy gutter.

---

## 6. Modals & drawers (the web form of sheets)

The iOS sheets (`AddTransaction`, `AddProperty`, `AddUser`) become:

- **Centered modal** for create/edit forms. `max-width: 480px`,
  `--radius-card` (14px) corners, `var(--surface)` fill, `--shadow-sheet` for
  elevation, on a scrim of `rgba(0,0,0,0.18)` (light) / `0.45` (dark). Keep the
  exact same form layout: `Cancel · Title · Add` header row, inset
  `FormGroup`/`FormRow` cards inside, footnote at the bottom. The multi-step
  Add Property flow (picker → form) works identically inside the modal.
- **Right-side drawer** for contextual detail that doesn't warrant leaving the
  page (e.g. a transaction's full detail if you choose not to use a detail
  pane). Slides in from the right, `~440px`, full height, `--shadow-sheet`.
- **Esc closes, scrim-click closes, focus is trapped** while open, and focus
  returns to the trigger on close. The "Add" button stays disabled until valid,
  exactly as on iOS.

Forms inside modals/drawers should switch from the mobile **centered** field
text to **left-aligned** label-on-left / control-on-right rows (the
`PropertyFormRow` pattern) — desktop forms read left-to-right, not centered.

---

## 7. Interaction states (new responsibility on web)

The product is press-first on mobile; web needs the full set:

- **Hover** — `background: rgba(text, 0.04)` on rows, nav items, and tappable
  cards. Buttons darken their fill slightly.
- **Active/press** — `rgba(text, 0.08)`.
- **Focus-visible** — a `1.5px var(--accent)` ring (the sand focus treatment
  already used by the search field and inputs). Every interactive element must
  have a visible keyboard focus state. Do not remove outlines without
  replacing them.
- **Transitions** — `--duration-mid` (150ms) `--ease-out` for hover/focus.
  No bouncy springs, no skeleton shimmer. Motion stays minimal.
- **Cursor** — `pointer` on everything clickable.

---

## 8. Typography & density on desktop

Use the same scale; don't shrink it. The instinct on desktop is to go smaller — do
the opposite where it's a hero.

- Screen titles (`.ortho-title`, 32px) can grow to **36–40px** on expanded
  layouts where the title is a genuine page header.
- Row/body/meta sizes stay as the tokens define. **Minimum body text 14px**;
  never go below for the sake of fitting more rows.
- Keep `font-variant-numeric: tabular-nums` on all amounts/dates.
- Density toggle (Comfortable/Compact) carries over and only changes spacing +
  size, never color/weight/casing — same contract as iOS `Density`.

---

## 9. Empty, loading & error states

- **Empty** — a short plainspoken line in `--text-2` and a single primary
  action. No illustration-slop. ("No transactions yet. Add your first one.")
- **Loading** — a quiet `--text-3` line or a minimal inline spinner. **No
  skeleton shimmer** (it's decorative motion; the system avoids it).
- **Error** — plainspoken, never alarmist, never red panels. State what
  happened and the recovery action.

---

## 10. Accessibility floor

- **Contrast:** graphite-on-warm already passes AA; keep `--text-2/3` for
  secondary only, never for primary reading text on small sizes.
- All controls keyboard-reachable in DOM order; visible focus ring (§7).
- Hit targets ≥ 40px even with a mouse; ≥ 44px on touch/compact.
- Respect `prefers-reduced-motion` — drop the 150ms transitions to instant.
- Semantic HTML: `<nav>`, `<main>`, `<button>` (not clickable `<div>`s),
  labelled inputs, `aria-current` on the active nav item.

---

## 11. Do / Don't

**Do**
- Cap content width; center it; let the margins be empty.
- Convert the tab bar to a left sidebar; keep the four destinations.
- Use master–detail to avoid full-page navigations on wide screens.
- Add real hover + focus-visible states from the existing accent tokens.
- Keep hairlines, inset cards, and the two-accent rule.

**Don't**
- Stretch a transaction row to the full width of a wide monitor.
- Add a top nav bar, breadcrumbs slop, or a dense multi-chart dashboard.
- Introduce borders heavier than `0.5px`, drop shadows on inset cards, or
  gradients/patterns/illustrations.
- Shrink type to fit more data. Cram is the enemy.
- Invent new colors for "desktop polish." The palette is closed.

---

## 12. Handoff checklist (for Claude Code building the desktop view)

Build against these, then bring the result back here for fine-tuning:

- [ ] Imports `colors_and_type.css`; uses tokens only, no hardcoded colors.
- [ ] No device bezel; no 54px status-bar reserves.
- [ ] Left sidebar at ≥1024 (icon+label), icon rail at 640–1023, bottom tab
      bar < 640. Four destinations, pastel sticker icons, `aria-current` active.
- [ ] Content column capped (`≤560` reading, `≤1080` dashboard grid, list+detail
      panes as in §5). Generous gutters; empty margins are fine.
- [ ] Transactions & Housing use master–detail on expanded; single-column on
      compact. Sticky day headers scroll within the content pane only.
- [ ] Add/edit forms are centered modals (left-aligned field rows); the
      multi-step Add Property flow stays intact; Esc/scrim close, focus trap + return.
- [ ] Hover (`rgba(text,.04)`), active (`.08`), focus-visible sand ring on every
      interactive element. 150ms ease-out, reduced-motion respected.
- [ ] Type scale unchanged (titles may grow to 36–40 on hero headers); tabular
      figures; body ≥ 14px.
- [ ] Light + dark both correct via `data-theme`.
- [ ] Empty/loading/error states are plainspoken, no shimmer, no red.

When the desktop view lands here, fine-tune in this order: (1) spacing &
content-width rhythm, (2) sidebar active/hover states, (3) master–detail
balance, (4) modal/drawer chrome, (5) dark-mode pass.
