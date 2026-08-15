# Quickstart: Per-Language Landing Pages (spec 046)

How to verify this feature actually works — the headless part, then the part a browser has to
answer. Steps marked **operator** cannot be automated in this environment and are the acceptance
gate for the feature.

Prerequisites: `cd web && npm ci`. No Supabase, no `.env.local`, no migration — this feature never
touches the data layer, which is itself one of its requirements (FR-007).

---

## 1. Headless — the suite

```bash
cd web
npm test                       # full suite; expect 275+ files green
npx vitest run test/onboarding test/i18n   # the suites this feature touches
npx tsc --noEmit               # must stay clean — a type error fails `next build`
```

**Expected**: everything green, including the four spec-045 suites this feature edits
(`landing-route`, `landing-index`, `root-router`, `landing-catalogs`).

The three highest-signal assertions, if you want to read only three:

| What | Where |
|---|---|
| Clicking either action adopts the language | `test/onboarding/landing-view.test.tsx` → "adopts … on click" |
| Merely rendering adopts nothing | same file → "writes nothing on view" |
| 047's catalog region is still empty and intact | `test/i18n/landing-catalogs.test.ts` → "reserved regions" |

---

## 2. Headless — the byte budget

The guard that keeps the funnel's catalogs from drifting toward the 32–55 KB app catalogs:

```bash
cd web && wc -c lib/i18n/landing/*.ts | tail -1
```

**Expected**: comfortably under 30,000 bytes total (the limit asserted by
`test/i18n/landing-catalogs.test.ts`). It was 6,303 before this feature.

If a future copy revision pushes this near the limit, that is a signal the page has too many words,
not that the limit is too low.

---

## 3. Headless — the static export really produced six documents

```bash
cd web && npm run build
ls out/landing/*.html            # en es bn ja zh ko
grep -o '<title>[^<]*</title>' out/landing/ja.html
# NOTE the -i: Next serializes the attribute as `hrefLang`, not `hreflang`.
# A case-sensitive grep silently reports 0 and looks like a missing-SEO bug.
grep -oi 'rel="alternate" hreflang' out/landing/ja.html | wc -l   # expect 7 (six + x-default)
grep -o 'href="/tour/[a-z]*"' out/landing/ko.html
grep -c 'ঘরের হিসাব, গোছানো।' out/landing/bn.html                   # headline in the STATIC html
```

**Expected**: six files; the Japanese title in Japanese; seven alternates; the Korean document's
primary action pointing at `/tour/ko`; and the Bengali headline present in the served HTML rather
than only after hydration. The last two are the whole feature in two greps — a statically served
page, already in its own language, linking to its own tour.

**Verified 2026-08-15 on this branch**: all six documents carry one `canonical` and seven
`rel="alternate"` entries, and `x-default` passes through Next's `alternates.languages` record
verbatim — which closes the open verification spec 045's research §2 deferred to a built-HTML check.

> `next build` reads `NEXT_PUBLIC_SITE_URL` for absolute URLs (spec 045 research §8). Without it the
> canonical/alternate hosts fall back to `http://localhost:3000`, which is fine for this check.

---

## 4. Operator — browser walkthrough

`npm run dev`, then:

1. **Open `/landing/es`.** The proposition, the primary action and the sign-in link are all visible
   **without scrolling** on a phone-sized viewport (375×667 in device emulation). The supporting
   points are below the fold — that is correct, not a bug.
2. **Watch the first frame.** Reload with the network throttled. Spanish must be the *first* thing
   painted. Any flash of English is a defect (FR-006 / SC-003) — it would mean the catalog stopped
   being statically imported.
3. **Clear `localStorage`, then open `/landing/ja` and just look at it.** In DevTools → Application →
   Local Storage, `language` must still be absent. Viewing changes nothing (FR-004).
4. **Now click the primary action.** `language` becomes `日本語`, and you land on `/tour/ja` — which
   until spec 047 merges is the calm not-found page. Expected, and worth confirming it is the calm
   page rather than a crash.
5. **Clear storage again, open `/landing/ko`, click the sign-in link.** `language` becomes `한국어`
   and the sign-in screen renders **in Korean**. This is the funnel's actual payoff — a campaign in
   one language handing over to a sign-in in that language.
6. **Set a language first, then visit another.** Set `language` to `Español` in the app, open
   `/landing/ja`, and read the page — it renders in Japanese but your stored preference stays
   `Español` until you act.
7. **Keyboard only.** From page load, Tab must reach the primary action first, then the sign-in
   link, each with a visible sand ring. Enter activates.
8. **Widths.** 320, 375, 768, 1440, 2560. Content stays capped and centered; the body never scrolls
   horizontally (SC-004). Check the longest locale (`bn`) most carefully — Bengali line-breaking is
   the likeliest place for an overflow.
9. **Both themes.** Settings → Appearance, or the OS toggle. Light and dark both correct; nothing
   red anywhere.
10. **Text size.** Settings → Text size → X-Large, then reload `/landing/bn`. The hero must still fit
    without the sign-in link falling off the bottom, and no double scrollbar (the failure mode PRs
    #104/#105 fixed elsewhere).
11. **Storage disabled.** In a private window with storage blocked, both actions must still
    navigate. Only the adoption is skipped.

---

## 5. Operator, macOS only — iOS shell

The installed app must never show a landing page. This feature adds the first *interactive* landing
surface, so it is worth re-confirming spec 045's guard still holds.

```bash
cd web && npm run build && npx cap sync ios
open ios/App/App.xcworkspace     # run on a simulator
```

**Expected**: the app opens on `/dashboard` (or `/sign-in` when signed out). No marketing page, no
"See how it works" button, ever. The headless equivalent — that the root router reaches `/dashboard`
without ever calling `getUser()` on native — is already pinned in `test/onboarding/root-router.test.tsx`.

---

## 6. Product-owner review — the copy

The one thing no test can judge.

Read all six catalogs' `landing` blocks. What ships is a strong English proposition faithfully
translated, making **only** claims this repository can support (see research §9 for the trace from
each claim to the shipped feature). Per-market positioning is deliberately not invented here.

To change one market's positioning, edit exactly one region:

```
web/lib/i18n/landing/{slug}.ts   between the `spec 046` markers
```

Nothing else — no component, no other locale, no test. If that is not true, SC-005 has regressed.
