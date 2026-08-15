# Quickstart: Onboarding Foundation (spec 045)

How to validate the feature end to end. Automated checks run anywhere; the browser and device steps
need a canvas a Linux sandbox does not have (see `docs/index.md`) and are marked **operator**.

---

## Prerequisites

```bash
cd web
npm install          # no new dependencies in this feature — should be a no-op
```

---

## 1. Automated suite

```bash
cd web
npx tsc --noEmit     # must be clean
npm test             # full suite; every 045 test green, zero pre-existing tests changed
npm run gen:vectors  # must produce NO git diff — this feature adds no money/date math
git diff --exit-code shared/test-vectors/
```

**Expected**: all green. If `gen:vectors` produces a diff, something touched the finance engines —
stop, because nothing in this feature should.

Targeted runs while working:

```bash
npm test -- test/onboarding          # registry, funnel, adoption, routers
npm test -- test/i18n/landing-catalogs.test.ts
npm test -- test/seo                 # robots + sitemap
```

---

## 2. The native guard — the highest-severity check

The single most important assertion in this feature: the installed iOS app must never show
marketing.

```bash
cd web
npm test -- test/onboarding/root-router.test.tsx
```

**Expected**: the native cases pass **and** assert that `supabase.auth.getUser()` was never called.
Destination alone is not sufficient — the ordering is the regression risk (contract:
`contracts/root-router.md` §1).

---

## 3. Static export output

```bash
cd web
npm run build
ls out/landing/*.html                # expect: en.html es.html bn.html ja.html zh.html ko.html
ls out/robots.txt out/sitemap.xml    # both must exist
```

**Expected**: six landing documents plus the two SEO files. If any are missing,
`generateStaticParams()` is not deriving from the registry.

> Note the layout: the export writes `out/landing/es.html` (plus a `es/` directory of segment
> data), not `out/landing/es/index.html`. Static hosts serve it at the clean `/landing/es`.

> `robots.ts` and `sitemap.ts` each need `export const dynamic = 'force-static'`. The
> static-exports guide says Route Handlers render statically but does not mention this opt-in;
> without it the build fails at "Collecting page data" with *export const dynamic =
> "force-static" … not configured on route "/robots.txt"*.

### Verify the metadata actually rendered

```bash
cd web
grep -oi 'hreflang="[^"]*"' out/landing/es.html | sort -u
grep -o '<link rel="canonical"[^>]*>' out/landing/es.html
grep -o '<title>[^<]*</title>' out/landing/es.html
```

**Expected**:
- Seven hreflang values: `en-US`, `es-ES`, `bn-BD-u-nu-latn`, `ja-JP`, `zh-Hans`, `ko-KR`, and
  **`x-default`**.
- Canonical pointing at `…/landing/es`.
- `<title>` in **Spanish**, not English.

> **Grep case-insensitively (`-i`).** Next emits React's camelCase attribute name —
> `hrefLang="x-default"` — into the static HTML. HTML attribute names are case-insensitive, so
> browsers and crawlers read it as `hreflang` and this is correct output, but a case-sensitive
> grep finds nothing and looks like a failure. (`x-default` turned out to work despite being
> undocumented — research §2's fallback was not needed.)

### Known limitation: the document `lang` attribute

```bash
grep -o '<html[^>]*lang="[^"]*"' out/landing/es.html   # shows lang="en"
```

Only the root layout renders `<html>`, and it is shared with the entire signed-in app, so every
exported file carries `lang="en"`. Mitigations in place: the content subtree carries the correct
`lang` (what assistive tech resolves against), and `LandingPlaceholder` sets
`document.documentElement.lang` on mount, so any real browser sees `es-ES`. A crawler that does not
execute JS still reads `en` from the static file; language targeting is carried by the hreflang
alternates, which are correct there.

A complete fix requires giving the landing routes their own root layout, which under the App Router
means moving every existing route into a route group. That is a larger restructure than this
feature should carry — worth doing if the landing pages ever become a significant organic channel.

### Verify the bundle stayed lean

```bash
cd web
grep -rl "Household finance, in order" out/landing/ | head        # placeholder copy present
grep -c "supabase" out/landing/es/index.html                      # expect 0 in the document
```

Then confirm the module graph directly:

```bash
npm test -- test/onboarding/landing-route.test.tsx
```

**Expected**: the test asserting the landing route's imports exclude `@/lib/store` and every app
catalog passes. A landing page pulling a 35 KB catalog or the Supabase data layer is a defect, not a
nit — it is the whole reason the funnel has its own catalogs.

---

## 4. Browser walkthrough — **operator**

```bash
cd web && npm run dev
```

| # | Action | Expected |
|---|---|---|
| 1 | Sign out. Set browser language to Spanish. Open `/`. | Lands on `/landing/es`, Spanish text, **no English flash at any point** |
| 2 | Set browser language to French. Open `/`. | Lands on `/landing/en` |
| 3 | Sign in. Open `/`. | Dashboard. No landing page visible at any moment, including mid-load |
| 4 | Signed in, open `/landing/ja` directly | Renders normally, in Japanese; **not** redirected away |
| 5 | Open `/landing` (no slug) | Forwards to the detected locale |
| 6 | Open `/landing/fr` (unknown slug) | Recovers to the detected locale — no dead end |
| 7 | Open `/transactions/nonsense` | Ordinary calm not-found page — **NOT** a redirect to marketing |
| 8 | Throttle to Slow 3G, reload `/` signed out | Neutral holding state, then the landing page. Never a flash of dashboard chrome first |
| 9 | Private/incognito window with storage blocked, open `/` | Routing still works; no console error |

Step 1's "no English flash" and step 3's "no landing at any moment" are the two that catch the
subtle failures. Watch the actual first frame, not the settled state.

---

## 5. iOS shell — **operator, macOS only**

A Linux sandbox cannot build iOS (`docs/index.md`). Either use a Mac or rely on
`.github/workflows/capacitor-ios-ci.yml`, which build-verifies on every `web/**` push.

```bash
cd web
npm run build && npx cap sync ios
npx cap open ios       # then run on a simulator
```

| # | Action | Expected |
|---|---|---|
| 1 | Launch the app signed out | Sign-in screen. **Never** a landing page |
| 2 | Launch signed in | Dashboard, exactly as before this feature |
| 3 | Set the device language to Spanish, relaunch | Still the app — device language must not route the installed app to marketing |

Step 3 is the one an implementer is most likely to break, by reading the language before checking
the platform.

---

## 6. Follow-on contract check

The reason this feature exists separately. Confirm 046/047/048 can proceed:

```bash
cd /Users/ayazuddin/Development/personal/Ortho
grep -c "spec 046" web/lib/i18n/landing/*.ts     # 2 markers per file → each file reports 1+
grep -rn "LANDING_LOCALES" web/ --include=*.ts --include=*.tsx | grep -v test | grep -v "locales.ts"
```

**Expected**: every landing catalog carries both empty marker pairs, and every consumer of the
locale list derives from `LANDING_LOCALES` rather than restating the six slugs (FR-002).

Simulate the parallel-merge guarantee:

```bash
git checkout -b tmp-046 && printf '' >> web/lib/i18n/landing/es.ts   # insert in the 046 region
git checkout -b tmp-047 main                                          # insert in the 047 region
# merge both — expect zero conflicts, then delete both temp branches
```

---

## 7. Operator tasks (not code)

- **Set `NEXT_PUBLIC_SITE_URL`** in the Vercel production environment to the marketing domain before
  submitting the entry points for indexing. Until then canonicals and the sitemap carry the Vercel
  deployment host — functional, but it would get the wrong domain indexed.
- **Decide the production domain** if one is not chosen yet. This is the only thing blocking the SEO
  surface from being genuinely useful.

---

## Done when

- [ ] `npx tsc --noEmit` clean; `npm test` green; `gen:vectors` no diff
- [ ] Native guard test asserts `getUser()` is never called on native
- [ ] `out/landing/` has six documents; `robots.txt` + `sitemap.xml` exist
- [ ] Built Spanish page: Spanish `<title>`, `lang="es-ES"`, canonical, seven `hreflang` incl. `x-default`
- [ ] Landing route's module graph excludes `lib/store` and all app catalogs
- [ ] Browser steps 1–9 pass (**operator**)
- [ ] iOS steps 1–3 pass (**operator, macOS**), or `capacitor-ios-ci.yml` green
- [ ] Both reserved regions present and empty in all six landing catalogs
