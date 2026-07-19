# Phase 0 Research: Multi-currency accounting strategy

All figures below are **computed against the real functions** in
`web/lib/finance/money.ts` (not hand-derived) — see the "Verification" block at the end.

## 1. How money flows today (the current model)

**Storage unit.** Every amount is an integer count of **USD cents** — `amount_cents`
(`bigint`) in Supabase, `number` (branded `Cents`) in TS. This is the codebase's central
invariant (`docs/finance.md` §2, `docs/index.md` §5, `web/lib/finance/cents.ts`).

**Two conversion points, two different rates:**

1. **At entry (write):** the user types a native amount in their display currency; the form
   converts it to USD cents with `toUSDCents(displayAmount, currency, rate)` where `rate` is
   the **entry-time** rate (`rate(currency)` from the store). The native figure is then
   **discarded** — only the USD-cent result is stored.
   - Call sites: `web/components/web/TxForm.tsx:395` (scan candidate), and via
     `parseMoney(raw, currency, rate)` in `web/components/inputs.tsx:60` for the manual amount
     field, `web/components/budgets/BudgetDrawer.tsx:42`, and
     `web/components/housing/AddRentalPaymentModal.tsx:51`.
2. **At display (read):** the stored USD cents are converted back with
   `toDisplayAmount(cents, currency, rate)` / `formatMoney(...)` where `rate` is the
   **current** rate (`rate(currency)` = live rate from floatrates.com, cached in
   `localStorage`, falling back to `FALLBACK_RATE_FROM_USD`). See `web/lib/store.tsx:742-746`.

**Rate source.** `web/lib/store.tsx:715` fetches `https://www.floatrates.com/daily/usd.json`,
caches it (`fxRates` / `fxRatesFetchedAt` in `localStorage`), and `rate(c)` returns the live
value or the hardcoded fallback. **The feed already exists and works — it is not the problem.**

### The defect: the two rates are not the same rate

Entry divides by the entry-time rate; display multiplies by the *current* rate. When the rate
moves between entry and view, the reconstructed native amount is **different from what the user
typed**. Because nothing stores the native amount, there is no way to render the original figure.

## 2. The core problem, demonstrated (verified numbers)

**Rate-movement drift (the headline bug).** A Canadian household records **CA$100.00** of
groceries in March at 1 USD = 1.35 CAD:

| Step | Operation | Result |
|---|---|---|
| Entry (March) | `toUSDCents(100, 'cad', 1.35)` | **7407** USD cents |
| View (July, rate → 1.40) | `toDisplayAmount(7407, 'cad', 1.40)` | **CA$103.70** |

March's CA$100.00 grocery run now reads **CA$103.70** in July. The user changed nothing; the
number moved **+CA$3.70** because the FX rate moved. This is "why did my March groceries change?"

**Totals amplify it.** Three March expenses the user entered as CA$100.00 + CA$250.00 +
CA$37.55 = **CA$387.55** are stored as 7407 + 18519 + 2781 = 28707 USD cents. Re-displayed at
1.40 that category total reads **CA$401.90** — a **+CA$14.35** swing on a total the user never
touched.

**Rounding-through-USD loss (a second, rate-independent defect).** Even with **no rate
movement**, routing a native amount through USD cents and back is lossy:

- CA$100.00 stored at 1.35 and viewed **at the same 1.35** reads **CA$99.99** — a silent 1¢ loss.
- ¥1000 stored at 150 and viewed at the same 150 reads **¥1001** — a whole-yen error, because
  USD cents cannot represent yen precisely (JPY has 0 fraction digits; the USD-cent snapshot has
  ~1.5 significant figures of yen resolution per cent at rate 150).

So today's model has **two** correctness problems for non-USD households: it drifts with the
rate (fixable only by storing the native amount), and it loses precision on every round trip
(also fixable only by storing the native amount). Both are properties of *storing USD cents*,
not of the feed.

## 3. USD is exactly correct — which is why option (a) is real

At `rate = 1.0` the entry and display conversions are inverses with no rounding gap:
`toUSDCents(100, 'usd', 1.0) = 10000`, `toDisplayAmount(10000, 'usd', 1.0) = 100.00`. **Drift is
zero for USD households.** The current model is not broken for a US/USD launch audience — it is
broken only for the international audience the decision is about. This is the whole basis for
option (a): *if launch is USD-only, there is nothing to fix now.*

## 4. The two honest options

### Option (a) — Scope launch to US / USD, defer multi-currency

- **What:** ship USD-only; keep the display-currency picker off or clearly labelled as
  approximate/experimental; do not market to non-USD households. Revisit when/if an
  international audience is in scope.
- **Cost:** ~zero engineering now. The correctness problem does not exist for the launch audience.
- **Risk:** the 7-currency picker already exists in the UI, so "defer" must include *actually
  constraining or labelling it* — otherwise a non-USD user selects CAD today and silently gets
  the drifting model. Deferring is only honest if the in-between is closed (see §6).

### Option (b) — Native-currency ledger (stable historical figures)

- **What:** store the **native amount + its currency** as entered (e.g. `amount_minor` in the
  transaction's own currency + a `currency` column), so display is a *format*, not a
  reconversion. Historical figures are then stable in the user's own currency by construction,
  and cross-currency aggregation becomes an explicit, presentation-time choice (with a visible
  "converted at today's rate" treatment) rather than a silent rewrite of stored history.
- **Cost:** large — see §5.

## 5. Concrete cost surface of option (b)

| Area | What changes |
|---|---|
| **Schema** | New per-amount currency + native-minor-unit columns on every money-bearing table (`transactions`/`transaction_shares`, `budgets`, `rental_payments`, `mortgage_info`, `lease_info`, `entitlements` is USD-only so likely exempt). Minor units differ per currency (JPY = 0 dp), so the `bigint cents` assumption is replaced by "minor units in *this* currency." |
| **Migration** | Backfill: existing rows are USD cents with **no recoverable native amount** — the native figure was discarded at entry. Migration can only set `currency = 'usd'` for historical rows (honest) or attempt a lossy back-conversion (not honest). This is a one-way information loss already baked into stored data. |
| **Every write path** | `TxForm`, `parseMoney`, `BudgetDrawer`, `AddRentalPaymentModal`, the import CLI (`web/scripts/import/`), and any RPC that inserts amounts must store native minor units + currency instead of converting to USD cents. |
| **Every read/aggregate path** | Splits (`splits.ts`), balances (`balances.ts`), insights (`insights.ts`), dashboard ranges, budgets, housing net-rental, and every aggregate RPC assume a single additive USD-cent unit. Summing across currencies is undefined without a conversion policy — each aggregate must decide: same-currency only, or convert-at-display with a visible marker. |
| **The vector harness** | `shared/test-vectors/*.json` + `gen-vectors.ts` encode "integer USD cents everywhere" as a determinism rule (`docs/shared.md` §7). `currency.json`, `transaction-splits.json`, `member-balance.json`, `insights.json` all assume USD-cent inputs. A native-currency model needs new vectors (per-currency minor units, mixed-currency aggregation cases) and a rewrite of the "integer cents everywhere" convention. |
| **iOS/CLI parity** | The frozen native app's DTOs and the CLI's USD-cents assumption (`PARITY.md`) both encode the invariant; the CLI at minimum must move in lockstep. |

**Summary:** the *decision* is cheap; option (b) is a money-layer-wide change touching schema,
an inherently lossy migration, ~every read and write, and the regression harness that pins them.

## 6. The "silent in-between" — explicitly rejected

A tempting middle path is: keep storing USD cents but **also** store the rate-at-entry, and
reconstruct the native figure from `(cents, rate_at_entry)`. This is **not** a multi-currency
ledger and must not ship as if it were:

- It still stores USD cents, so it inherits the **rounding-through-USD** loss (¥1000 → ¥1001,
  CA$100.00 → CA$99.99) — a pinned rate does not undo a lossy snapshot.
- It stabilizes the *displayed* historical number only to the precision of that snapshot, and
  only if every read path uses `rate_at_entry` instead of the current rate — a change nearly as
  invasive as option (b) but delivering a *worse* model (lossy, and still can't represent JPY).
- It looks multi-currency in the UI while silently being single-currency underneath — the exact
  "silent in-between" the task says not to ship.

The honest fork is binary: **either USD-only (a), or store the native amount (b).** Storing a
rate alongside USD cents is the trap, not the compromise.

## 7. The research gate

The recommendation is **gated on one product question: is an international (non-USD) audience in
scope for launch?**

- **If no (US/USD-first launch):** option (a). Zero cost, zero correctness debt for the launch
  audience; revisit (b) when international is on the roadmap. This is the default assumption.
- **If yes (non-USD households at launch):** option (b) is mandatory and must be sequenced
  **before** the rest of the money layer is hardened, because it redefines "correct" for every
  stored amount — hardening on top of USD cents first would be rework.

There is no third answer that ships a non-USD audience on today's model.

## Verification

```text
$ cd web && npx tsx (against lib/finance/money.ts)
CAD groceries : toUSDCents(100,'cad',1.35)=7407 ; toDisplayAmount(7407,'cad',1.40)=103.7 ; @same(1.35)=99.99
JPY meal      : toUSDCents(1000,'jpy',150)=667  ; toDisplayAmount(667,'jpy',150)=1001    ; @155=1034
USD control   : toUSDCents(100,'usd',1.0)=10000 ; toDisplayAmount(10000,'usd',1.0)=100   (zero drift)
CAD category  : [100,250,37.55]->[7407,18519,2781]=28707 ; @1.35=387.54 ; @1.40=401.90
formatMoney(7407,'cad',1.40) = "CA$103.70"   formatMoney(7407,'cad',1.35) = "CA$99.99"
```

These exact numbers are pinned into the reproduction test (`web/test/multicurrency-instability.test.ts`)
and quoted in the recommendation.

## Decisions (Phase 0 resolved)

- **Decision:** Recommend **option (a) — scope launch to US/USD and defer** — *conditional on
  the research gate* (§7). Rationale: the correctness debt is exactly zero for a USD launch
  audience, option (b) is a money-layer-wide change with an inherently lossy migration, and the
  gating product question (international audience?) is unanswered — so the cheap, reversible,
  honest move is to launch USD-only with the currency picker constrained, and build (b) only
  when international is a committed goal. Do not ship the silent in-between.
- **Alternatives considered:** option (b) now (rejected as premature — large cost against an
  unconfirmed audience); the rate-at-entry in-between (rejected as lossy and dishonest, §6).
