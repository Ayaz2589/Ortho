# Contract — Code-Split Boundaries & Loading/Error Fallback

The internal "interface" this feature exposes is the set of `next/dynamic` seams and the guarantees at
each seam. This is what tests assert against.

## Seam contract (per deferred region)

For every deferred region in `data-model.md §1`:

1. **Eager shell renders synchronously.** The parent module renders its non-deferred content without
   awaiting the dynamic import. For the chart cards, that content includes the money figures/legend.
   - *Test*: render the parent; assert the figures/shell are present immediately (no `await`).

2. **Deferred module loads via `next/dynamic({ ssr: false })`.** The static import of the heavy code
   exists ONLY inside the deferred module (for charts: only in `components/**/charts/*`).
   - *Test (guard)*: no eager module under `components/dashboard|housing` contains
     `from 'recharts'`; only the `charts/*` leaves do.

3. **Loaded region matches today.** After the import resolves, the region renders the same accessible
   DOM/behavior as the current app.
   - *Test*: `await findBy…` the region's content; assert the same roles/labels/values as before.

4. **No layout shift.** The `loading` placeholder reserves the region's space so the money figures do
   not move when it appears (FR-011).

5. **Graceful failure.** If the chunk fails to load, the surrounding screen stays usable and the money
   figures remain visible (FR-010). (Next renders the `loading` state; a persistent failure must not
   throw past an error boundary that blanks the screen — if needed, wrap the dynamic region so a
   failure degrades to the placeholder/empty region, never a full-screen crash.)

6. **Form-factor exclusivity.** A mobile/iOS session must not download the `*Desktop` chunk; a desktop
   session must not download the mobile-only composition chunk (FR-008). The synchronous
   `useIsExpanded()` decision is preserved so the correct branch is chosen before paint (FR-009).

## Static-export invariants (apply to all seams)

- Every seam uses `ssr: false` (no build-time render of browser-only code).
- No seam introduces a server route, server action, middleware, or server data.
- `next build` (`output: 'export'`) still succeeds and emits the deferred modules as static chunks
  under `out/_next/static/chunks/`.

## Non-goals at these seams

- No change to what any region computes or displays.
- No new design token, color, copy, or shadow in placeholders.
- No prefetch/preload tuning beyond Next's defaults (possible fast-follow).
