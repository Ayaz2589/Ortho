# Quickstart: Validating Person-Scoped Dashboard Widgets

How to prove this feature works, in the order that fails fastest.

**Prerequisites**: `cd web && npm install` (already installed in a working checkout). No database
change, no migration to apply, no environment variable to set.

---

## 1. The automated gate

```bash
cd web
npm test
npx tsc --noEmit
```

**Expected**: green, with no golden-vector drift.

**Read the failures structurally** — which suite breaks tells you which invariant broke:

| If this fails | The broken invariant is |
|---|---|
| Any pre-existing `test/widgets/*.test.tsx` **that this feature did not modify** | C-1/C-2: household scope is no longer the identity. This is the most important signal in the suite — those files were left untouched precisely so they would catch this. |
| `test/scope/*` | The pure projection was modified. It should not have been; this feature consumes it. |
| `test/i18n/catalog-reachability.test.ts` | A catalog key lost its last consumer. Check that `"Everyone"` still has its Planning and TxForm call sites. |
| `test/dashboard/member-scope.test.tsx` | Expected during the rename task, not after it. |
| Any golden-vector / parity suite | Something reached the pure engines. Nothing in this feature should. |

---

## 2. Manual validation

Requires a household with **two or more active people** and at least one **shared** transaction. The
picker is hidden for a one-person household by design (C-9), so a solo test account cannot exercise
this.

```bash
cd web && npm run dev
```

Open `/dashboard`. Enable the widgets you want to check in **Settings → Widgets** — `activity`,
`household-balances`, `housing-costs` and `home-equity` are default-off.

### 2a. The rename (US2)

- The scope control above the net hero reads **"Household"**, not "Everyone".
- Open it: the first option reads **"Household"**, followed by each member's name.
- Switch the app language in **Settings → Language** and reopen: "Household" is translated, with no
  English fallback.
- Go to **/planning**. Its scope bar still reads **"Everyone"** — the rename did not leak (C-8).
- Open the **New transaction** form. The "Who is this for?" control still reads **"Everyone"** (C-8).

### 2b. The board follows the picker (US1)

With **Household** selected, note the figures on: spending pace, top merchants, savings trends,
budgets, activity.

Now pick a person. Check each:

| Widget | What to look for |
|---|---|
| **spending pace** | Avg/day drops to roughly that person's share. The chart redraws. |
| **top merchants** | Merchants they never transacted at disappear. Remaining totals are their share. |
| **savings trends** | The headline rate changes **and**, in single-month view, the "Last month" line changes with it. Both figures must move together — a personal headline next to an unchanged household comparison is the exact bug this feature fixes. |
| **budgets** | Shows only that person's budgets. If they have none, the empty state — **not** the household's limits (FR-011). |
| **activity** | Only rows they are party to, at their share amount. |
| **net hero** | Continues to agree with the board, as it always did. |

Switch back to **Household**: every figure returns to what you noted.

### 2c. The axes compose (C-4)

With a person still selected, change the month or the range. The widgets show **that person's money
in that window** — both controls apply. Changing one must not reset the other.

### 2d. Balances (US3)

Needs three or more people with debts between more than one pair.

- Under **Household**: every non-zero pair is listed.
- Pick a person: only rows naming them survive, **at identical amounts** (C-6). If the amounts move,
  the widget is computing from projected rows — the defect research D5 describes.
- Pick someone square with everyone: "All settled up.", not a blank card.

### 2e. The exclusions (FR-014)

Switch between Household and each person while watching the **financial health** and **goals**
widgets. Neither changes. This is a real check, not a formality — they are the widgets most likely to
be scoped by accident.

### 2f. Calm empty states (C-5)

Pick a person with no activity in the selected window. Each widget shows its own worded empty state
("No expenses in this period yet.", "Not enough data yet."). No widget shows a flat zero chart, a 0%
rate, or a $0 row that reads as a measurement.

---

## 3. Edge cases worth reproducing

| Case | Expected |
|---|---|
| **Uneven split** — record an expense split 70/30 | Each person's widgets show their **stored** share (70 / 30), never an even 50/50 recomputation. |
| **Transfer between two members** | Counted at **full** amount for both the sender and the recipient; absent entirely for a third person. Never halved. |
| **Selected person removed** — with a person selected, remove them in Settings → Household | The board falls back to Household rather than emptying (C-10). |
| **Single-person household** | No picker at all; the board behaves exactly as before this feature (C-9). |

---

## 4. Cross-canvas

Check the dashboard at a phone width (≤ 639px) and at desktop. No layout change is expected — the
picker already existed and already responded — so anything that shifts is a regression, not a
feature.
