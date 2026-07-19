# NYC Market & Language Analysis — Ortho in the Five Boroughs

**Purpose.** Ortho's primary launch market is New York City and its boroughs, with
multi-language support intended as a first-class differentiator. This report sizes that
market with verified public data: budgeting-relevant adoption barriers across NYC's
population and ethnic communities, limited-English-proficiency (LEP) language demand by
borough measured against Ortho's shipped six languages, NYC money-pressure trends
(rent burden, banking status, remittances), and a synthesis of which segments, boroughs,
and languages are the strongest beachheads — plus the product gaps the data exposes.

**Scope & date.** Compiled **2026-07-19** by a two-stage research harness: (a) six parallel
code readers built a product map of Ortho as shipped (languages, currencies, housing,
banking, onboarding, backlog); (b) a deep-research pipeline fanned out 5 search angles,
fetched 22 sources, extracted 110 candidate claims, and adversarially verified 25 of them
with 3 independent votes each — **all 25 survived 3–0; none were refuted**. Read alongside
[finance-habits-budgeting-apps.md](../finance-habits-budgeting-apps.md) (US-national money
behavior; zero NYC data — this doc is its NYC complement) and the
[competitive analyses](../competetive-analysis/) (Plaid, SimpleFIN).

**Confidence tags.** `VERIFIED` = survived 3-vote adversarial verification against primary
sources (citations inline) · `REPO` = fact read directly from Ortho's code/docs by the
product-map readers (file paths inline) · `ORTHO` = synthesis/recommendation by this
report, not a sourced claim · ⚠️ = known context or vendor claim this research did **not**
verify — treat as a lead, not a fact.

> **One-line takeaway.** NYC hands Ortho a rare, data-verified alignment: ~2M LEP
> residents, and 70–75% of the foreign-born among them speak just four languages —
> Spanish, Chinese, Russian, Bangla — of which Ortho already ships three, including a
> Bengali catalog + ৳ taka display currency almost no US fintech offers; **Queens is the
> cleanest beachhead** (highest LEP rate *and* count), manual entry is **load-bearing**
> (~1 in 5 NY *State* households unbanked/underbanked — NYC likely at or above —
> trust/privacy documented as core barriers), and the two sharpest to-dos are **add
> Russian** (#3 LEP language, nearly 2× Bengali, missing) and **translate the 38
> untranslated strings** sitting on exactly the features NYC marketing would demo (bank
> connect, sync, scan).

---

## 1. Executive summary (decision-relevant findings)

1. **The multilingual market is ~2M people.** 1,867,350 NYC residents 5+ are LEP (23.3%,
   2024 ACS); 3,038,550 residents (38%) are foreign-born; 491,443 households (14.5%) are
   linguistically isolated — no member 14+ speaks English very well. A "household nobody
   markets to in their language" is Ortho's natural unit. `VERIFIED` (§3)
2. **Four languages cover 70–75% of foreign-born LEP New Yorkers: Spanish, Chinese,
   Russian, Bangla — Ortho ships three of the four.** Spanish (~857K LEP speakers) and
   Chinese (~331K) are the top two by a wide margin. `VERIFIED` (§4)
3. **Russian is the single largest language gap** (~108K LEP speakers, #3 citywide,
   nearly 2× Bengali), followed by Haitian Creole (~39K). Ortho's Bengali (#4) and Korean
   (#5) are well-chosen; **Japanese ranks ~18th (~10K) and adds almost nothing in
   NYC**. `VERIFIED` (§4)
4. **Queens is the beachhead borough** — 1st of 5 on both LEP rate (29.6%) and LEP count
   (650,378, 2024 ACS), and per the verified finding's own synthesis it is "the cleaner
   beachhead for the current six languages." Brooklyn is #2 by volume but skews toward
   languages Ortho lacks (Russian, Haitian Creole, Yiddish) ⚠️; the Bronx is a
   Spanish-first secondary (18.5% of households linguistically isolated, highest
   share). `VERIFIED` (§5)
5. **Manual entry is load-bearing, not a convenience.** ~1 in 5 NY **State** households is
   unbanked (5.9%) or underbanked (12.9%) — NYC-specific rates unverified but likely at or
   above (§6); these users cannot or only partially can use bank sync. Ortho's
   no-bank-link core loop (manual entry + receipt/statement scan + splits) is a
   structural fit. `VERIFIED` (§6)
6. **Trust and privacy are documented adoption barriers, validating the privacy-forward
   stance.** Among unbanked respondents, 34.1% cited privacy and 33% distrust of banks;
   distrust is the *rising* #2 main reason nationally (13.2% → 15.7%). `VERIFIED` (§6)
7. **Banking uptake dictates a two-track go-to-market.** Chinese-speaking households are
   the strongest bank-sync segment (95% banked in the NYC DCA immigrant study); Latin
   American segments need cash/manual-first onboarding (65% Ecuadorian / 43% Mexican banked
   in the same study, 2011-12 fieldwork ⚠️ vintage; nationally Hispanic households are 5×
   the White unbanked rate and 7× as likely to be cash-only unbanked, 2023). `VERIFIED` (§6)
8. **In-language financial services are a documented gap Bengali directly addresses:** ~4
   in 10 Bengali speakers in Queens reported banks fail to serve their primary language.
   Caveat: language access is necessary but not sufficient — 90% of Spanish speakers had
   in-language bank services yet 40% remained unbanked. `VERIFIED` (medium confidence) (§7)
9. **Immigrant money pressure validates the rent/housing module:** median foreign-born
   income $42,820 vs $61,171 US-born; ~52% of immigrant households rent-burdened (23%) or
   extremely rent-burdened (29%, >50% of income); ~10% of immigrant families overcrowded —
   a proxy for the shared households Ortho's splits/settle-up serve. Note the aggregate
   immigrant-vs-US-born burden gap is modest — the sharp segmentation axis is non-citizen
   status (>39% vs ~29%). `VERIFIED` (§8)
10. **Remittances are the clearest product gap:** 16.1% of foreign-born noncitizen
    households send/receive *nonbank* international remittances vs 1.0% of US-born (>10×;
    national figures). No Ortho feature models remittances as a first-class budget line
    today. `VERIFIED` (medium confidence) (§9)

---

## 2. What Ortho brings to this market today — `REPO`

The product map (read from code 2026-07-19) against NYC's shape:

| Ortho as shipped | NYC fit |
|---|---|
| **6 languages, full-UI**: English + Spanish, Simplified Chinese, Bengali, Korean, Japanese (`web/lib/i18n/`; 5 catalogs × 437 keys in perfect parity — verified by inspection; the test suite enforces key reachability and placeholder parity but **not** cross-catalog key-set parity, which is how the 38-string gap accumulated — see §10 P0 #1). Auto-detected from the browser (`effectiveLanguage()`, `web/lib/i18n/index.ts`) — even the sign-in page is translated. | Covers 3 of the 4 languages spoken by 70–75% of foreign-born LEP New Yorkers (§4). Bengali is nearly unheard-of in US consumer fintech. |
| **7 display currencies** incl. **BDT (৳)** and CNY over a USD-cents ledger (`web/lib/finance/currency.ts`); live daily FX, render-time only. | An immigrant household can read US spending in home-country units. Display lens only — not remittance tracking (§9). |
| **No bank link required**: manual entry, receipt scan (iOS camera OCR), PDF statement scan (web), deterministic CLI import. Bank sync (SimpleFIN, spec 028) is opt-in and buried in Settings. | Structural fit for the ~1 in 5 unbanked/underbanked households and bank-averse users (§6). |
| **Privacy architecture**: read-only SimpleFIN protocol, bank credentials never touch Ortho, secrets in Supabase Vault unreachable by the client anon key, RLS on every table (`docs/supabase.md` §6). | Directly answers the documented trust/privacy barrier (§6). |
| **Housing module**: renter (lease countdown, rent-due day, 60-day renewal banner, manual rent-payment log), homeowner (amortization, equity), small landlord (per-unit rent/occupancy, net rental vs mortgage) — `web/lib/finance/mortgage.ts`, `housing.ts`, `web/components/housing/lease.ts`. | Maps to a majority-renter city ⚠️ (renter share unverified by this research — §11) and outer-borough 2-4-family landlords. Today a snapshot, not an operating tool (§8). |
| **Two-person household model**: per-person splits, settle-up balances, account-less "local people" on the roster. | Fits couples and two-adult households; in tension with NYC's multigenerational / 3+-roommate reality (§8). |
| **31-day trial → Stripe subscription; no free tier.** SimpleFIN Bridge adds $1.50/mo *user-paid* for sync. | Price sensitivity is real in the target segments; "insufficient money" is the #1 unbanked reason (§6). |

Known product-side constraints that shape marketing claims (`REPO`): **38 untranslated
strings** covering the SimpleFIN connect/sync flow, the scan flow, and the unlock prompt
(English-only in all 5 catalogs); no partner-invite UI shipped (two-login couples cannot
join one household yet — `pending_invites` exists in the DB only); insight-card amounts
hardcoded USD even in BDT/CNY display mode; no Android app (responsive web is the
fallback); no Traditional Chinese (zh-TW browsers silently get Simplified); no RTL
(blocks Arabic/Urdu/Yiddish); the SimpleFIN Bridge signup itself is an external,
English-only site — an untranslated wall at exactly the bank-connect step. Additional
gating facts for a sync-led motion: **SimpleFIN has never been validated against a live
Bridge account** (the parser is pinned to spec fixtures; the manual quickstart is
pending), and **daily scheduled sync is unwired** — synced data updates only via the
manual "Refresh now" (rate-limited 1/hr). Also: the 7 display currencies include **no
MXN, DOP, or HTG** despite the Dominican Republic and Mexico being top origin countries
(§3) — taka/yuan is the only remittance-corridor pairing that exists today; Bengali
deliberately renders **Latin digits**, not Bengali numerals (`bn-BD-u-nu-latn`, inherited
from iOS — worth validating with Bengali-speaking users before leaning on the
differentiator); synced transactions get crude default categorization (unmatched expenses
→ `entertainment`); and the product map found no public production URL or App Store
listing, so current public acquirability is an assumption to confirm.

---

## 3. Market size: the multilingual NYC opportunity — `VERIFIED`

- **1,867,350 LEP residents age 5+ — 23.3% of the city** (ACS 2024 1-year, replicated
  digit-for-digit from Census tables C16001/B16002 via CCC). MOIA rounds this to "roughly
  two million… more than twenty-two percent." [MOIA-2024], [MOIA-2023], [CCC]
- **3,038,550 foreign-born residents — 38% of the city** (2023 ACS); 60% of New Yorkers
  are immigrants or children of immigrants. Top origin countries: Dominican Republic,
  China, Jamaica, Mexico. [MOIA-2024]
- **491,443 households (14.5%) are linguistically isolated** — no member 14+ speaks
  English very well. For a *household* budgeting app, this is the sharpest single measure
  of the underserved market: an entire household that no English-first finance product
  reaches. [CCC]
- ~4M New Yorkers speak a non-English language at home. [Advocate]

`ORTHO` — Sizing intuition: if even 1% of LEP households (≈4,900) became subscribing
households, that would likely exceed any plausible early-stage target; the market is not
the constraint — reach, trust, and product fit are.

---

## 4. Language demand vs Ortho's lineup — `VERIFIED`

**The concentration result.** "Almost 75% of foreign-born individuals with limited English
proficiency speak four languages: Spanish, a dialect of Chinese (primarily Mandarin or
Cantonese), Russian, or Bangla." [MOIA-2024] (MOIA-2023 gives ~70% for the same four.)
Ortho ships three of the four.

**Citywide LEP speakers by language** (NYC Open Data `ajin-gkbp`, ACS 2015-2019; SoQL
aggregation independently re-run by verifiers). Rankings are stable across newer vintages
and match the Local Law 30 designated-language list; absolute counts have drifted since
2019 ⚠️.

| Rank | Language | LEP speakers | Ortho status |
|---|---|---|---|
| 1 | Spanish | 856,530 | ✅ shipped (`es`) |
| 2 | Chinese (Mandarin/Cantonese) | 330,921 | ✅ shipped — **Simplified only**; zh-TW/zh-Hant browsers silently get Simplified (`REPO`) |
| 3 | **Russian** | **108,237** | ❌ **largest gap — nearly 2× Bengali** |
| 4 | Bengali | 59,237 | ✅ shipped (`bn`) — rare in US fintech; pairs with ৳ BDT display currency |
| 5 | Korean | 40,331 | ✅ shipped (`ko`) |
| 6 | Haitian Creole | 39,008 | ❌ gap (Brooklyn-concentrated) |
| 7 | Yiddish | 30,964 | ❌ gap (RTL script — engine work, not just a catalog; `REPO`) |
| 8 | Arabic | 28,803 | ❌ gap (RTL — same) |
| ~18 | Japanese | 9,993 | ✅ shipped (`ja`) — **~no NYC value**; absent from every citywide top-language list |

Corroboration: Local Law 30's citywide designated languages are Spanish, Chinese, Russian,
Bengali, Haitian-Creole, Korean, Arabic, Urdu, French, Polish [LL30]; the Public
Advocate's top list is "Spanish, Chinese, Russian, French Creole, Bengali, Yiddish,
French, Italian, Korean" [Advocate]. Japanese appears on neither.

**Cost of closing the gap** (`REPO`): adding a language is deliberately cheap — one
hand-written TS catalog (~475 strings incl. the 38 currently missing), 4 small list edits,
zero infra; the i18n test suite (reachability, placeholder parity, no-eager-import)
guards it automatically. Russian has no RTL or plural-engine blocker at the catalog level
⚠️ (Russian plural forms are richer than English; the current positional-`{0}`-only system
has no plural rules — acceptable for Ortho's mostly count-free strings, worth a native
review). Haitian Creole is likewise Latin-script/mechanical. Arabic/Yiddish/Urdu are
**not** cheap: no RTL support exists and `<html lang>` is hardcoded `"en"`
(`web/app/layout.tsx`).

---

## 5. Borough beachheads — `VERIFIED`

**LEP population by borough** (`ajin-gkbp`, ACS 2015-2019) with 2024-vintage rates where
verified:

| Borough | LEP residents | Notes |
|---|---|---|
| **Queens** | 622,117 | **1st on both measures in 2024 ACS: 29.6% LEP rate, 650,378 people** (`VERIFIED`). Per the verified finding's synthesis, "the cleaner beachhead for the current six languages"; the specific per-language concentration (Spanish/Chinese/Bengali/Korean) is `ORTHO` inference ⚠️. |
| Brooklyn | 527,342 | Most LEP **households** in absolute terms (154,105) (`VERIFIED`). ⚠️ Mix skews toward languages Ortho lacks — Russian, Haitian Creole, Yiddish (caveat carried in the finding's evidence, not itself a voted claim). |
| Bronx | 350,412 | Highest **share** of linguistically isolated households (18.5%) — a Spanish-first secondary target (`VERIFIED`). |
| Manhattan | 227,828 | Lowest LEP rates (13.0% individuals, 8.7% households) (`VERIFIED`). |
| Staten Island | 50,172 | Smallest on every measure (`VERIFIED`). |

Queens + Brooklyn also hold the highest concentration of immigrants and >60% of the
city's undocumented residents. [MOIA-2023]

`ORTHO` — **Beachhead call: Queens first.** Highest rate *and* count, and — decisively —
its dominant LEP languages are the ones Ortho already ships. Jackson Heights / Elmhurst /
Corona (Spanish, Bengali), Flushing (Chinese, Korean), Richmond Hill / Jamaica round out
the target neighborhoods ⚠️ (neighborhood-level language mix not independently verified —
directionally consistent with the community-district dataset). Brooklyn becomes the #2
play *after* Russian and Haitian Creole catalogs ship (Brighton Beach; Flatbush). The
Bronx is a Spanish-only motion runnable today.

---

## 6. Banking status, trust, and the two-track go-to-market — `VERIFIED`

**Scale of the outside-banking market.** New York State, FDIC 2021 via NYDFS: **5.9%
unbanked (452,471 households) + 12.9% underbanked (989,301) — 18.8% combined**, roughly 1
in 5 households. [NYDFS] Nationally, 4.2% unbanked in 2023 (~5.6M households), down from
the 8.2% peak (2011). [FDIC-2023] ⚠️ State figures, not NYC-specific; NYC's
immigrant-heavy demographics likely sit at or above the state average (a 2025 DCWP brief
reporting ~238,900 unbanked NYC households was fetched but did not survive verification —
see §11).

**Why they're outside — trust and privacy, not just cost.**
- 34.1% of unbanked respondents cited "avoiding a bank gives more privacy"; 33% "don't
  trust banks." [NYDFS]
- Nationally 2023: distrust is the **second-most-cited main reason** for being unbanked
  (15.7%, after minimum-balance cost at 23.3%) and **rising** (13.2% → 15.7%); among
  unbanked households *uninterested* in ever having an account, 37.9% cite privacy.
  [FDIC-2023]
- Positioning caveat (`VERIFIED`): "insufficient money" remains the #1 reason — privacy
  positioning addresses the strongest *secondary* motive, not the primary one.

**Segment variation → two tracks.**
- **Chinese-speaking households: the strongest bank-sync beachhead.** 95% of Chinese
  immigrants surveyed held bank accounts — attributed partly to in-neighborhood
  Chinese-American banks. [NYDFS, citing the 2013 NYC DCA Immigrant Financial Services
  Study; fieldwork 2011-12 ⚠️ treat as a historical anchor]
- **Latin American segments: cash/manual-first.** 65% of Ecuadorian and 43% of Mexican
  immigrants banked in the same study ⚠️ (same vintage). The direction persists in current
  national data: Hispanic households unbanked at 9.5% (vs 1.9% White — 5×), 33.4% of all
  unbanked households while 14.8% of households, and **7× as likely as White households to
  be cash-only unbanked**; Black households unbanked at 10.6%, 32.3% of the unbanked.
  Disparities persist at every income level. [FDIC-2023]

`ORTHO` — Go-to-market implication: **lead with bank sync in Flushing; lead with
"works without a bank" in Corona.** Same app, two front doors: the SimpleFIN sync pitch
for high-banked segments, and manual-entry + receipt-scan + cash-friendly framing (splits,
budgets, goals all work unlinked — `REPO`) for cash-first segments. Three gates before
marketing the sync track (`REPO`): SimpleFIN has never been validated against a live
Bridge account (parser pinned to fixtures); daily scheduled sync is unwired (manual
1/hr refresh only); and whether SimpleFIN's MX-based coverage actually reaches the
community/ethnic banks these segments use is unknown (§11).

---

## 7. The in-language services gap — `VERIFIED` (medium confidence)

In Queens' South Asian communities, **~4 in 10 Bengali/Bangla speakers and ~7 in 10
Nepali/Tibetan speakers reported banks failed to "offer services in their primary
language."** Bengali is NYC's second-most-spoken Asian language. [NYDFS, presenting the
2015 NQFEN "Bridging the Gap" survey of Northwest Queens immigrants ⚠️ single decade-old
community survey, re-cited by DFS in 2023 as still relevant]

Two edges for Ortho:
- **Bengali full-UI support lands where a documented service gap exists** — and no
  mainstream US budgeting competitor ships it (`ORTHO`; competitor sweep in this research
  found none, but absence-of-evidence — treat as strong-but-unverified ⚠️).
- **Nepali/Tibetan (~9,124 Nepali speakers citywide) is an unserved niche** adjacent to the
  Bengali communities — cheap to add if the Himalayan community in Jackson Heights becomes
  a target (`ORTHO`).

The discipline: **language access is necessary but not sufficient** — 90% of Spanish
speakers had in-language bank services, yet 40% remained unbanked. [NYDFS] Localization
opens the door; trust, price, and cash-fit walk through it.

---

## 8. Money pressure: rent, income, shared households — `VERIFIED`

- **Income gap:** median foreign-born income **$42,820** vs **$61,171** US-born. [MOIA-2024]
- **Rent burden:** ~23% of immigrant households rent-burdened plus ~29% *extremely*
  rent-burdened (>50% of income on rent) — ~52% combined, consistent with the
  Comptroller's 51.9% citywide tenant figure (the 51.9% rides in the verified MOIA
  finding's evidence; the Comptroller reports themselves yielded no independently
  verified claims — §12). Burden concentrates on non-citizens: >39% of
  LPR/nonimmigrant/undocumented immigrants live in households paying 30%+ of income in
  rent, vs ~29% US-born-only and 25% naturalized. [MOIA-2024], [MOIA-2023]
- **Overcrowding:** ~10% of immigrant families live in overcrowded households vs 6%
  US-born — a direct proxy for the shared/multigenerational households that Ortho's
  per-person splits and settle-up serve. [MOIA-2024]

**Product mapping** (`REPO` + `ORTHO`):
- The **renter property kind** (rent-due countdown, lease-end countdown, renewal banner,
  manual rent-payment log usable as an informal proof-of-payment record) speaks directly
  to the high-burden tenant reality the verified figures above describe. Gaps that matter here: no roommate
  rent-splitting on the lease itself, no renter rent-affordability insight (the
  affordability rule is mortgage-only), rent payments don't flow into budgets/cashflow,
  and the renewal banner is a hard-coded 60-day constant while NYC notice windows are
  30/60/90 days by tenancy length — a cheap, NYC-resonant fix.
- The **two-person household cap** is the structural tension: overcrowding data says the
  target communities often run 3+ adult households. Splits math handles n people, but the
  product self-describes as two-person, and the partner-invite UI is unshipped.
- **Small-landlord fit** (2-4-family homes in Queens/Brooklyn/Bronx) is real but the
  module is a snapshot: landlords can't log per-unit rent collection, and "net balance" is
  P&I-only (no property tax/water/insurance). Market size for this segment went
  unverified (§11).

---

## 9. Remittances — the clearest product gap — `VERIFIED` (medium confidence)

**16.1% of foreign-born noncitizen households and 10.3% of foreign-born citizen households
sent or received nonbank international remittances in 2023, vs 1.0% of US-born (>10×).**
Unbanked households were nearly twice as likely as banked ones to use them (5.2% vs 2.7%).
[FDIC-2023, Table 4.2, verified digit-for-digit against the PDF] Figures are national ⚠️;
NYC's immigrant density implies the local share is at least as high.

`ORTHO` — For Ortho's exact target household, a remittance is a **recurring, material,
identity-laden budget line** — and today it has no home: no category (closest fallback is
the generic expense set), no recurring recognition tuned to it, no home-currency framing
despite BDT/CNY display currencies existing. A first-class "Family support / remittance"
category — even display-only, no money movement — would let the app *see* the line item
that distinguishes its beachhead households, and pairs naturally with the taka/yuan
display lens. Note the corridor mismatch, though: for the top origin countries (§3) the
display-currency list has **no DOP, MXN, or HTG** (`REPO`), so the pairing exists only
for the Bangladeshi/Chinese corridors today. This also feeds `docs/future_tasks` §9.2
seed profiles: realistic NYC demo households should carry a remittance line.

---

## 10. Recommendations — `ORTHO`

Ranked; "cheap" claims are grounded in the repo map (§2, §4).

**P0 — before any NYC marketing motion**
1. **Translate the 38 missing strings** (SimpleFIN connect/sync, scan flow, unlock
   prompt) in all 5 catalogs. They sit on exactly the features a NYC demo leads with; an
   in-language demo that goes English at the bank-connect step undercuts the first-class
   claim. Add the reverse-direction i18n test (every `t()` key exists in every catalog) so
   gaps can't silently accumulate again.
2. **Prove the sync track end-to-end before marketing it**: validate a live SimpleFIN
   Bridge connection (the parser has only ever seen spec fixtures — `REPO`), wire the
   scheduled daily sync (today data moves only on manual 1/hr refresh — `REPO`), and
   verify SimpleFIN/MX coverage of NYC community banks (the in-neighborhood
   Chinese-American banks behind the 95%-banked figure; Municipal Credit Union; the banks
   Bengali/Korean communities actually use). If sync fails precisely where the
   bank-sync-ready segment banks, the two-track GTM (§6) collapses to one track.

**P1 — market-driven language expansion**
3. **Ship Russian** (`ru`). #3 LEP language, ~108K speakers, nearly 2× Bengali. No RTL
   blocker, but not quite "zero infra": the positional-`{0}` i18n system has no plural
   rules, and several catalog strings are count-bearing ("{0} rows found", "Day {0} of
   {1}") — Russian's plural system needs a native-speaker review of exactly those
   strings ⚠️. If the review passes, it stays a catalog-level task, not engine work.
   Unlocks Brighton Beach/South Brooklyn and turns Brooklyn from a mismatched borough
   into a second beachhead.
4. **Ship Haitian Creole** (`ht`). ~39K LEP speakers, Flatbush-concentrated, Latin-script
   mechanical add; almost certainly zero competitor coverage.
5. **Decide the Traditional Chinese question.** zh-TW/zh-Hant browsers silently get
   Simplified today — either ship `zh-Hant` or at minimum make the fallback deliberate for
   older Cantonese-speaking communities in Manhattan Chinatown/Sunset Park/Flushing.
6. Fix `<html lang>` (hardcoded `"en"`) and consider syncing language/currency prefs to
   the account rather than per-device localStorage.

**P2 — product gaps the data exposes**
7. **Remittance as a first-class budget line** (§9) — category + recurring recognition +
   home-currency framing; feeds marketing screenshots and `docs/future_tasks` §9.2 seed
   profiles. Pair with **adding MXN and DOP display currencies** — display currencies are
   FX-driven render-time additions (`REPO`), so covering the Dominican and Mexican
   corridors (top origin countries, §3) is near-free and closes the gap where the
   largest Spanish-speaking segment currently gets no home-currency lens at all.
8. **Renter parity in insights**: a rent-affordability insight (the 30%/50% burden
   thresholds from §8 are the obvious calibration) to match the mortgage-only rule; make
   the lease-renewal banner tenure-aware (30/60/90-day NYC notice windows).
9. **Ship the partner-invite UI** — two-login couples are the product's own stated core
   user, and NYC's shared-household data (§8) only sharpens it. Revisit the two-person cap
   with eyes open: it is a thesis decision (`docs/future_tasks` §6.1 ⚠️), but NYC's
   household shapes will keep pressing on it.
10. **Android** (backlog §8.1, "nearly free" post-Capacitor): the responsive web app is
    the only Android answer today ⚠️ (the common claim that lower-income/immigrant
    segments skew Android was not verified by this research — check before spending here).
11. **Fix USD-hardcoded insight amounts** so a ৳/¥ display user gets a fully coherent
    in-currency experience — small, but it's the exact polish the differentiator story
    rests on.

**Marketing framing that the data supports** (`VERIFIED` basis, `ORTHO` framing):
privacy-first with receipts ("read-only access; Ortho never sees your bank login;
works with no bank at all") aimed at the documented trust barrier; two front doors per
§6; "budget in your language, read it in taka/yuan" for the language+currency pairing;
calm/non-shaming tone for a city where ~52% of immigrant households are rent-burdened
(§8). Price framing needs
care: no free tier + $1.50/mo user-paid Bridge fee is a double subscription pitched at
segments where "insufficient money" is the #1 barrier — the 31-day full-featured trial
and the zero-cost manual mode carry that conversation.

---

## 11. What this research could NOT verify (honest gaps)

- **No direct budgeting-app adoption data by NYC segment was verified** — part 1 of the
  research question is answered via banking-status, trust, and language-access proxies,
  not app-usage surveys. (Open question: does app-store / Pew / aggregator data exist per
  ethnic community? One fetched lead — S&P Global's "one-third of Americans use three or
  more financial apps" research note — was not selected for verification; see §12.)
- **No NYC-specific unbanked rate was verified.** State (18.8% combined) and national
  figures anchor §6; a 2025 DCWP brief (~238,900 unbanked NYC households) was fetched but
  its claims were **not selected for the adversarial-verification round** (selection/
  budget limits — not refuted). Re-pull and verify it directly before quoting
  NYC-specific numbers.
- **Renter share by borough, small 2-4-unit landlord counts, and roommate/shared-finance
  behavior produced zero verified claims** — the housing/landlord module's NYC market
  size is unquantified here. (NYC HVS and Furman Center data were fetched but their
  claims were not selected for verification; the "majority-renter city" framing in §2 is
  common knowledge, not verified by this research.)
- **Vintage caveats:** the DCA immigrant banking study is 2011-12 fieldwork; the Queens
  South Asian language survey is 2015; the community-district language dataset is ACS
  2015-2019 (rankings stable, counts drifted). 2024-vintage figures are called out where
  used.
- **SimpleFIN institution coverage** for NYC community/ethnic banks is unknown (also
  flagged in the [SimpleFIN analysis](../competetive-analysis/simplefin-developer-analysis.md) §9).

---

## 12. Sources

Primary government/institutional (all claims above cite these):

- [MOIA-2024] NYC Mayor's Office of Immigrant Affairs, 2024 Annual Report —
  <https://www.nyc.gov/assets/immigrants/downloads/pdf/MOIA-2024-Annual-Report_4.4.25.pdf>
- [MOIA-2023] MOIA 2023 Annual Report —
  <https://www.nyc.gov/assets/immigrants/downloads/pdf/MOIA-Annual-Report-2023_Final.pdf>
- [ajin-gkbp] NYC Open Data, "Population and Languages of the Limited English Proficient
  Population" (ACS 2015-2019) —
  <https://data.cityofnewyork.us/City-Government/Population-and-Languages-of-the-Limited-English-Pr/ajin-gkbp>
- [CCC] Citizens' Committee for Children data portal (ACS 2024 1-year replication) —
  <https://data.cccnewyork.org/data/map/1256/limited-english-proficiency>
- [Advocate] NYC Public Advocate, Language Access Report —
  <https://advocate.nyc.gov/reports/language-access-report>
- [LL30] NYC Local Law 30 citywide language-access designations (FY2023 reports) —
  <https://www.nyc.gov/assets/immigrants/downloads/pdf/FY2023-local-law-30-reports.pdf>
- [NYDFS] NY Dept. of Financial Services, "Access to Financial Services in NYS" (May
  2023) —
  <https://www.dfs.ny.gov/reports_and_publications/other_reports/nydfs_access_to_financial_services_nys_202305>
- [FDIC-2023] FDIC National Survey of Unbanked and Underbanked Households, 2023 —
  <https://www.fdic.gov/household-survey/2023-fdic-national-survey-unbanked-and-underbanked-households-report>

Fetched, but no claims selected for the adversarial-verification round (selection/budget
limits, **not** refuted — leads for follow-up): NYC DCWP unbanked research brief (2023
data + 2025 update), NYC Comptroller banking-access and rental/homeowner-market
spotlights, NYC HVS 2023 initial findings, Furman Center State of the City, NYC DCA
Immigrant Financial Services full report (2013), S&P Global Market Intelligence
"one-third of Americans use three or more financial apps" (the one direct app-adoption
lead — feeds §11's first open question), plus competitive-landscape secondaries
(NerdWallet budget-app roundup, Honeydue review, YPA).

---

## 13. Method note

Two workflows on 2026-07-19. **Product map:** 6 parallel code readers (product framing,
i18n, money features, housing, banking/onboarding, backlog) over the repo at `main`
(`bb5c7cf`), each returning structured facts with file paths. **Deep research:** 5 search
angles → parallel web search → 22 sources fetched → 110 candidate claims extracted → 25
claims selected and adversarially verified with 3 independent votes each (a claim died on
2/3 refute votes) → **25/25 confirmed, 0 refuted** → semantic-dedup synthesis into the 10
findings cited here. Claims not selected for verification (85 of 110) are uncited leads,
not refuted facts. 104 agent runs (~916 tool calls per orchestrator telemetry).
Verification notes (SoQL re-runs, digit-for-digit PDF checks) are preserved in the
findings' evidence fields.
