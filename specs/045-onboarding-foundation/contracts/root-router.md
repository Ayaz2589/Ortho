# Contract: Root Router & Landing Routes

**Files**: `web/app/page.tsx` (modified), `web/app/landing/[locale]/page.tsx`,
`web/app/landing/page.tsx`, `web/app/not-found.tsx`,
`web/components/landing/LandingPlaceholder.tsx`

---

## 1. Root router — `app/page.tsx`

Replaces today's unconditional `router.replace('/dashboard')`.

### Decision order — normative

```
1. Capacitor.isNativePlatform()  ──true──►  /dashboard      (FR-004)
2. await supabase.auth.getUser() ──user──►  /dashboard      (FR-005)
3. otherwise                     ────────►  /landing/{detectLandingSlug(navigator.language)}
```

**Branch 1 is first and synchronous.** It must not await, must not read storage, and must not depend
on any value that can resolve late or fail. Two properties follow, and both are asserted:

- On native, `supabase.auth.getUser()` is **never called** — the installed app performs no extra
  launch round-trip.
- No possible ordering of async results can produce a landing page inside the installed app.

### Rendering during the decision

Renders a neutral holding state — never a landing page, never dashboard chrome (FR-007). Reuses the
app's existing holding treatment rather than introducing a new spinner. Concretely: the same
`null`/blank-background hold that `app/page.tsx` returns today, so nothing about the signed-in launch
experience changes visually.

### Navigation mechanism

`router.replace()` (client navigation), **not** `window.location`. Client navigations fetch segment
data rather than a document, so Capacitor's extensionless-path fallback documented in
`web/lib/nav.ts` does not apply. This feature introduces no hard navigation; `signInHref()`'s
`.html` special case remains the only place that concern lives.

`replace`, not `push` — the root must not become a back-button trap between marketing and the app.

### Test matrix (all required)

| Platform | Session | Browser lang | Expected | Also asserted |
|---|---|---|---|---|
| native | any | any | `/dashboard` | `getUser()` not called |
| native | signed-out | `es-ES` | `/dashboard` | no landing render at any point |
| web | signed-in | any | `/dashboard` | no landing render at any point |
| web | signed-out | `es-ES` | `/landing/es` | |
| web | signed-out | `fr-FR` | `/landing/en` | |
| web | signed-out | absent | `/landing/en` | |
| web | resolving | any | neither rendered | holding state shown |

---

## 2. Landing route — `app/landing/[locale]/page.tsx`

A **server component** — the codebase's first. Exists only to export static params and metadata; all
behavior lives in the client body beneath it.

```ts
export function generateStaticParams() {
  return landingSlugs().map((locale) => ({ locale }))
}

export const dynamicParams = false   // unknown slugs excluded at build

export function generateMetadata({ params }): Metadata
```

### `generateMetadata` output per locale

| Field | Value |
|---|---|
| `title`, `description` | From that locale's landing catalog — **in that language** (FR-021) |
| `alternates.canonical` | `landingUrl(slug)` |
| `alternates.languages` | All six `locale → landingUrl(slug)`, plus `'x-default' → landingUrl('en')` |
| `openGraph.locale` | The entry's BCP-47 locale |

`metadataBase` is set once in `app/layout.tsx` (research §2), not repeated per route.

### Requirements on the route

- **MUST NOT import** `@/lib/store` or any `@/lib/i18n/{bn,es,ja,zh,ko}` app catalog (FR-012 and the
  first-paint constraint). Pinned by a module-graph test.
- **MUST statically import** its landing catalog through a slug-keyed map, so text is correct on
  first paint with no post-mount swap (FR-009).
- The rendered document's `lang` attribute MUST be the entry's BCP-47 locale, not the app default.
- Ships as a placeholder (FR-010) — wordmark plus one localized holding line. **No CTA, no sign-in
  link**; those arrive with 046.

### Build output

`next build` MUST emit six landing documents. Verified in quickstart by listing `web/out/landing/`.

---

## 3. Bare `/landing` — `app/landing/page.tsx`

Client route. On mount, `router.replace('/landing/' + detectLandingSlug(navigator.language))`.
Renders the same neutral holding state meanwhile. Never renders content of its own (FR-011).

---

## 4. Unknown slug recovery — `app/not-found.tsx`

The codebase's first not-found route. Two behaviors, strictly separated:

| Path | Behavior |
|---|---|
| begins `/landing/` | `router.replace('/landing/' + detectLandingSlug(...))` — a stale ad link recovers instead of dead-ending (FR-011) |
| anything else | Renders an ordinary calm not-found page with a single link back |

**The scoping is the point.** A global redirect-to-marketing would throw a signed-in user out of the
app on a mistyped in-app URL. Both branches are pinned by tests, including the negative case
(`/transactions/typo` must **not** redirect to marketing).

Per Constitution Principle IV the page is short and never alarmist — no red, no error chrome, no
apology. It must not import `lib/store`.

---

## 5. Shared placeholder — `components/landing/LandingPlaceholder.tsx`

Client component, the single file feature 046 replaces.

```tsx
export function LandingPlaceholder(props: {
  locale: LandingLocale
  copy: LandingCatalog      // statically supplied by the route
}): JSX.Element
```

- Renders the wordmark treatment from `app/sign-in/page.tsx` and one localized line. Tokens only.
- No interactive controls in this feature — so no focus/hover states to get wrong yet.
- Content capped and centered like every other reading-column screen (Constitution III).
- No `lib/store`, no app catalog, no network.
