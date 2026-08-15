/**
 * spec 045 US3 — carry a landing page's language into the rest of the journey.
 *
 * Without this, the language-specific entry points would be cosmetic: a visitor reads
 * a Spanish page and is then handed an English sign-in form and an English app. Writing
 * the app's EXISTING `language` key means the sign-in screen and the app both follow
 * with no new mechanism — app/sign-in/page.tsx and the store already read it.
 *
 * Called ONLY on an explicit continue action, never on page view (FR-014): a returning
 * visitor who opens a shared link in another language keeps their own preference unless
 * they choose to go on. Feature 046 wires this to the real CTAs.
 */

import { localeForSlug } from './locales'

export function adoptLandingLanguage(slug: string): void {
  const entry = localeForSlug(slug)
  // Unknown slug: write nothing rather than guessing. Overwriting a real preference
  // with a fallback would be worse than leaving it alone.
  if (!entry) return
  try {
    // The `Language` value ('Español'), never the slug ('es') — asLanguage() would
    // silently reduce an unrecognized slug to the default, discarding the choice.
    localStorage.setItem('language', entry.language)
  } catch {
    // Storage unavailable (private mode / disabled). Navigation must continue
    // regardless; the visitor simply gets the default language (FR-015).
  }
}
