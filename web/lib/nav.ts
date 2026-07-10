import { Capacitor } from '@capacitor/core'

/**
 * spec 021 — target for the signed-out redirect / sign-out hard navigation.
 *
 * Capacitor's iOS asset router (`CapacitorRouter.route(for:)`) serves the root
 * `index.html` for ANY path with no file extension — its SPA fallback. A hard
 * `window.location` navigation to `/sign-in` therefore never loads the exported
 * `sign-in.html`: the router re-serves `index.html`, whose client redirect
 * (`app/page.tsx`) sends the app straight to `/dashboard`, whose bootstrap finds
 * no session and hard-navigates back to `/sign-in` — an infinite reload loop on
 * a signed-out launch. Pointing the native build at the exported file itself
 * (`/sign-in.html`, which HAS an extension) makes the router serve it directly.
 *
 * A trailing slash does NOT help — `/sign-in/` is still extensionless and hits
 * the same fallback. Only the `.html` file path is served verbatim.
 *
 * On web the flat file is served at the clean `/sign-in` by every static host,
 * so keep the pretty URL there. Client-side `router` navigations are unaffected
 * (they fetch the `.txt` segment data, never a full document), so this only
 * governs the three hard `window.location` sign-out/gate navigations.
 */
export function signInHref(): string {
  return Capacitor.isNativePlatform() ? '/sign-in.html' : '/sign-in'
}
